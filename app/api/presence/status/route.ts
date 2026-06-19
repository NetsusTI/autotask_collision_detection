import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const keys = await redis.keys('ticketpresence:*');
  const ticketMap: Record<string, string[]> = {};

  for (const key of keys) {
    const parts = key.split(':');
    const ticketId = parts[1];
    const user = parts.slice(2).join(':');
    if (!ticketMap[ticketId]) ticketMap[ticketId] = [];
    ticketMap[ticketId].push(user);
  }

  const ticketIds = Object.keys(ticketMap);
  const numbers = ticketIds.length > 0
    ? await Promise.all(ticketIds.map(id => redis.get<string>(`ticketnumber:${id}`)))
    : [];

  const result = ticketIds.map((id, i) => ({
    ticketId: id,
    ticketNumber: numbers[i] ?? null,
    users: ticketMap[id],
  }));

  return NextResponse.json(result);
}
