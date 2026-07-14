import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/ticket-lock';
import { runPoll } from '@/lib/notif-poll';

// Punto de entrada del cron (y disparo manual) del poller n1–n5.
// Autenticación: x-api-key, o Bearer CRON_SECRET (cron de Vercel). Si no hay
// CRON_SECRET configurado, se permite el disparo sin auth (es idempotente y lock-guarded).
function authorized(request: NextRequest): boolean {
  if (checkApiKey(request)) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const force = request.nextUrl.searchParams.get('force') === '1' && checkApiKey(request);
  const result = await runPoll(force);
  return NextResponse.json(result);
}
