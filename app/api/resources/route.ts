import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/ticket-lock';
import { checkAdminSession } from '@/lib/admin-auth';
import { supabase } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await checkAdminSession(request))) return NextResponse.json({ error: 'admin session required' }, { status: 403 });

  const { data, error } = await supabase
    .from('resources')
    .select('autotask_resource_id, name, email, role, active')
    .order('active', { ascending: false })
    .order('name');

  if (error) return NextResponse.json({ error: 'db error' }, { status: 500 });
  return NextResponse.json({ resources: data ?? [] });
}
