import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';

function checkCronSecret(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return secret && request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  const isCron = checkCronSecret(request);
  if (!isCron && !checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const raw = await redis.lrange('collision_history', 0, -1);
  const events = raw.map(e => {
    try { return typeof e === 'string' ? JSON.parse(e) : e; } catch { return null; }
  }).filter(Boolean);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const send = isCron || request.nextUrl.searchParams.get('send') === 'true';
  const period = request.nextUrl.searchParams.get('period') ?? 'yesterday';
  const from = period === 'today' ? todayStart.getTime() : yesterday.getTime();
  const to = period === 'today' ? Date.now() : todayStart.getTime();

  const filtered = events.filter(e => e.ts >= from && e.ts < to);

  if (!filtered.length) {
    return NextResponse.json({ total: 0, message: 'Sin colisiones en el período' });
  }

  const byTech: Record<string, number> = {};
  const byTicket: Record<string, number> = {};
  for (const e of filtered) {
    const key = e.ticketNumber || '#' + e.ticketId;
    byTicket[key] = (byTicket[key] || 0) + 1;
    for (const u of (e.users || [])) {
      const name = typeof u === 'string' ? u : u.name;
      byTech[name] = (byTech[name] || 0) + 1;
    }
  }

  const topTech = Object.entries(byTech).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topTicket = Object.entries(byTicket).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const label = period === 'today' ? 'Hoy' : 'Ayer';
  const dateLabel = period === 'today'
    ? new Date().toLocaleDateString('es-CL')
    : yesterday.toLocaleDateString('es-CL');

  const summary = { total: filtered.length, byTech, byTicket, period, dateLabel };

  if (send) {
    const webhookUrl = await redis.get<string>('config:teams_webhook');
    if (webhookUrl) {
      const facts = [
        { name: 'Total de colisiones', value: String(filtered.length) },
        ...topTech.map(([name, count]) => ({ name, value: `${count} colisión${count > 1 ? 'es' : ''}` })),
        ...(topTicket.length ? [{ name: 'Ticket con más colisiones', value: topTicket[0][0] + ` (${topTicket[0][1]}x)` }] : []),
      ];
      const body = {
        '@type': 'MessageCard', '@context': 'http://schema.org/extensions',
        themeColor: '3867E9',
        summary: `📊 Resumen de colisiones — ${label}`,
        sections: [{
          activityTitle: `📊 Resumen de colisiones — ${label} ${dateLabel}`,
          activitySubtitle: 'Autotask CoView · Netsus',
          facts,
        }],
      };
      await fetch(webhookUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).catch(() => {});
    }
  }

  return NextResponse.json(summary);
}
