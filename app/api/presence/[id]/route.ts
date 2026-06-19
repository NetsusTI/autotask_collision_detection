import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';

const PRESENCE_TTL = 40;

function presenceKey(ticketId: string, user: string) {
  return `ticketpresence:${ticketId}:${user}`;
}

function extractUser(key: string, ticketId: string) {
  return key.replace(`ticketpresence:${ticketId}:`, '');
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
  const { user, ticketNumber } = await request.json().catch(() => ({ user: 'Desconocido', ticketNumber: null }));

  await redis.set(presenceKey(id, user), '1', { ex: PRESENCE_TTL });
  // Guardar hora de entrada solo la primera vez (nx = no sobreescribir)
  await redis.set(`ticketentry:${id}:${user}`, Date.now().toString(), { ex: 300, nx: true });
  if (ticketNumber) await redis.set(`ticketnumber:${id}`, ticketNumber, { ex: 300 });

  const allKeys = await redis.keys(`ticketpresence:${id}:*`);
  const otherNames = allKeys.map(k => extractUser(k, id)).filter(u => u !== user);

  // Obtener tiempos de entrada de los otros técnicos
  const entryTimes = otherNames.length > 0
    ? await Promise.all(otherNames.map(u => redis.get<string>(`ticketentry:${id}:${u}`)))
    : [];

  const others = otherNames.map((name, i) => ({
    name,
    minutes: entryTimes[i] ? Math.floor((Date.now() - Number(entryTimes[i])) / 60000) : 0,
  }));

  // Registrar colisión en historial (solo una vez por usuario por ticket)
  if (others.length > 0) {
    const colKey = `colactive:${id}:${user}`;
    const alreadyLogged = await redis.get(colKey);
    if (!alreadyLogged) {
      await redis.set(colKey, '1', { ex: PRESENCE_TTL * 3 });
      const event = JSON.stringify({
        ts: Date.now(),
        ticketId: id,
        ticketNumber: ticketNumber ?? null,
        users: [user, ...otherNames],
      });
      await redis.lpush('collision_history', event);
      await redis.ltrim('collision_history', 0, 99);
    }
  }

  return NextResponse.json({ ok: true, others });
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
  }
  return NextResponse.json({ ok: true });
}
