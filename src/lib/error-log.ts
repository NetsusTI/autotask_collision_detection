// Rastro de errores que hoy se tragan en silencio a propósito (fire-and-forget:
// un fallo de Teams/Autotask/Graph no debe tumbar la respuesta real al usuario).
// Sin esto, un fallo persistente (ej. un client secret vencido) no se nota hasta
// que alguien reporta "no me llegó tal cosa" — logError() deja un rastro visible
// en el panel admin sin arriesgar el flujo principal: nunca lanza, best-effort.

import { supabase } from '@/lib/supabase/client';

export async function logError(source: string, error: unknown, extra?: string): Promise<void> {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const detailParts = [
      error instanceof Error && error.stack ? error.stack : null,
      extra ?? null,
    ].filter(Boolean);
    await supabase.from('error_log').insert({
      source,
      message: message.slice(0, 500),
      detail: detailParts.join('\n').slice(0, 2000) || null,
    });
  } catch {
    // Si ni esto funciona (Supabase caído), no hay nada más que hacer — el
    // objetivo es no perder el error original, no garantizar que el logging
    // en sí sea infalible.
  }
}
