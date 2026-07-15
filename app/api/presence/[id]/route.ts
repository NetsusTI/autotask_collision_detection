import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';
import { logCentralNotification } from '@/lib/notif-poll';

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

  const atUser = process.env.AUTOTASK_USER;
  const atSecret = process.env.AUTOTASK_SECRET;
  if (!atUser || !atSecret) return null;

  try {
    const base = 'https://webservices12.autotask.net/ATServicesRest/v1.0';
    const headers = { 'ApiIntegrationCode': 'CCD-NETSUS', 'UserName': atUser, 'Secret': atSecret, 'Content-Type': 'application/json' };

    const ticketRes = await fetch(`${base}/Tickets/${ticketId}?fields=assignedResourceID`, { headers });
    if (!ticketRes.ok) { await redis.set(cacheKey, '', { ex: 300 }); return null; }
    const ticketData = await ticketRes.json();
    const resourceId = ticketData?.item?.assignedResourceID;
    if (!resourceId) { await redis.set(cacheKey, '', { ex: 300 }); return null; }

    const resRes = await fetch(`${base}/Resources/${resourceId}?fields=firstName,lastName`, { headers });
    if (!resRes.ok) { await redis.set(cacheKey, '', { ex: 300 }); return null; }
    const resData = await resRes.json();
    const item = resData?.item;
    const name = item ? `${item.firstName} ${item.lastName}`.trim() : null;
    await redis.set(cacheKey, name ?? '', { ex: 300 });
    return name;
  } catch {
    await redis.set(cacheKey, '', { ex: 60 });
    return null;
  }
}

async function getWebhookUrl(): Promise<string | null> {
  return redis.get<string>('config:teams_webhook');
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

  const totalSecs = Math.round(durationMs / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const durStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

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
  const { user, ticketNumber, ticketUrl, ping } = await request.json().catch(() => ({ user: 'Desconocido', ticketNumber: null, ticketUrl: null, ping: null }));

  const configTtl = await redis.get<string>('config:presence_ttl');
  const ttl = configTtl ? Math.max(15, Math.min(300, parseInt(configTtl))) : PRESENCE_TTL;
  await redis.set(presenceKey(id, user), '1', { ex: ttl });
  await redis.set(`ticketentry:${id}:${user}`, Date.now().toString(), { ex: 300, nx: true });
  if (ticketNumber) await redis.set(`ticketnumber:${id}`, ticketNumber, { ex: 300 });
  if (ticketUrl) await redis.set(`ticketurl:${id}`, ticketUrl, { ex: 300, nx: true });

  if (Array.isArray(ping) && ping.length) {
    // Server-side rate limit: one ping per user per ticket every 30 seconds
    const pingRateKey = `pingrate:${id}:${user}`;
    const rateLimited = await redis.get(pingRateKey);
    if (!rateLimited) {
      await redis.set(pingRateKey, '1', { ex: 30 });
      await Promise.all(ping.map((target: string) =>
        redis.set(`ping:${id}:${target}`, user, { ex: 60 })
      ));
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
  const pingedBy = await redis.get<string>(pingKey);
  if (pingedBy) await redis.del(pingKey);

  const allKeys = await redis.keys(`ticketpresence:${id}:*`);
  const otherNames = allKeys.map(k => extractUser(k, id)).filter(u => u !== user);

  const entryTimes = otherNames.length > 0
    ? await Promise.all(otherNames.map(u => redis.get<string>(`ticketentry:${id}:${u}`)))
    : [];

  const others = otherNames.map((name, i) => ({
    name,
    minutes: entryTimes[i] ? Math.floor((Date.now() - Number(entryTimes[i])) / 60000) : 0,
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
      const event = JSON.stringify({
        ts: Date.now(),
        ticketId: id,
        ticketNumber: ticketNumber ?? null,
        users: allInCollision,
      });
      await redis.lpush('collision_history', event);
      await redis.ltrim('collision_history', 0, 199);
      sendTeamsWebhook(ticketNumber ?? `#${id}`, allInCollision, storedUrl);
      logCentralNotification({
        type: 'collision',
        title: 'Colisión detectada',
        body: `${allInCollision.join(', ')} coinciden en ${ticketNumber ?? `#${id}`}`,
        ticketId: id,
        ticketNumber: ticketNumber ?? undefined,
        ticketUrl: storedUrl ?? undefined,
        targets: allInCollision,
        ts: Date.now(),
      });
    } else {
      // Update participant list in case someone new joined mid-collision
      const allInCollision = [user, ...otherNames];
      await redis.set(`colusers:${id}`, JSON.stringify(allInCollision), { ex: 600 });
    }
  }

  const [assignedTo, pastCollisionsRaw] = await Promise.all([
    getAutotaskAssignee(id),
    redis.get<number>(`colcount:${id}`),
  ]);
  const pastCollisions = pastCollisionsRaw ?? 0;

  return NextResponse.json({ ok: true, others, assignedTo: assignedTo ?? null, pingedBy: pingedBy ?? null, pastCollisions });
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
      const [startTs, colUsersRaw, ticketNumber, ticketUrl] = await Promise.all([
        redis.get<string>(`colstart:${id}`),
        redis.get<string>(`colusers:${id}`),
        redis.get<string>(`ticketnumber:${id}`),
        redis.get<string>(`ticketurl:${id}`),
      ]);
      if (startTs) {
        const duration = Date.now() - parseInt(startTs);
        await Promise.all([
          redis.del(`colstart:${id}`),
          redis.del(`colusers:${id}`),
        ]);
        if (duration > 5000) {
          await redis.lpush('collision_durations', JSON.stringify({ ticketId: id, duration, ts: Date.now() }));
          await redis.ltrim('collision_durations', 0, 199);
          // Notify Teams that the collision was resolved
          const colUsers: string[] = colUsersRaw ? JSON.parse(colUsersRaw) : [user];
          sendResolutionWebhook(ticketNumber ?? `#${id}`, colUsers, duration, ticketUrl);
          const durSecs = Math.round(duration / 1000);
          const durLabel = durSecs >= 60 ? `${Math.floor(durSecs / 60)}m ${durSecs % 60}s` : `${durSecs}s`;
          logCentralNotification({
            type: 'liberation',
            title: 'Colisión resuelta',
            body: `${ticketNumber ?? `#${id}`} liberado tras ${durLabel}`,
            ticketId: id,
            ticketNumber: ticketNumber ?? undefined,
            ticketUrl: ticketUrl ?? undefined,
            targets: colUsers,
            ts: Date.now(),
          });
        }
      }
    }
  }
  return NextResponse.json({ ok: true });
}
