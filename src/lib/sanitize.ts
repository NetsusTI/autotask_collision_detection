// Validación de entrada compartida por las rutas de presencia — extraído a un
// módulo aparte (en vez de vivir inline en app/api/presence/[id]/route.ts) para
// poder testearlo con vitest sin arrastrar Next.js/Redis, y para que no haya
// dos copias de la misma regla si en el futuro otra ruta necesita lo mismo.

// El `id` de ticket termina metido crudo en patrones glob de redis.keys()
// (`ticketpresence:${id}:*`) — sin esta validación, un id con '*' o ':' amplía
// el patrón y puede mezclar presencia de otros tickets. Se acepta lo que
// realmente puede llegar como ticket id (número de ticket de Autotask o el id
// numérico interno), nunca caracteres de control de Redis.
export function isValidTicketId(id: string): boolean {
  return /^[A-Za-z0-9._-]{1,100}$/.test(id);
}

// `user` llega tal cual del cliente y termina: (a) como parte de una key de
// Redis, (b) insertado en Supabase (collision_history.users), y (c) renderizado
// en el panel admin. No se intenta "limpiar" el HTML (whack-a-mole) — se
// restringe directamente a lo que un nombre real puede contener, y se trunca a
// un largo razonable.
export function sanitizeUser(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, 60);
  if (!trimmed) return null;
  if (!/^[\p{L}\p{N} .,'()\-]+$/u.test(trimmed)) return null;
  return trimmed;
}
