import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const keys = await redis.keys('ticketpresence:*');
  const result: Record<string, string[]> = {};

  for (const key of keys) {
    const parts = key.split(':');
    const ticketId = parts[1];
    const user = parts.slice(2).join(':');
    if (!result[ticketId]) result[ticketId] = [];
    result[ticketId].push(user);
  }

  return NextResponse.json(result);
}
