import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/ticket-lock';
import { checkAdminSession } from '@/lib/admin-auth';
import { autotaskConfigured } from '@/lib/autotask';
import { syncResourcesFromAutotask } from '@/lib/supabase/resources';

export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Acción administrativa — exige la sesión de /api/admin/auth (ver nota en /api/config).
  if (!(await checkAdminSession(request))) return NextResponse.json({ error: 'admin session required' }, { status: 403 });
  if (!autotaskConfigured()) return NextResponse.json({ ran: false, error: 'autotask not configured' });

  try {
    const result = await syncResourcesFromAutotask();
    return NextResponse.json({ ran: true, ...result });
  } catch {
    return NextResponse.json({ ran: false, error: 'supabase error' }, { status: 502 });
  }
}
