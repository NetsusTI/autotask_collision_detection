import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/ticket-lock';
import { checkAdminSession } from '@/lib/admin-auth';
import { supabase } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await checkAdminSession(request))) return NextResponse.json({ error: 'admin session required' }, { status: 403 });

  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '30'), 100);
  const { data, error } = await supabase
    .from('error_log')
    .select('id, source, message, detail, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ items: [], error: 'db error' }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// DELETE ?all=true — vacía el rastro de errores (los mismos que se siguen
// generando quedan igual, solo se limpia el historial acumulado).
export async function DELETE(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await checkAdminSession(request))) return NextResponse.json({ error: 'admin session required' }, { status: 403 });

  const { error } = await supabase.from('error_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) return NextResponse.json({ error: 'db error' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
