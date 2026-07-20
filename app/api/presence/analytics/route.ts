import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/ticket-lock';
import { supabase } from '@/lib/supabase/client';

// Leído desde Supabase (sin el cap de 200 que tenía la lista `collision_history` en
// Redis) — se trae una ventana amplia y se agrega en memoria, igual que hace
// history/route.ts para el filtro por técnico.
const SCAN_WINDOW = 5000;

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('collision_history')
    .select('ticket_id, ticket_number, users, duration_ms, created_at')
    .order('created_at', { ascending: false })
    .limit(SCAN_WINDOW);
  if (error || !data) return NextResponse.json({ error: 'query failed' }, { status: 500 });

  const events = data.map((row) => ({
    ts: new Date(row.created_at).getTime(),
    ticketId: row.ticket_id,
    ticketNumber: row.ticket_number,
    users: (row.users ?? []) as (string | { name: string })[],
  }));
  const durations = data
    .map((row) => row.duration_ms)
    .filter((d): d is number => d != null);

  const byTech: Record<string, number> = {};
  const byHour: number[] = Array(24).fill(0);
  const byTicket: Record<string, number> = {};

  // Last 30 days trend — keyed by YYYY-MM-DD
  const byDay: Record<string, number> = {};
  const now = Date.now();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    byDay[d.toISOString().slice(0, 10)] = 0;
  }
  const thirtyDaysAgo = now - 30 * 86400000;

  for (const e of events) {
    const hour = new Date(e.ts).getHours();
    byHour[hour]++;
    const key = e.ticketNumber || '#' + e.ticketId;
    byTicket[key] = (byTicket[key] || 0) + 1;
    for (const u of e.users) {
      const name = typeof u === 'string' ? u : u.name;
      byTech[name] = (byTech[name] || 0) + 1;
    }
    if (e.ts >= thirtyDaysAgo) {
      const dayKey = new Date(e.ts).toISOString().slice(0, 10);
      if (dayKey in byDay) byDay[dayKey]++;
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
    const users = e.users.map((u) => (typeof u === 'string' ? u : u.name));
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
    ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length / 1000)
    : null;
  const maxDuration = durations.length
    ? Math.round(Math.max(...durations) / 1000)
    : null;

  // Ordered array of { date, count } for the last 30 days
  const byDayArray = Object.entries(byDay).map(([date, count]) => ({ date, count }));

  return NextResponse.json({
    byTech: techList,
    byHour,
    byDay: byDayArray,
    topTickets: ticketList,
    pairs: pairList,
    total: events.length,
    avgDurationSecs: avgDuration,
    maxDurationSecs: maxDuration,
    resolvedCount: durations.length,
  });
}
