import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/ticket-lock';
import { checkAdminSession } from '@/lib/admin-auth';
import { autotaskConfigured } from '@/lib/autotask';
import { syncResourcesFromAutotask } from '@/lib/supabase/resources';

function checkCronSecret(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
}

async function runSync() {
  if (!autotaskConfigured()) return NextResponse.json({ ran: false, error: 'autotask not configured' });
  try {
    const result = await syncResourcesFromAutotask();
    return NextResponse.json({ ran: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    return NextResponse.json({ ran: false, error: 'supabase error', detail: msg }, { status: 502 });
  }
}

// Disparo manual desde el botón "Sincronizar desde Autotask" del panel admin.
export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Acción administrativa — exige la sesión de /api/admin/auth (ver nota en /api/config).
  if (!(await checkAdminSession(request))) return NextResponse.json({ error: 'admin session required' }, { status: 403 });
  return runSync();
}

// Disparo automático desde Vercel Cron (ver vercel.json). Vercel Cron solo hace GET
// y agrega Authorization: Bearer <CRON_SECRET> automáticamente cuando esa env var
// está seteada — mismo patrón que /api/presence/daily-summary.
export async function GET(request: NextRequest) {
  if (!checkCronSecret(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return runSync();
}
