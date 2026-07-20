import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/ticket-lock';
import { supabase } from '@/lib/supabase/client';

// Feed centralizado de notificaciones (n1–n5 + colisión/aviso/liberación) para el
// tab "Centro de Notificaciones" del panel web — agrega la actividad de todo el equipo.
// La tabla en Supabase es una fila por técnico destinatario; acá se reagrupan las filas
// que vienen del mismo evento (mismo type/title/body/ticket, mismo created_at porque se
// insertan en un solo INSERT por evento) para reconstruir el targets[] original.
const SCAN_WINDOW = 1000;

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = request.nextUrl;
  const offset = parseInt(url.searchParams.get('offset') ?? '0');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);

  const { data, error } = await supabase
    .from('notifications')
    .select('resource_name, type, title, body, ticket_id, ticket_number, ticket_url, created_at')
    .order('created_at', { ascending: false })
    .limit(SCAN_WINDOW);
  if (error || !data) return NextResponse.json({ events: [], total: 0, offset, limit });

  const groups = new Map<string, {
    type: string; title: string; body: string;
    ticketId?: string; ticketNumber?: string; ticketUrl?: string;
    targets: string[]; ts: number;
  }>();
  const order: string[] = [];
  for (const row of data) {
    const key = `${row.type}|${row.title}|${row.body}|${row.ticket_id}|${row.created_at}`;
    if (!groups.has(key)) {
      groups.set(key, {
        type: row.type,
        title: row.title,
        body: row.body,
        ticketId: row.ticket_id ?? undefined,
        ticketNumber: row.ticket_number ?? undefined,
        ticketUrl: row.ticket_url ?? undefined,
        targets: [],
        ts: new Date(row.created_at).getTime(),
      });
      order.push(key);
    }
    groups.get(key)!.targets.push(row.resource_name);
  }

  const events = order.map((k) => groups.get(k)!);
  const total = events.length;
  const page = events.slice(offset, offset + limit);
  return NextResponse.json({ events: page, total, offset, limit });
}
