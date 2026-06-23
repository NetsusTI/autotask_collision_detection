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
  if (!ticketIds.length) return NextResponse.json([]);

  const [numbers, urls] = await Promise.all([
    Promise.all(ticketIds.map(id => redis.get<string>(`ticketnumber:${id}`))),
    Promise.all(ticketIds.map(id => redis.get<string>(`ticketurl:${id}`))),
  ]);

  const result = await Promise.all(ticketIds.map(async (id, i) => {
    const users = await Promise.all(ticketMap[id].map(async (name) => {
      const ts = await redis.get<string>(`ticketentry:${id}:${name}`);
      const minutes = ts ? Math.floor((Date.now() - parseInt(ts)) / 60000) : 0;
      return { name, minutes };
    }));
    return { ticketId: id, ticketNumber: numbers[i] ?? null, ticketUrl: urls[i] ?? null, users };
  }));

  return NextResponse.json(result);
}
