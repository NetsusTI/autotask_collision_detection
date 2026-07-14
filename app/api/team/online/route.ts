import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/ticket-lock';
import { autotaskConfigured } from '@/lib/autotask';
import { activeTeamCount } from '@/lib/notif-poll';

// Cantidad de técnicos con la extensión activa en las últimas 2h (registrados por
// el poller n1–n5 al resolver su nombre a un recurso de Autotask). Aproximación de
// "en línea" para el stat "técnicos disponibles" del panel admin.
export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const configured = autotaskConfigured();
  const online = configured ? await activeTeamCount() : 0;
  return NextResponse.json({ online, configured });
}
