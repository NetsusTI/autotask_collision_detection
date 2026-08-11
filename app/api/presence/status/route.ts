import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis, ACTIVE_TICKETS_KEY } from '@/lib/ticket-lock';

// Ventana de gracia: el TTL de presencia configurable llega hasta 300s, así que
// cualquier ticket "vivo" hace <10 min (o el TTL configurado, lo que sea mayor)
// sigue apareciendo en el índice — un margen generoso evita descartar un ticket
// real por un score levemente desactualizado.
const INDEX_WINDOW_MS = 15 * 60 * 1000;

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const now = Date.now();
  // Antes: redis.keys('ticketpresence:*') — un escaneo O(N) de TODO el keyspace
  // de Redis (no solo las keys de presencia), llamado cada 10s por cada panel
  // admin abierto. Con el índice, solo se hace KEYS acotado por ticket para los
  // tickets que efectivamente tuvieron actividad reciente.
  const ticketIds = await redis.zrange<string[]>(ACTIVE_TICKETS_KEY, now - INDEX_WINDOW_MS, '+inf', { byScore: true });
  if (!ticketIds.length) return NextResponse.json([]);

  const perTicketKeys = await Promise.all(ticketIds.map((id) => redis.keys(`ticketpresence:${id}:*`)));
  const ticketMap: Record<string, string[]> = {};
  ticketIds.forEach((id, i) => {
    const keys = perTicketKeys[i];
    if (!keys.length) return; // TTL venció pero el índice no se limpió aún (best-effort)
    ticketMap[id] = keys.map((k) => k.replace(`ticketpresence:${id}:`, ''));
  });

  const liveTicketIds = Object.keys(ticketMap);
  if (!liveTicketIds.length) return NextResponse.json([]);

  const [numbers, urls] = await Promise.all([
    Promise.all(liveTicketIds.map(id => redis.get<string>(`ticketnumber:${id}`))),
    Promise.all(liveTicketIds.map(id => redis.get<string>(`ticketurl:${id}`))),
  ]);

  const result = await Promise.all(liveTicketIds.map(async (id, i) => {
    const users = await Promise.all(ticketMap[id].map(async (name) => {
      const ts = await redis.get<string>(`ticketentry:${id}:${name}`);
      const minutes = ts ? Math.floor((Date.now() - parseInt(ts)) / 60000) : 0;
      return { name, minutes };
    }));
    return { ticketId: id, ticketNumber: numbers[i] ?? null, ticketUrl: urls[i] ?? null, users };
  }));

  return NextResponse.json(result);
}
