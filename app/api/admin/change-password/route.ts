import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';
import { checkAdminSession } from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await checkAdminSession(request))) return NextResponse.json({ error: 'admin session required' }, { status: 403 });

  const { currentPassword, newPassword } = await request.json().catch(() => ({}));
  if (!currentPassword || !newPassword) return NextResponse.json({ error: 'missing fields' }, { status: 400 });

  const envPwd = process.env.ADMIN_PASSWORD;
  const redisPwd = envPwd ? null : await redis.get<string>('config:admin_password');
  const expected = envPwd || redisPwd;
  if (!expected || currentPassword !== expected) {
    return NextResponse.json({ error: 'wrong_password' }, { status: 403 });
  }

  await redis.set('config:admin_password', newPassword);
  // Si ADMIN_PASSWORD está seteada en Vercel, tiene prioridad sobre este valor
  // (ver app/api/admin/auth/route.ts) — el cambio queda guardado pero sin efecto
  // hasta que se borre esa variable de entorno.
  return NextResponse.json({ ok: true, envOverride: Boolean(envPwd) });
}
