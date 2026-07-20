import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';
import { checkAdminSession } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const [teamsWebhook, presenceTtl, watchQueues, criticalPriorities, slaWarnMin, autotaskUiBase, notifEnabled] = await Promise.all([
    redis.get<string>('config:teams_webhook'),
    redis.get<string>('config:presence_ttl'),
    redis.get<string>('config:watch_queues'),
    redis.get<string>('config:critical_priorities'),
    redis.get<string>('config:sla_warn_min'),
    redis.get<string>('config:autotask_ui_base'),
    redis.get<string>('config:notif_enabled'),
  ]);
  return NextResponse.json({
    teamsWebhook: teamsWebhook ?? '',
    presenceTtl: presenceTtl ? parseInt(presenceTtl) : 40,
    watchQueues: watchQueues ?? '',
    criticalPriorities: criticalPriorities ?? '[1]',
    slaWarnMin: slaWarnMin ? parseInt(slaWarnMin) : 30,
    autotaskUiBase: autotaskUiBase ?? '',
    notifEnabled: notifEnabled !== '0',
  });
}

export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Cambiar config (webhook de Teams, TTL, colas vigiladas, etc.) es una acción
  // administrativa — exige la sesión de /api/admin/auth además del x-api-key, que
  // por sí solo no alcanza (viene embebido en la extensión pública).
  if (!(await checkAdminSession(request))) return NextResponse.json({ error: 'admin session required' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const ops: Promise<unknown>[] = [];
  if ('teamsWebhook' in body) {
    ops.push(body.teamsWebhook
      ? redis.set('config:teams_webhook', body.teamsWebhook)
      : redis.del('config:teams_webhook'));
  }
  if ('presenceTtl' in body) {
    const ttl = Math.max(15, Math.min(300, parseInt(body.presenceTtl) || 40));
    ops.push(redis.set('config:presence_ttl', String(ttl)));
  }

  // Normaliza "1,2,3" o [1,2,3] a un array JSON de números.
  const toNumArray = (v: unknown): number[] => {
    const arr = Array.isArray(v) ? v : String(v ?? '').split(',');
    return arr.map((x) => parseInt(String(x).trim())).filter((n) => !Number.isNaN(n));
  };
  if ('watchQueues' in body) {
    ops.push(redis.set('config:watch_queues', JSON.stringify(toNumArray(body.watchQueues))));
  }
  if ('criticalPriorities' in body) {
    const nums = toNumArray(body.criticalPriorities);
    ops.push(redis.set('config:critical_priorities', JSON.stringify(nums.length ? nums : [1])));
  }
  if ('slaWarnMin' in body) {
    const m = Math.max(5, Math.min(1440, parseInt(body.slaWarnMin) || 30));
    ops.push(redis.set('config:sla_warn_min', String(m)));
  }
  if ('autotaskUiBase' in body) {
    const base = String(body.autotaskUiBase ?? '').trim();
    ops.push(base ? redis.set('config:autotask_ui_base', base) : redis.del('config:autotask_ui_base'));
  }
  if ('notifEnabled' in body) {
    ops.push(redis.set('config:notif_enabled', body.notifEnabled ? '1' : '0'));
  }

  await Promise.all(ops);
  return NextResponse.json({ ok: true });
}
