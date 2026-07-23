import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';
import { logCentralNotification } from '@/lib/notif-poll';
import { supabase } from '@/lib/supabase/client';
import { lookupResourceId } from '@/lib/supabase/resources';
import { dedupeOthers, minutesSince, formatDuration } from '@/lib/collision';
import { clampInt } from '@/lib/num';
import { createTicketNote, getTicketAssignedResourceId, getResourceName } from '@/lib/autotask';

const PRESENCE_TTL = 40;

function presenceKey(ticketId: string, user: string) {
  return `ticketpresence:${ticketId}:${user}`;
}

function extractUser(key: string, ticketId: string) {
  return key.replace(`ticketpresence:${ticketId}:`, '');
}

async function getAutotaskAssignee(ticketId: string): Promise<string | null> {
  const cacheKey = `ticketassigned:${ticketId}`;
  const cached = await redis.get<string>(cacheKey);
  if (cached !== null) return cached === '' ? null : cached;

  const resourceId = await getTicketAssignedResourceId(ticketId);
  if (!resourceId) { await redis.set(cacheKey, '', { ex: 300 }); return null; }

  const name = await getResourceName(resourceId);
  await redis.set(cacheKey, name ?? '', { ex: 300 });
  return name;
}

// Nota automática en Autotask — apagada por defecto (config:autotask_notes_enabled),
// ver comentario en src/lib/autotask.ts sobre por qué. Fire-and-forget: createTicketNote
// nunca lanza, así que un fallo de Autotask no puede romper la respuesta de colisión.
async function maybeCreateAutotaskNote(numericTicketId: string | null, title: string, description: string) {
  if (!numericTicketId) return;
  const enabled = await redis.get<string>('config:autotask_notes_enabled');
  if (enabled !== '1') return;
  createTicketNote(Number(numericTicketId), { title, description });
}

async function getWebhookUrl(): Promise<string | null> {
  return redis.get<string>('config:teams_webhook');
}

async function isWithinWorkHours(): Promise<boolean> {
  const raw = await redis.get<string>('config:work_hours');
  if (!raw) return true;
  try {
    const { start = 8, end = 18, tz = 'America/Santiago' } = JSON.parse(raw);
    const now = new Date();
    const hour = parseInt(new Intl.DateTimeFormat('en', { hour: 'numeric', hour12: false, timeZone: tz }).format(now));
    const dayName = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: tz }).format(now);
    const isWeekend = dayName === 'Sat' || dayName === 'Sun';
    return !isWeekend && hour >= start && hour < end;
  } catch { return true; }
}

