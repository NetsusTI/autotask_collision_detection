import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';

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

async function addAutotaskNote(ticketId: string, users: string[]) {
  const atUser = process.env.AUTOTASK_USER;
  const atSecret = process.env.AUTOTASK_SECRET;
  if (!atUser || !atSecret) return;
  const base = 'https://webservices12.autotask.net/ATServicesRest/v1.0';
  const headers = { 'ApiIntegrationCode': 'CCD-NETSUS', 'UserName': atUser, 'Secret': atSecret, 'Content-Type': 'application/json' };
  const now = new Date().toLocaleString('es-CL');
  const body = {
    ticketID: parseInt(ticketId),
    title: '⚠️ Colisión detectada — Autotask Collision Detection',
    description: `${users.join(' y ')} abrieron este ticket simultáneamente el ${now}.\n\nDetectado automáticamente por Autotask Collision Detection (Netsus).`,
    noteType: 1,
    publish: 2,
  };
  fetch(`${base}/Tickets/${ticketId}/Notes`, {
    method: 'POST', headers, body: JSON.stringify(body),
  }).catch(() => {});
}

async function sendTeamsWebhook(ticketDisplay: string, users: string[], ticketUrl?: string | null) {
  const webhookUrl = await redis.get<string>('config:teams_webhook');
  if (!webhookUrl) return;

  const first = users[0];
  const rest = users.slice(1);
  const ticketLink = ticketUrl ? `[${ticketDisplay}](${ticketUrl})` : ticketDisplay;

  const body = {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: 'dc2626',
    summary: `⚠️ Colisión en ${ticketDisplay}`,
    sections: [{
      activityTitle: `⚠️ Colisión detectada`,
      activitySubtitle: `${ticketDisplay} · Autotask Collision Detection`,
      activityImage: 'https://netsus-two.vercel.app/icon/128.png',
      facts: [
        { name: 'Ticket', value: ticketUrl ? `<a href="${ticketUrl}">${ticketDisplay}</a>` : ticketDisplay },
        { name: 'Llegó primero', value: first },
        ...(rest.length ? [{ name: rest.length === 1 ? 'Entró después' : 'Entraron después', value: rest.join(', ') }] : []),
        { name: 'Hora', value: new Date().toLocaleString('es-CL') },
      ],
      markdown: true,
    }],
    potentialAction: ticketUrl ? [{
      '@type': 'OpenUri',
      name: 'Abrir ticket',
      targets: [{ os: 'default', uri: ticketUrl }],
    }] : undefined,
  };
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
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
    await Promise.all(ping.map((target: string) =>
      redis.set(`ping:${id}:${target}`, user, { ex: 60 })
    ));
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
      await redis.set(colKey, '1', { ex: PRESENCE_TTL * 3 });
      await redis.set(`colstart:${id}`, Date.now().toString(), { ex: 600, nx: true });
      const storedUrl = ticketUrl ?? await redis.get<string>(`ticketurl:${id}`);
      const event = JSON.stringify({
        ts: Date.now(),
        ticketId: id,
        ticketNumber: ticketNumber ?? null,
        users: [user, ...otherNames],
      });
      await redis.lpush('collision_history', event);
      await redis.ltrim('collision_history', 0, 199);
      sendTeamsWebhook(ticketNumber ?? `#${id}`, [user, ...otherNames], storedUrl);
      addAutotaskNote(id, [user, ...otherNames]);
    }
  }

  const assignedTo = await getAutotaskAssignee(id);

  return NextResponse.json({ ok: true, others, assignedTo: assignedTo ?? null, pingedBy: pingedBy ?? null });
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

    // Track collision duration when it resolves
    const remaining = await redis.keys(`ticketpresence:${id}:*`);
    if (remaining.length < 2) {
      const startTs = await redis.get<string>(`colstart:${id}`);
      if (startTs) {
        const duration = Date.now() - parseInt(startTs);
        await redis.del(`colstart:${id}`);
        if (duration > 5000) {
          await redis.lpush('collision_durations', JSON.stringify({ ticketId: id, duration, ts: Date.now() }));
          await redis.ltrim('collision_durations', 0, 199);
        }
      }
    }
  }
  return NextResponse.json({ ok: true });
}
