import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [raw, durRaw] = await Promise.all([
    redis.lrange('collision_history', 0, -1),
    redis.lrange('collision_durations', 0, -1),
  ]);

  const events = raw.map(e => {
    try { return typeof e === 'string' ? JSON.parse(e) : e; } catch { return null; }
  }).filter(Boolean);

  const durations = durRaw.map(e => {
    try { return typeof e === 'string' ? JSON.parse(e) : e; } catch { return null; }
  }).filter(Boolean);

  const byTech: Record<string, number> = {};
  const byHour: number[] = Array(24).fill(0);
  const byTicket: Record<string, number> = {};

  for (const e of events) {
    const hour = new Date(e.ts).getHours();
    byHour[hour]++;
    const key = e.ticketNumber || '#' + e.ticketId;
    byTicket[key] = (byTicket[key] || 0) + 1;
    for (const u of (e.users || [])) {
      const name = typeof u === 'string' ? u : u.name;
      byTech[name] = (byTech[name] || 0) + 1;
    }
  }

  const total = events.length || 1;
  const techList = Object.entries(byTech)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }));

  const ticketList = Object.entries(byTicket)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ticket, count]) => ({ ticket, count }));

  const pairs: Record<string, number> = {};
  for (const e of events) {
    const users = (e.users || []).map((u: any) => (typeof u === 'string' ? u : u.name));
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        const key = [users[i], users[j]].sort().join(' ↔ ');
        pairs[key] = (pairs[key] || 0) + 1;
      }
    }
  }
  const pairList = Object.entries(pairs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([pair, count]) => ({ pair, count }));

  const avgDuration = durations.length
    ? Math.round(durations.reduce((sum: number, d: any) => sum + (d.duration || 0), 0) / durations.length / 1000)
    : null;
  const maxDuration = durations.length
    ? Math.round(Math.max(...durations.map((d: any) => d.duration || 0)) / 1000)
    : null;

  return NextResponse.json({
    byTech: techList,
    byHour,
    topTickets: ticketList,
    pairs: pairList,
    total: events.length,
    avgDurationSecs: avgDuration,
    maxDurationSecs: maxDuration,
    resolvedCount: durations.length,
  });
}
