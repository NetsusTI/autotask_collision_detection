import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/ticket-lock';
import { supabase } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const user = request.nextUrl.searchParams.get('user')?.trim() ?? '';
  if (!user) return NextResponse.json({ error: 'user required' }, { status: 400 });

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const [weekRes, monthRes] = await Promise.all([
    supabase
      .from('collision_history')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', weekAgo)
      // .contains() con un array JS lo serializa como literal de Postgres ({a,b}),
      // válido para columnas array nativas pero no para jsonb como `users` — con un
      // nombre que trae espacio (ej. "Ricardo Illanes") Postgres lo lee como dos
      // tokens sueltos y tira 22P02 "invalid input syntax for type json". Pasar la
      // condición ya serializada a JSON evita la conversión automática.
      .contains('users', JSON.stringify([user])),
    supabase
      .from('collision_history')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthAgo)
      // .contains() con un array JS lo serializa como literal de Postgres ({a,b}),
      // válido para columnas array nativas pero no para jsonb como `users` — con un
      // nombre que trae espacio (ej. "Ricardo Illanes") Postgres lo lee como dos
      // tokens sueltos y tira 22P02 "invalid input syntax for type json". Pasar la
      // condición ya serializada a JSON evita la conversión automática.
      .contains('users', JSON.stringify([user])),
  ]);

  return NextResponse.json({
    weekCount: weekRes.count ?? 0,
    monthCount: monthRes.count ?? 0,
  });
}
