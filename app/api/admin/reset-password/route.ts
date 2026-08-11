import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/ticket-lock';
import { isResetRateLimited, registerResetRequest, verifyAndConsumeResetCode } from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
  if (await isResetRateLimited(request)) {
    return NextResponse.json({ error: 'demasiados intentos, espera unos minutos' }, { status: 429 });
  }

  const { code, newPassword } = await request.json().catch(() => ({}));
  if (!code || !newPassword) return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return NextResponse.json({ error: 'weak_password' }, { status: 400 });
  }

  const valid = await verifyAndConsumeResetCode(String(code).trim());
  if (!valid) {
    await registerResetRequest(request);
    return NextResponse.json({ error: 'invalid_code' }, { status: 403 });
  }

  await redis.set('config:admin_password', newPassword);
  // Si ADMIN_PASSWORD está seteada en Vercel, tiene prioridad (ver /api/admin/auth)
  // — el cambio queda guardado pero sin efecto hasta que se borre esa variable.
  const envOverride = Boolean(process.env.ADMIN_PASSWORD);
  return NextResponse.json({ ok: true, envOverride });
}
