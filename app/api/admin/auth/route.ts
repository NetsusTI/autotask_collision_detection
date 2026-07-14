import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/ticket-lock';

export async function POST(request: NextRequest) {
  const { password } = await request.json().catch(() => ({ password: '' }));
  if (!password) return NextResponse.json({ error: 'missing password' }, { status: 400 });

  // Check env var first, then Redis (allows runtime config)
  const envPwd = process.env.ADMIN_PASSWORD;
  const redisPwd = envPwd ? null : await redis.get<string>('config:admin_password');
  const expected = envPwd || redisPwd;

  if (!expected || password !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
