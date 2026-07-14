import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = request.nextUrl;
  const offset = parseInt(url.searchParams.get('offset') ?? '0');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);
  const tech = url.searchParams.get('tech')?.toLowerCase() ?? '';

  if (!tech) {
    const total = await redis.llen('collision_history');
    const raw = await redis.lrange('collision_history', offset, offset + limit - 1);
    const events = raw.map(e => {
      try { return typeof e === 'string' ? JSON.parse(e) : e; } catch { return null; }
    }).filter(Boolean);
    return NextResponse.json({ events, total, offset, limit });
  }

  // Tech filter: scan full list (capped at 200) and filter server-side
  const raw = await redis.lrange('collision_history', 0, -1);
  const all = raw.map(e => {
    try { return typeof e === 'string' ? JSON.parse(e) : e; } catch { return null; }
  }).filter(Boolean);

  const filtered = all.filter(e =>
    (e.users || []).some((u: any) => {
      const name = typeof u === 'string' ? u : u.name;
      return name?.toLowerCase().includes(tech);
    })
  );

  const total = filtered.length;
  const events = filtered.slice(offset, offset + limit);
  return NextResponse.json({ events, total, offset, limit });
}

export async function DELETE(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await Promise.all([
    redis.del('collision_history'),
    redis.del('collision_durations'),
  ]);
  return NextResponse.json({ ok: true });
}
