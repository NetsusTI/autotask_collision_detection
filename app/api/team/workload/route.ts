import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/ticket-lock';
import { checkAdminSession } from '@/lib/admin-auth';
import { supabase } from '@/lib/supabase/client';
import { autotaskConfigured, ticketsAssignedTo, closedTicketsAssignedTo } from '@/lib/autotask';

// Carga de trabajo por técnico: tickets abiertos ahora + resueltos y tiempo promedio
// de resolución en los últimos 30 días. Complementa el análisis de colisiones (que
// mide conflictos, no carga) — útil para balancear asignaciones nuevas.
export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await checkAdminSession(request))) return NextResponse.json({ error: 'admin session required' }, { status: 403 });

  if (!autotaskConfigured()) return NextResponse.json({ configured: false, techs: [] });

  const { data: roster, error } = await supabase
    .from('resources')
    .select('autotask_resource_id, name')
    .eq('active', true)
    .not('autotask_resource_id', 'is', null);
  if (error) return NextResponse.json({ error: 'db error' }, { status: 500 });

  const resourceIDs = (roster ?? [])
    .map((r) => r.autotask_resource_id)
    .filter((id): id is number => id !== null);
  if (!resourceIDs.length) return NextResponse.json({ configured: true, techs: [] });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const [openTickets, closedTickets] = await Promise.all([
    ticketsAssignedTo(resourceIDs, 500),
    closedTicketsAssignedTo(resourceIDs, thirtyDaysAgo, 500),
  ]);

  const openByResource = new Map<number, number>();
  for (const t of openTickets) {
    if (t.assignedResourceID == null) continue;
    openByResource.set(t.assignedResourceID, (openByResource.get(t.assignedResourceID) ?? 0) + 1);
  }

  const resolutionMsByResource = new Map<number, number[]>();
  for (const t of closedTickets) {
    if (t.assignedResourceID == null) continue;
    const created = t.createDate ? Date.parse(t.createDate) : NaN;
    const resolved = t.resolvedDateTime ? Date.parse(t.resolvedDateTime) : NaN;
    if (Number.isNaN(created) || Number.isNaN(resolved) || resolved < created) continue;
    const arr = resolutionMsByResource.get(t.assignedResourceID) ?? [];
    arr.push(resolved - created);
    resolutionMsByResource.set(t.assignedResourceID, arr);
  }

  const techs = (roster ?? [])
    .filter((r) => r.autotask_resource_id !== null)
    .map((r) => {
      const id = r.autotask_resource_id as number;
      const durations = resolutionMsByResource.get(id) ?? [];
      const avgResolutionHours = durations.length
        ? Math.round((durations.reduce((s, d) => s + d, 0) / durations.length / 3600000) * 10) / 10
        : null;
      return {
        name: r.name,
        autotask_resource_id: id,
        openTickets: openByResource.get(id) ?? 0,
        resolvedLast30d: durations.length,
        avgResolutionHours,
      };
    })
    .sort((a, b) => b.openTickets - a.openTickets);

  return NextResponse.json({ configured: true, techs });
}
