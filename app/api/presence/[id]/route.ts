import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';

const PRESENCE_TTL = 40; // segundos sin heartbeat = se elimina automáticamente

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
  const { user } = await request.json().catch(() => ({ user: 'Desconocido' }));

  await redis.set(presenceKey(id, user), '1', { ex: PRESENCE_TTL });

  const allKeys = await redis.keys(`ticketpresence:${id}:*`);
  const others = allKeys
    .map(k => extractUser(k, id))
    .filter(u => u !== user);

  return NextResponse.json({ ok: true, others });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const { user } = await request.json().catch(() => ({ user: '' }));
  if (user) await redis.del(presenceKey(id, user));
  return NextResponse.json({ ok: true });
}
