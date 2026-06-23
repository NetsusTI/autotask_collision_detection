import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const [teamsWebhook, presenceTtl] = await Promise.all([
    redis.get<string>('config:teams_webhook'),
    redis.get<string>('config:presence_ttl'),
  ]);
  return NextResponse.json({
    teamsWebhook: teamsWebhook ?? '',
    presenceTtl: presenceTtl ? parseInt(presenceTtl) : 40,
  });
}

export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const ops: Promise<any>[] = [];
  if ('teamsWebhook' in body) {
    ops.push(body.teamsWebhook
      ? redis.set('config:teams_webhook', body.teamsWebhook)
      : redis.del('config:teams_webhook'));
  }
  if ('presenceTtl' in body) {
    const ttl = Math.max(15, Math.min(300, parseInt(body.presenceTtl) || 40));
    ops.push(redis.set('config:presence_ttl', String(ttl)));
  }
  await Promise.all(ops);
  return NextResponse.json({ ok: true });
}
