import { supabase } from '@/lib/supabase/client';
import { activeResources } from '@/lib/autotask';

export async function syncResourcesFromAutotask(): Promise<{ synced: number; deactivated: number }> {
  const active = await activeResources();
  if (!active.length) return { synced: 0, deactivated: 0 };

  // `role` tiene un CHECK constraint en la tabla real (resources_role_check) que el
  // title libre de Autotask viola — se fija en 'tech', el único valor que usan todas
  // las filas existentes. La columna no se lee en ninguna parte, solo se escribe.
  const rows = active.map((r) => ({
    autotask_resource_id: r.id,
    name: `${r.firstName} ${r.lastName}`.trim(),
    email: r.email?.trim() || null,
    role: 'tech',
    active: true,
  }));

  // Fetch existing rows to split into insert vs update
  const { data: existing, error: fetchErr } = await supabase
    .from('resources')
    .select('autotask_resource_id, active');
  if (fetchErr) throw fetchErr;

  const existingIds = new Set((existing ?? []).map((r) => r.autotask_resource_id as number));
  const activeAtIds = new Set(active.map((r) => r.id));

  const toInsert = rows.filter((r) => !existingIds.has(r.autotask_resource_id));
  const toUpdate = rows.filter((r) => existingIds.has(r.autotask_resource_id));

  if (toInsert.length) {
    const { error } = await supabase.from('resources').insert(toInsert);
    if (error) throw error;
  }

  for (const row of toUpdate) {
    await supabase
      .from('resources')
      .update({ name: row.name, email: row.email, role: row.role, active: true })
      .eq('autotask_resource_id', row.autotask_resource_id);
  }

  // Deactivate resources no longer in Autotask
  let deactivated = 0;
  for (const ex of existing ?? []) {
    if (ex.autotask_resource_id && !activeAtIds.has(ex.autotask_resource_id) && ex.active) {
      await supabase.from('resources').update({ active: false }).eq('autotask_resource_id', ex.autotask_resource_id);
      deactivated++;
    }
  }

  return { synced: rows.length, deactivated };
}

export async function lookupResourceId(name: string): Promise<string | null> {
  const clean = name.trim();
  if (!clean) return null;
  const { data } = await supabase
    .from('resources')
    .select('id')
    .eq('active', true)
    .ilike('name', clean)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}