function postWebhook(webhookUrl: string, body: object) {
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

async function sendTeamsWebhook(ticketDisplay: string, users: string[], ticketUrl?: string | null) {
  const webhookUrl = await getWebhookUrl();
  if (!webhookUrl) return;

  const first = users[0];
  const rest = users.slice(1);
  postWebhook(webhookUrl, {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: 'dc2626',
    summary: `⚠️ Colisión en ${ticketDisplay}`,
    sections: [{
      activityTitle: `⚠️ Colisión detectada`,
      activitySubtitle: `${ticketDisplay} · Autotask CoView`,
      activityImage: 'https://netsus-two.vercel.app/icon/128.png',
      facts: [
        { name: 'Ticket', value: ticketUrl ? `<a href="${ticketUrl}">${ticketDisplay}</a>` : ticketDisplay },
        { name: 'Llegó primero', value: first },
        ...(rest.length ? [{ name: rest.length === 1 ? 'Entró después' : 'Entraron después', value: rest.join(', ') }] : []),
        { name: 'Hora', value: new Date().toLocaleString('es-CL') },
      ],
      markdown: true,
    }],
    potentialAction: ticketUrl ? [{ '@type': 'OpenUri', name: 'Abrir ticket', targets: [{ os: 'default', uri: ticketUrl }] }] : undefined,
  });
}

async function sendPingWebhook(ticketDisplay: string, from: string, targets: string[], ticketUrl?: string | null) {
  const webhookUrl = await getWebhookUrl();
  if (!webhookUrl) return;

  postWebhook(webhookUrl, {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: 'f97316',
    summary: `📣 ${from} te está esperando`,
    sections: [{
      activityTitle: `📣 ${from} necesita que termines`,
      activitySubtitle: `${ticketDisplay} · Autotask CoView`,
      activityImage: 'https://netsus-two.vercel.app/icon/128.png',
      facts: [
        { name: 'Ticket', value: ticketUrl ? `<a href="${ticketUrl}">${ticketDisplay}</a>` : ticketDisplay },
        { name: 'Esperando a', value: targets.join(', ') },
        { name: 'Hora', value: new Date().toLocaleString('es-CL') },
      ],
      markdown: true,
    }],
    potentialAction: ticketUrl ? [{ '@type': 'OpenUri', name: 'Abrir ticket', targets: [{ os: 'default', uri: ticketUrl }] }] : undefined,
  });
}

async function sendResolutionWebhook(ticketDisplay: string, users: string[], durationMs: number, ticketUrl?: string | null) {
  const webhookUrl = await getWebhookUrl();
  if (!webhookUrl) return;

  const durStr = formatDuration(durationMs);

  postWebhook(webhookUrl, {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: '16a34a',
    summary: `✅ Colisión resuelta en ${ticketDisplay}`,
    sections: [{
      activityTitle: `✅ Colisión resuelta`,
      activitySubtitle: `${ticketDisplay} · Autotask CoView`,
      activityImage: 'https://netsus-two.vercel.app/icon/128.png',
      facts: [
        { name: 'Ticket', value: ticketUrl ? `<a href="${ticketUrl}">${ticketDisplay}</a>` : ticketDisplay },
        { name: 'Técnicos', value: users.join(', ') },
        { name: 'Duración', value: durStr },
        { name: 'Hora', value: new Date().toLocaleString('es-CL') },
      ],
      markdown: true,
    }],
    potentialAction: ticketUrl ? [{ '@type': 'OpenUri', name: 'Abrir ticket', targets: [{ os: 'default', uri: ticketUrl }] }] : undefined,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const keys = await redis.keys(`ticketpresence:${id}:*`);
  const users = keys.map(k => extractUser(k, id));
  return NextResponse.json({ users });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const { user, ticketNumber, ticketTitle, ticketUrl, ping, quickMsg, autotaskTicketId } = await request.json().catch(() => ({ user: 'Desconocido', ticketNumber: null, ticketTitle: null, ticketUrl: null, ping: null, quickMsg: null, autotaskTicketId: null }));

  const configTtl = await redis.get<string>('config:presence_ttl');
  const ttl = clampInt(configTtl, 15, 300, PRESENCE_TTL);
  await redis.set(presenceKey(id, user), '1', { ex: ttl });
  // nx: solo se fija la primera vez (conserva el momento real de llegada). El expire
  // aparte renueva el TTL en cada poll para que no venza a los 5 min y "reinicie" el
  // conteo de "quién llegó primero" en colisiones más largas que eso.
  await redis.set(`ticketentry:${id}:${user}`, Date.now().toString(), { ex: 300, nx: true });
  await redis.expire(`ticketentry:${id}:${user}`, 300);
  if (ticketNumber) await redis.set(`ticketnumber:${id}`, ticketNumber, { ex: 300 });
  if (ticketTitle) await redis.set(`tickettitle:${id}`, ticketTitle, { ex: 300 });
  if (ticketUrl) await redis.set(`ticketurl:${id}`, ticketUrl, { ex: 300, nx: true });
  // Cacheado para que el DELETE (que no recibe autotaskTicketId) pueda crear la
  // nota de resolución en el ticket numérico correcto.
  if (autotaskTicketId) await redis.set(`autotaskid:${id}`, String(autotaskTicketId), { ex: 300 });

  if (Array.isArray(ping) && ping.length) {
    // Server-side rate limit: one ping per user per ticket every 30 seconds
    const pingRateKey = `pingrate:${id}:${user}`;
    const rateLimited = await redis.get(pingRateKey);
    if (!rateLimited) {
      await redis.set(pingRateKey, '1', { ex: 30 });
      const pingOps = ping.map((target: string) => redis.set(`ping:${id}:${target}`, user, { ex: 60 }));
      const qmsgOps = quickMsg
        ? ping.map((target: string) => redis.set(`quickmsg:${id}:${target}`, String(quickMsg).slice(0, 100), { ex: 120 }))
        : [];
      await Promise.all([...pingOps, ...qmsgOps]);
      const storedTicketNumber = ticketNumber ?? await redis.get<string>(`ticketnumber:${id}`);
      const storedUrl = ticketUrl ?? await redis.get<string>(`ticketurl:${id}`);
      sendPingWebhook(storedTicketNumber ?? `#${id}`, user, ping, storedUrl);
      logCentralNotification({
        type: 'ping',
        title: `${user} espera respuesta`,
        body: `Avisó a ${ping.join(', ')} en ${storedTicketNumber ?? `#${id}`}`,
        ticketId: id,
        ticketNumber: storedTicketNumber ?? undefined,
        ticketUrl: storedUrl ?? undefined,
        targets: ping,
        ts: Date.now(),
      });
    }
  }

  const pingKey = `ping:${id}:${user}`;
  const [pingedBy, quickMsgReceived] = await Promise.all([
    redis.get<string>(pingKey),
    redis.get<string>(`quickmsg:${id}:${user}`),
  ]);
  if (pingedBy) {
    await redis.del(pingKey);
    if (quickMsgReceived) await redis.del(`quickmsg:${id}:${user}`);
  }

  const allKeys = await redis.keys(`ticketpresence:${id}:*`);
  const otherNames = dedupeOthers(allKeys.map(k => extractUser(k, id)), user);

  const entryTimes = otherNames.length > 0
    ? await Promise.all(otherNames.map(u => redis.get<string>(`ticketentry:${id}:${u}`)))
    : [];

  const now = Date.now();
  const others = otherNames.map((name, i) => ({
    name,
    minutes: minutesSince(entryTimes[i], now),
  }));

  if (others.length > 0) {
    const colKey = `colactive:${id}:${user}`;
    const alreadyLogged = await redis.get(colKey);
    if (!alreadyLogged) {
      const allInCollision = [user, ...otherNames];
      await Promise.all([
        redis.set(colKey, '1', { ex: PRESENCE_TTL * 3 }),
        redis.incr(`colcount:${id}`).then(() => redis.expire(`colcount:${id}`, 180 * 24 * 3600)),
        redis.set(`colstart:${id}`, Date.now().toString(), { ex: 600, nx: true }),
        redis.set(`colusers:${id}`, JSON.stringify(allInCollision), { ex: 600 }),
      ]);
      const storedUrl = ticketUrl ?? await redis.get<string>(`ticketurl:${id}`);
      const storedTitle = ticketTitle ?? await redis.get<string>(`tickettitle:${id}`);
      const ticketDisplay = storedTitle
        ? `${ticketNumber ?? `#${id}`} — ${storedTitle}`
        : (ticketNumber ?? `#${id}`);
      // Registro durable en Supabase (history/analytics/daily-summary leen de ahí) —
      // guardamos el id para completar duration_ms cuando se resuelva.
      try {
        const { data: supaRow } = await supabase
          .from('collision_history')
          .insert({
            ticket_id: id,
            ticket_number: ticketNumber ?? null,
            ticket_url: storedUrl ?? null,
            users: allInCollision,
          })
          .select('id')
          .single();
        if (supaRow) {
          await redis.set(`colsupaid:${id}`, supaRow.id, { ex: 600 });
          // Solo se vinculan los participantes que resuelven a un técnico real conocido.
          const resolved = await Promise.all(allInCollision.map(async (name) => ({ name, resource_id: await lookupResourceId(name) })));
          const participantRows = resolved
            .filter((r) => r.resource_id !== null)
            .map((r) => ({ collision_id: supaRow.id, resource_id: r.resource_id }));
          if (participantRows.length) await supabase.from('collision_participants').insert(participantRows);
        }
      } catch {
        // silencioso: Redis ya tiene el registro
      }
      if (await isWithinWorkHours()) sendTeamsWebhook(ticketDisplay, allInCollision, storedUrl);
      logCentralNotification({
        type: 'collision',
        title: 'Colisión detectada',
        body: `${allInCollision.join(', ')} coinciden en ${ticketDisplay}`,
        ticketId: id,
        ticketNumber: ticketNumber ?? undefined,
        ticketUrl: storedUrl ?? undefined,
        targets: allInCollision,
        ts: Date.now(),
      });
      maybeCreateAutotaskNote(
        autotaskTicketId ? String(autotaskTicketId) : id,
        `Colisión detectada — ${ticketNumber ?? `#${id}`}`,
        `Netsus CoView detectó que ${allInCollision.join(', ')} coincidieron trabajando este ticket al mismo tiempo. Registrado automáticamente.`,
      );
    } else {
      // Colisión ya en curso: renovamos los TTL de colactive/colstart en cada poll
      // (en vez de dejarlos vencer a los ~2 min) — si no, el servidor la trataba como
      // "nueva" cada ~2 minutos, reenviando el webhook de Teams, duplicando la fila en
      // collision_history/Supabase y truncando la duración real si pasaba de 10 min.
      const allInCollision = [user, ...otherNames];
      await Promise.all([
        redis.expire(colKey, PRESENCE_TTL * 3),
        redis.expire(`colstart:${id}`, 600),
        redis.set(`colusers:${id}`, JSON.stringify(allInCollision), { ex: 600 }),
      ]);
    }
  }

  const [assignedTo, pastCollisionsRaw] = await Promise.all([
    getAutotaskAssignee(autotaskTicketId ? String(autotaskTicketId) : id),
    redis.get<number>(`colcount:${id}`),
  ]);
  const pastCollisions = pastCollisionsRaw ?? 0;

  return NextResponse.json({ ok: true, others, assignedTo: assignedTo ?? null, pingedBy: pingedBy ?? null, quickMsg: quickMsgReceived ?? null, pastCollisions });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const { user } = await request.json().catch(() => ({ user: '' }));
  if (user) {
    await redis.del(presenceKey(id, user));
    await redis.del(`ticketentry:${id}:${user}`);

    const remaining = await redis.keys(`ticketpresence:${id}:*`);
    if (remaining.length < 2) {
      const [startTs, colUsersRaw, ticketNumber, ticketTitle, ticketUrl] = await Promise.all([
        redis.get<string>(`colstart:${id}`),
        redis.get<string>(`colusers:${id}`),
        redis.get<string>(`ticketnumber:${id}`),
        redis.get<string>(`tickettitle:${id}`),
        redis.get<string>(`ticketurl:${id}`),
      ]);
      if (startTs) {
        const duration = Date.now() - parseInt(startTs);
        await Promise.all([
          redis.del(`colstart:${id}`),
          redis.del(`colusers:${id}`),
        ]);
        if (duration > 5000) {
          // Completa la fila de Supabase abierta en la detección; si no la encontramos
          // (TTL venció o se perdió), insertamos una fila nueva ya con la duración.
          try {
            const supaId = await redis.get<string>(`colsupaid:${id}`);
            const colUsersForSupa: string[] = colUsersRaw ? JSON.parse(colUsersRaw) : [user];
            if (supaId) {
              await supabase.from('collision_history').update({ duration_ms: duration }).eq('id', supaId);
              await redis.del(`colsupaid:${id}`);
            } else {
              await supabase.from('collision_history').insert({
                ticket_id: id,
                ticket_number: ticketNumber ?? null,
                ticket_url: ticketUrl ?? null,
                users: colUsersForSupa,
                duration_ms: duration,
              });
            }
          } catch {
            // silencioso: Redis ya tiene el registro
          }
          // Notify Teams that the collision was resolved
          const colUsers: string[] = colUsersRaw ? JSON.parse(colUsersRaw) : [user];
          const resolutionDisplay = ticketTitle
            ? `${ticketNumber ?? `#${id}`} — ${ticketTitle}`
            : (ticketNumber ?? `#${id}`);
          if (await isWithinWorkHours()) sendResolutionWebhook(resolutionDisplay, colUsers, duration, ticketUrl);
          const durLabel = formatDuration(duration);
          logCentralNotification({
            type: 'liberation',
            title: 'Colisión resuelta',
            body: `${resolutionDisplay} liberado tras ${durLabel}`,
            ticketId: id,
            ticketNumber: ticketNumber ?? undefined,
            ticketUrl: ticketUrl ?? undefined,
            targets: colUsers,
            ts: Date.now(),
          });
          const cachedAutotaskId = await redis.get<string>(`autotaskid:${id}`);
          maybeCreateAutotaskNote(
            cachedAutotaskId ?? id,
            `Colisión resuelta — ${ticketNumber ?? `#${id}`}`,
            `${colUsers.join(', ')} coincidieron en este ticket durante ${durLabel}. Colisión resuelta automáticamente por Netsus CoView.`,
          );
        }
      }
    }
  }
  return NextResponse.json({ ok: true });
}
