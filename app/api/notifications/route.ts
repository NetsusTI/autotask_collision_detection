import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/ticket-lock';
import { registerActiveResource, runPoll, drainFeed } from '@/lib/notif-poll';

// GET /api/notifications?user=<nombre>
// Registra al técnico como activo, dispara un ciclo de poll (lock-guarded) y
// devuelve/vacía su feed pendiente de notificaciones n1–n5.
export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = request.nextUrl.searchParams.get('user')?.trim();
  if (!user) return NextResponse.json({ items: [], error: 'missing user' }, { status: 400 });

  const rid = await registerActiveResource(user);
  if (rid === null) {
    // No pudimos resolver el nombre a un recurso de Autotask (nombre no coincide).
    return NextResponse.json({ items: [], resourceResolved: false });
  }

  // Poll oportunista; si otro cliente tiene el lock, devuelve rápido sin repetir el trabajo.
  await runPoll();

  const items = await drainFeed(rid);
  return NextResponse.json({ items, resourceResolved: true });
}
