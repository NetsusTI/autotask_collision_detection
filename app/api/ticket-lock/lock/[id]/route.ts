import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, lockKey, redis, LOCK_TTL, TicketLock } from '@/lib/ticket-lock';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkApiKey(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const lock = await redis.get<TicketLock>(lockKey(id));
  return NextResponse.json(lock ?? null);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkApiKey(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const user = body.user || 'Desconocido';

  const key = lockKey(id);
  const existing = await redis.get<TicketLock>(key);

  if (existing && existing.user !== user) {
    return NextResponse.json({ ok: false, user: existing.user }, { status: 409 });
  }

  await redis.set(key, { user }, { ex: LOCK_TTL });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkApiKey(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const user = body.user || '';

  const key = lockKey(id);
  const existing = await redis.get<TicketLock>(key);
  if (existing && (!user || existing.user === user)) {
    await redis.del(key);
  }
  return NextResponse.json({ ok: true });
}
