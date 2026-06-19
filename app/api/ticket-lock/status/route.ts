import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis, TicketLock } from '@/lib/ticket-lock';

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const keys = await redis.keys('ticketlock:*');
  if (keys.length === 0) return NextResponse.json({});

  const values = await redis.mget<(TicketLock | null)[]>(...keys);
  const active: Record<string, string> = {};
  keys.forEach((key, i) => {
    const ticketId = key.replace('ticketlock:', '');
    const value = values[i];
    if (value) active[ticketId] = value.user;
  });

  return NextResponse.json(active);
}
