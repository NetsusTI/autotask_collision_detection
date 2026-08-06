import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/ticket-lock';
import { autotaskConfigured } from '@/lib/autotask';
import { activeResourceIdSet } from '@/lib/notif-poll';
import { supabase } from '@/lib/supabase/client';

// Roster activo (Supabase) + quién de ellos tiene la extensión abierta ahora mismo
// (registrado por el poller n1–n5 al resolver su nombre, ventana de 2h). Alimenta
// el panel "Técnicos disponibles" del admin — distinto de "Técnicos ocupados"
// (presencia en un ticket específico).
export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const configured = autotaskConfigured();

  const [onlineIds, { data: roster, error }] = await Promise.all([
    configured ? activeResourceIdSet() : Promise.resolve(new Set<number>()),
    supabase.from('resources').select('autotask_resource_id, name').eq('active', true).order('name'),
  ]);

  if (error) return NextResponse.json({ error: 'db error' }, { status: 500 });

  const techs = (roster ?? []).map((r) => ({
    name: r.name,
    autotask_resource_id: r.autotask_resource_id,
    online: r.autotask_resource_id !== null && onlineIds.has(r.autotask_resource_id),
  }));

  return NextResponse.json({
    configured,
    total: techs.length,
    online: techs.filter((t) => t.online).length,
    techs,
  });
}
