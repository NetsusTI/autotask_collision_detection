import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, lockKey, redis, LOCK_TTL, TicketLock } from '@/lib/ticket-lock';

export async function POST(
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
  if (existing && existing.user === user) {
    await redis.expire(key, LOCK_TTL);
  }
  return NextResponse.json({ ok: true });
}
