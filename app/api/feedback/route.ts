import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/ticket-lock';
import { supabase, type FeedbackType } from '@/lib/supabase/client';
import { lookupResourceId } from '@/lib/supabase/resources';

const VALID_TYPES: FeedbackType[] = ['mejorar', 'agregar', 'quitar', 'otro'];

export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { user, type, message } = await request.json().catch(() => ({}));

  const resource_name = typeof user === 'string' ? user.trim() : '';
  const msg = typeof message === 'string' ? message.trim() : '';
  const fbType: FeedbackType = VALID_TYPES.includes(type) ? type : 'otro';

  if (!resource_name || !msg) return NextResponse.json({ error: 'missing fields' }, { status: 400 });

  // El feedback no tiene respaldo en Redis (a diferencia de colisiones/notificaciones),
  // así que si el nombre no corresponde a un técnico conocido, se rechaza directamente
  // en vez de guardarlo sin dueño verificado.
  const resource_id = await lookupResourceId(resource_name);
  if (!resource_id) return NextResponse.json({ error: 'unknown resource' }, { status: 403 });

  const { error } = await supabase.from('feedback').insert({ resource_name, resource_id, type: fbType, message: msg });
  if (error) return NextResponse.json({ error: 'supabase error' }, { status: 502 });

  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = request.nextUrl;
  const offset = parseInt(url.searchParams.get('offset') ?? '0');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);

  const { data, count, error } = await supabase
    .from('feedback')
    .select('id, resource_name, type, message, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error || !data) return NextResponse.json({ items: [], total: 0, offset, limit });

  return NextResponse.json({ items: data, total: count ?? data.length, offset, limit });
}
