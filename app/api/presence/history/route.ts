import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const raw = await redis.lrange('collision_history', 0, 49);
  const events = raw.map(e => {
    try { return typeof e === 'string' ? JSON.parse(e) : e; } catch { return null; }
  }).filter(Boolean);
  return NextResponse.json(events);
}
