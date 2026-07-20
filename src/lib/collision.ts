// Lógica pura de detección de colisión — separada de app/api/presence/[id]/route.ts
// para poder testearla sin mockear Redis/Supabase.

// Compara nombres ignorando mayúsculas/espacios — evita que una variante de
// mayúsculas/espacios del propio usuario (u otra persona ya contada) dispare una
// falsa auto-colisión o aparezca duplicada en la lista de "otros".
export function normName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Dado el listado crudo de nombres presentes en un ticket (uno por cada clave de
// presencia en Redis) y el usuario actual, arma la lista de "otros" excluyendo al
// propio usuario y sin duplicados por variantes de mayúsculas/espacios. Conserva la
// primera grafía vista para cada persona.
export function dedupeOthers(allNames: string[], currentUser: string): string[] {
  const normalizedUser = normName(currentUser);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of allNames) {
    const nk = normName(name);
    if (nk === normalizedUser || seen.has(nk)) continue;
    seen.add(nk);
    result.push(name);
  }
  return result;
}

// Minutos transcurridos desde que se registró la entrada (`ticketentry:*`, timestamp
// en ms como string). Devuelve 0 si no hay timestamp registrado.
export function minutesSince(entryTs: string | null | undefined, now: number): number {
  if (!entryTs) return 0;
  return Math.floor((now - Number(entryTs)) / 60000);
}

// Formatea una duración en ms como "Xm Ys" (o "Ys" si dura menos de un minuto), para
// los webhooks/notificaciones de colisión resuelta.
export function formatDuration(ms: number): string {
  const totalSecs = Math.round(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}
