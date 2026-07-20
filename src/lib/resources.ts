// Roster de técnicos válidos (tabla `resources` en Supabase), sincronizado desde
// Autotask. Sirve para verificar que un nombre que llega desde la extensión (colisión,
// notificación, feedback) corresponde a un técnico real antes de guardarlo — así alguien
// externo o con un nombre inventado no puede quedar registrado como si fuera del equipo.

import { supabase } from '@/lib/supabase';
import { activeResources } from '@/lib/autotask';

export async function syncResourcesFromAutotask(): Promise<{ synced: number; deactivated: number }> {
  const active = await activeResources();
  if (!active.length) return { synced: 0, deactivated: 0 };

  const rows = active.map((r) => ({
    autotask_resource_id: r.id,
    name: `${r.firstName} ${r.lastName}`.trim(),
    email: r.email,
    role: r.title,
    active: true,
  }));

  const { error: upsertError } = await supabase
    .from('resources')
    .upsert(rows, { onConflict: 'autotask_resource_id' });
  if (upsertError) throw upsertError;

  // Cualquier técnico que ya no viene en la lista de activos de Autotask se marca
  // inactivo (no se borra — conserva el historial que ya tenga asociado).
  const activeIds = active.map((r) => r.id);
  const { data: toDeactivate, error: deactivateError } = await supabase
    .from('resources')
    .update({ active: false })
    .eq('active', true)
    .not('autotask_resource_id', 'in', `(${activeIds.join(',')})`)
    .select('id');
  if (deactivateError) throw deactivateError;

  return { synced: rows.length, deactivated: toDeactivate?.length ?? 0 };
}

// Resuelve un nombre libre (detectado en Autotask o escrito a mano) al id (uuid) de su
// fila en `resources`. null si no coincide con ningún técnico conocido y activo — quien
// llama decide si eso bloquea el registro (feedback) o solo omite la fila (colisión/
// notificación). No confundir con resolveResourceIdByName de autotask.ts, que resuelve
// contra la API de Autotask y devuelve el resourceID numérico, no este uuid.
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
