import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';
import { NOTIFICATION_LOG_KEY } from '@/lib/notif-poll';

// Feed centralizado de notificaciones (n1–n5 + colisión/aviso/liberación) para el
// tab "Centro de Notificaciones" del panel web — agrega la actividad de todo el equipo,
// a diferencia del feed por-recurso que cada extensión drena individualmente.
export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = request.nextUrl;
  const offset = parseInt(url.searchParams.get('offset') ?? '0');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);

  const total = await redis.llen(NOTIFICATION_LOG_KEY);
  const raw = await redis.lrange(NOTIFICATION_LOG_KEY, offset, offset + limit - 1);
  const events = raw.map((e) => {
    try { return typeof e === 'string' ? JSON.parse(e) : e; } catch { return null; }
  }).filter(Boolean);

  return NextResponse.json({ events, total, offset, limit });
}
