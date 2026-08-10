import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';
import { checkAdminSession } from '@/lib/admin-auth';
import { supabase } from '@/lib/supabase/client';
import { autotaskConfigured, headers as autotaskHeaders } from '@/lib/autotask';

const AUTOTASK_BASE = 'https://webservices12.autotask.net/ATServicesRest/v1.0';

interface CheckResult {
  ok: boolean;
  ms: number;
  error?: string;
}

async function timed(fn: () => Promise<void>): Promise<CheckResult> {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - start };
  } catch (e) {
    return { ok: false, ms: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
  }
}

// Chequeo de salud de las 3 dependencias externas (Redis, Supabase, Autotask) —
// para detectar una caída antes de que un técnico reporte "no me funciona CoView".
// Read-only, sin efectos secundarios: un GET/SET descartable a Redis, un count a
// Supabase, y un fetch liviano a Autotask (zoneInformation, no gasta cuota de query).
export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await checkAdminSession(request))) return NextResponse.json({ error: 'admin session required' }, { status: 403 });

  const [redisCheck, supabaseCheck, autotaskCheck] = await Promise.all([
    timed(async () => {
      const key = 'health:ping';
      await redis.set(key, String(Date.now()), { ex: 30 });
      const v = await redis.get(key);
      if (v === null) throw new Error('sin respuesta');
    }),
    timed(async () => {
      const { error } = await supabase.from('resources').select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
    }),
    timed(async () => {
      if (!autotaskConfigured()) throw new Error('no configurado');
      const res = await fetch(`${AUTOTASK_BASE}/zoneInformation`, { headers: autotaskHeaders() });
      // zoneInformation no exige autenticación, así que 401 acá indicaría que las
      // credenciales SÍ funcionan mal en otros endpoints — igual lo tratamos ok si
      // responde algo coherente (200/401/403), y como caído solo si no responde.
      if (!res.ok && res.status >= 500) throw new Error(`HTTP ${res.status}`);
    }),
  ]);

  const allOk = redisCheck.ok && supabaseCheck.ok && autotaskCheck.ok;
  return NextResponse.json({
    ok: allOk,
    checkedAt: new Date().toISOString(),
    redis: redisCheck,
    supabase: supabaseCheck,
    autotask: autotaskCheck,
  });
}
