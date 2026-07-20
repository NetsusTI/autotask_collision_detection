// Parsea un valor de config guardado en Redis (siempre string|null) como entero
// acotado a [min, max]. Si no hay valor o no es un número válido, usa `fallback` en
// vez de dejar pasar un NaN silencioso (Math.max/min con NaN devuelve NaN, lo que
// rompía usos como `redis.set(key, val, { ex: ttl })` con un TTL inválido).
export function clampInt(raw: string | null | undefined, min: number, max: number, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
