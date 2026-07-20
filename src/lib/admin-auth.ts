import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { redis } from '@/lib/ticket-lock';

// Sesión de admin — separada del x-api-key de la extensión (ese lo trae embebido
// cualquiera que instale/descompile la extensión, así que no alcanza para gatear
// acciones destructivas como borrar el historial o cambiar el webhook de Teams).
// /api/admin/auth emite este token tras validar la contraseña; los endpoints
// administrativos lo exigen además del x-api-key.
const SESSION_TTL = 12 * 3600; // 12h

export async function createAdminSession(): Promise<string> {
  const token = randomUUID();
  await redis.set(`adminsession:${token}`, '1', { ex: SESSION_TTL });
  return token;
}

export async function checkAdminSession(request: NextRequest): Promise<boolean> {
  const token = request.headers.get('x-admin-token');
  if (!token) return false;
  return (await redis.get(`adminsession:${token}`)) !== null;
}

// Rate limit simple de /api/admin/auth por IP — solo cuenta intentos fallidos,
// para no bloquear a un admin legítimo que re-loguea seguido.
const RATE_LIMIT_WINDOW = 300; // 5 min
const RATE_LIMIT_MAX = 5;

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function isAuthRateLimited(request: NextRequest): Promise<boolean> {
  const count = await redis.get<number>(`adminauth:fail:${clientIp(request)}`);
  return (count ?? 0) >= RATE_LIMIT_MAX;
}

export async function registerAuthFailure(request: NextRequest): Promise<void> {
  const key = `adminauth:fail:${clientIp(request)}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, RATE_LIMIT_WINDOW);
}
