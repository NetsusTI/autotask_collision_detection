// Verificación y parseo del webhook de Tickets de Autotask — funciones puras, sin
// I/O (mismo criterio que src/lib/sanitize.ts / collision.ts: testeables sin mocks).
// Ver docs oficiales: firma HMAC-SHA1 en base64, header X-Hook-Signature: sha1=<b64>,
// calculado sobre el body crudo del request (no sobre un JSON re-serializado — el
// caller debe pasar exactamente los bytes que llegaron, antes de cualquier parseo).
import { createHmac, timingSafeEqual } from 'crypto';

// Nunca lanza — cualquier input raro (header ausente/con formato distinto, secreto
// vacío, etc.) resuelve a `false` en vez de tirar una excepción que tumbe la ruta.
export function verifyWebhookSignature(rawBody: string, headerValue: string | null, secret: string): boolean {
  if (!headerValue || !secret) return false;
  const received = headerValue.startsWith('sha1=') ? headerValue.slice(5) : headerValue;
  if (!received) return false;

  try {
    const expected = createHmac('sha1', secret).update(rawBody, 'utf8').digest('base64');
    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(received);
    // timingSafeEqual tira si los buffers no miden igual — un secreto/firma mal
    // formados no deben verificar por accidente, así que ese caso también es `false`.
    if (expectedBuf.length !== receivedBuf.length) return false;
    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

export type WebhookAction = 'Create' | 'Update' | 'Delete' | 'Deactivated' | 'unknown';

export interface ParsedWebhookPayload {
  action: WebhookAction;
  id: number | null;
  changedFields: string[] | null;
  raw: unknown;
}

const KNOWN_ACTIONS: WebhookAction[] = ['Create', 'Update', 'Delete', 'Deactivated'];

// Normalizador defensivo — Autotask no publica el casing exacto de las claves del
// payload en su documentación pública, así que esto nunca asume una forma fija:
// ante cualquier shape inesperado devuelve action:'unknown'/id:null en vez de tirar,
// y el caller decide qué hacer (loguear para inspección, no romper la respuesta 200
// que evita que Autotask cuente esto como una entrega fallida).
export function parseWebhookPayload(raw: unknown): ParsedWebhookPayload {
  if (!raw || typeof raw !== 'object') {
    return { action: 'unknown', id: null, changedFields: null, raw };
  }
  const obj = raw as Record<string, unknown>;
  const actionRaw = obj.Action ?? obj.action;
  const action: WebhookAction = KNOWN_ACTIONS.includes(actionRaw as WebhookAction)
    ? (actionRaw as WebhookAction)
    : 'unknown';

  const idRaw = obj.Id ?? obj.id ?? obj.ItemId ?? obj.itemId;
  const id = typeof idRaw === 'number' ? idRaw
    : typeof idRaw === 'string' && idRaw.trim() && !Number.isNaN(Number(idRaw)) ? Number(idRaw)
    : null;

  const fieldsRaw = obj.Fields ?? obj.fields;
  const changedFields = Array.isArray(fieldsRaw)
    ? fieldsRaw
        .map((f) => (typeof f === 'string' ? f : (f as Record<string, unknown>)?.Name ?? (f as Record<string, unknown>)?.name))
        .filter((f): f is string => typeof f === 'string')
    : null;

  return { action, id, changedFields, raw };
}

// Autotask no publica el formato exacto de los VALORES dentro de "Fields" (¿objetos
// {Name,Value} por campo? ¿claves sueltas a nivel raíz?) — esto intenta varias formas
// conocidas de payloads de webhook estilo Autotask y devuelve `undefined` si ninguna
// calzó, en vez de arriesgarse a leer un valor de un lugar equivocado. `undefined`
// (campo no encontrado) es distinto de `null` (encontrado, valor null) — el caller usa
// esa diferencia para decidir entre "invalidar caché" y "no tocar nada".
function findFieldRaw(raw: unknown, fieldNames: string[]): unknown {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;

  // Forma 1: array Fields con objetos {Name/name, Value/value}.
  const fieldsRaw = obj.Fields ?? obj.fields;
  if (Array.isArray(fieldsRaw)) {
    for (const f of fieldsRaw) {
      if (!f || typeof f !== 'object') continue;
      const fo = f as Record<string, unknown>;
      const name = fo.Name ?? fo.name;
      if (typeof name === 'string' && fieldNames.includes(name)) return fo.Value ?? fo.value ?? null;
    }
  }

  // Forma 2: claves sueltas a nivel raíz (o dentro de un sub-objeto "Item"/"item").
  const candidates = [obj, (obj.Item ?? obj.item) as Record<string, unknown> | undefined].filter(Boolean) as Record<string, unknown>[];
  for (const c of candidates) {
    for (const name of fieldNames) {
      if (name in c) return c[name];
    }
  }

  return undefined; // no encontrado en ninguna forma
}

export function extractFieldValue(raw: unknown, fieldNames: string[]): number | null | undefined {
  const value = findFieldRaw(raw, fieldNames);
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return undefined; // encontrado pero con un tipo que no se puede interpretar como número
}

export function extractFieldString(raw: unknown, fieldNames: string[]): string | null | undefined {
  const value = findFieldRaw(raw, fieldNames);
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}
