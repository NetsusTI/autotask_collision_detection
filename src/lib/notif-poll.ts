// Poller server-side de n1–n5 + feed por recurso.
// Se ejecuta lock-guarded (un solo ciclo aunque lo disparen varios clientes/el cron).
// Calcula eventos relevantes por técnico y los deja en notif:feed:<resourceID>,
// que la extensión drena y vuelca en el buzón (lib/notifications de la extensión).

import { redis } from '@/lib/ticket-lock';
import { supabase } from '@/lib/supabase/client';
import { lookupResourceId } from '@/lib/supabase/resources';
import { clampInt } from '@/lib/num';
import {
  autotaskConfigured,
  ticketsInQueues,
  ticketsAssignedTo,
  ticketsByIds,
  clientNotesSince,
  resolveResourceIdByName,
  resolveNameByResourceId,
  buildTicketUrl,
  type AutotaskTicket,
} from '@/lib/autotask';

// Log central de notificaciones — feed agregado de TODO el equipo (n1–n5 + eventos
// de colisión), independiente del feed por-recurso que cada extensión drena. Alimenta
// el tab "Centro de Notificaciones" del panel web (GET /api/notifications/log lee
// directo de Supabase, no de Redis — no hay lista intermedia que mantener aquí).

export interface CentralLogEntry {
  type: string;
  title: string;
  body: string;
  ticketId?: string;
  ticketNumber?: string;
  ticketUrl?: string;
  targets?: string[]; // nombres resueltos, best-effort
  ts: number;
}

export async function logCentralNotification(entry: CentralLogEntry): Promise<void> {
  // Una fila por destinatario (la tabla es por-técnico). Solo se guardan los que
  // resuelven a un técnico real conocido (evita que un nombre inventado quede
  // registrado). Best-effort — si Supabase falla, no bloqueamos el resto del poll.
  if (entry.targets?.length) {
    try {
      const resolved = await Promise.all(
        entry.targets.map(async (resource_name) => ({ resource_name, resource_id: await lookupResourceId(resource_name) })),
      );
      const rows = resolved
        .filter((r) => r.resource_id !== null)
        .map((r) => ({
          resource_name: r.resource_name,
          resource_id: r.resource_id,
          type: entry.type,
          title: entry.title,
          body: entry.body,
          ticket_id: entry.ticketId ?? null,
          ticket_number: entry.ticketNumber ?? null,
          ticket_url: entry.ticketUrl ?? null,
          read: false,
        }));
      if (rows.length) await supabase.from('notifications').insert(rows);
    } catch {
      // silencioso: no queremos que un problema de Supabase tumbe el ciclo de poll
    }
  }
}

export type FeedType = 'n1_queue' | 'n2_assign' | 'n3_client' | 'n4_sla' | 'n5_critical';

export interface FeedItem {
  type: FeedType;
  title: string;
  body: string;
  ticketId: string;
  ticketNumber?: string;
  ticketUrl?: string;
  dedupeKey: string;
  ts: number;
}

const LOCK_KEY = 'notif:poll_lock';
const LOCK_TTL = 50;              // s — un ciclo por ventana
const LASTPOLL_KEY = 'notif:lastpoll';
const ACTIVE_KEY = 'team:resources';   // ZSET member=resourceID, score=lastSeenMs
const ACTIVE_WINDOW_MS = 2 * 3600 * 1000;
const FEED_TTL = 24 * 3600;
const FEED_MAX = 50;

// --- Config (editable desde el panel admin) ---
async function getJsonNumbers(key: string, fallback: number[]): Promise<number[]> {
  const raw = await redis.get<string>(key);
  if (!raw) return fallback;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.map(Number).filter((n) => !Number.isNaN(n)) : fallback;
  } catch {
    return fallback;
  }
}

export async function getNotifConfig() {
  const [watchQueues, criticalPriorities, slaRaw, uiBase, enabledRaw] = await Promise.all([
    getJsonNumbers('config:watch_queues', []),
    getJsonNumbers('config:critical_priorities', [1]),
    redis.get<string>('config:sla_warn_min'),
    redis.get<string>('config:autotask_ui_base'),
    redis.get<string>('config:notif_enabled'),
  ]);
  const slaWarnMin = clampInt(slaRaw, 5, 1440, 30);
  return {
    watchQueues,
    criticalPriorities,
    slaWarnMin,
    uiBase: uiBase ?? null,
    enabled: enabledRaw !== '0',
  };
}

// --- Recursos activos ---
export async function registerActiveResource(name: string): Promise<number | null> {
  const rid = await resolveResourceIdByName(name);
  if (rid === null) return null;
  await redis.zadd(ACTIVE_KEY, { score: Date.now(), member: String(rid) });
  return rid;
}

async function activeResourceIds(now: number): Promise<number[]> {
  const members = await redis.zrange<string[]>(ACTIVE_KEY, now - ACTIVE_WINDOW_MS, '+inf', { byScore: true });
  return (members ?? []).map(Number).filter((n) => !Number.isNaN(n));
}

// Cuántos técnicos tienen la extensión activa (resolvieron nombre→resourceID) en la
// última ventana. Aproximación de "en línea" — usada para el stat "técnicos disponibles".
export async function activeTeamCount(): Promise<number> {
  const ids = await activeResourceIds(Date.now());
  return ids.length;
}

// --- Feed ---
export async function drainFeed(rid: number): Promise<FeedItem[]> {
  const key = `notif:feed:${rid}`;
  const items = await redis.lrange<string>(key, 0, -1);
  if (items.length) await redis.del(key);
  const parsed = items
    .map((s) => { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return null; } })
    .filter(Boolean) as FeedItem[];
  // lpush deja lo más nuevo primero; devolvemos cronológico (viejo→nuevo).
  return parsed.reverse();
}

// Empuja un evento a varios recursos, deduplicando por dedupeKey (global) con TTL.
async function pushEvent(resourceIDs: number[], item: FeedItem, seenTtlSec: number): Promise<boolean> {
  if (!resourceIDs.length) return false;
  const seenKey = `notif:seen:${item.dedupeKey}`;
  const first = await redis.set(seenKey, '1', { ex: seenTtlSec, nx: true });
  if (first !== 'OK') return false; // ya emitido dentro de la ventana
  const payload = JSON.stringify(item);
  await Promise.all(resourceIDs.map(async (rid) => {
    const key = `notif:feed:${rid}`;
    await redis.lpush(key, payload);
    await redis.ltrim(key, 0, FEED_MAX - 1);
    await redis.expire(key, FEED_TTL);
  }));

  const targets = (await Promise.all(resourceIDs.map((rid) => resolveNameByResourceId(rid))))
    .filter((n): n is string => n !== null);
  await logCentralNotification({
    type: item.type,
    title: item.title,
    body: item.body,
    ticketId: item.ticketId,
    ticketNumber: item.ticketNumber,
    ticketUrl: item.ticketUrl,
    targets,
    ts: item.ts,
  });

  return true;
}

export function tParsed(s?: string | null): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

// SLA por vencer/vencido (n4): due presente, aún no cumplido, y dentro de la ventana de aviso.
export function slaEvents(t: AutotaskTicket, warnMin: number, now: number): { kind: string; label: string; overdue: boolean }[] {
  const out: { kind: string; label: string; overdue: boolean }[] = [];
  const warnMs = warnMin * 60000;
  const check = (kind: string, label: string, due?: string | null, met?: string | null) => {
    const dueMs = tParsed(due);
    if (dueMs === null || tParsed(met) !== null) return;
    if (dueMs - now <= warnMs) out.push({ kind, label, overdue: dueMs < now });
  };
  check('first', 'Primera respuesta', t.firstResponseDueDateTime, t.firstResponseDateTime);
  check('resolution', 'Resolución', t.resolutionDueDateTime, t.resolvedDateTime);
  return out;
}

// --- Poll principal ---
export async function runPoll(force = false): Promise<{ ran: boolean; counts?: Record<string, number> }> {
  if (!autotaskConfigured()) return { ran: false };

  if (force) {
    await redis.set(LOCK_KEY, '1', { ex: LOCK_TTL });
  } else {
    const got = await redis.set(LOCK_KEY, '1', { ex: LOCK_TTL, nx: true });
    if (got !== 'OK') return { ran: false }; // otro ciclo en curso
  }

  const cfg = await getNotifConfig();
  if (!cfg.enabled) return { ran: false };

  const now = Date.now();
  const lastPoll = Number(await redis.get<string>(LASTPOLL_KEY)) || (now - 5 * 60000);
  const sinceIso = new Date(lastPoll - 60000).toISOString(); // buffer de 1 min por desfases de TZ
  const arrivalCutoff = lastPoll - 120000;                    // buffer de 2 min para n1
  const uiUrl = (id: number) => buildTicketUrl(cfg.uiBase, id);
  const counts: Record<string, number> = { n1: 0, n2: 0, n3: 0, n4: 0, n5: 0 };

  const resources = await activeResourceIds(now);

  // n1 (entrante) + n5 (crítico) en las colas vigiladas → a todos los recursos activos.
  if (cfg.watchQueues.length && resources.length) {
    const qTickets = await ticketsInQueues(cfg.watchQueues);
    for (const t of qTickets) {
      const label = t.ticketNumber || `#${t.id}`;
      const createdMs = tParsed(t.createDate);
      if (createdMs !== null && createdMs >= arrivalCutoff) {
        const ok = await pushEvent(resources, {
          type: 'n1_queue', title: 'Nuevo ticket en la cola',
          body: `${label}${t.title ? ' · ' + t.title : ''} entró en la cola`,
          ticketId: String(t.id), ticketNumber: t.ticketNumber, ticketUrl: uiUrl(t.id),
          dedupeKey: `n1:${t.id}`, ts: now,
        }, 6 * 3600);
        if (ok) counts.n1++;
      }
      if (t.priority !== undefined && cfg.criticalPriorities.includes(t.priority)) {
        const ok = await pushEvent(resources, {
          type: 'n5_critical', title: 'Ticket crítico en la cola',
          body: `${label}${t.title ? ' · ' + t.title : ''} es crítico y está en la cola`,
          ticketId: String(t.id), ticketNumber: t.ticketNumber, ticketUrl: uiUrl(t.id),
          dedupeKey: `n5:${t.id}`, ts: now,
        }, 6 * 3600);
        if (ok) counts.n5++;
      }
    }
  }

  // n2 (asignación) + n4 (SLA) en tickets asignados a recursos activos.
  if (resources.length) {
    const aTickets = await ticketsAssignedTo(resources);
    const byResource = new Map<number, AutotaskTicket[]>();
    for (const t of aTickets) {
      if (t.assignedResourceID == null) continue;
      const arr = byResource.get(t.assignedResourceID) ?? [];
      arr.push(t);
      byResource.set(t.assignedResourceID, arr);
    }

    for (const rid of resources) {
      const mine = byResource.get(rid) ?? [];
      const knownKey = `notif:known_assigned:${rid}`;
      const known = new Set((await redis.smembers(knownKey)).map(String));
      const currentIds = mine.map((t) => String(t.id));

      // Primera vez que vemos a este recurso: sembrar sin notificar (evita avalancha inicial).
      const seeded = known.size > 0 || (await redis.get<string>(`notif:seeded:${rid}`)) === '1';
      for (const t of mine) {
        if (seeded && !known.has(String(t.id))) {
          const label = t.ticketNumber || `#${t.id}`;
          const ok = await pushEvent([rid], {
            type: 'n2_assign', title: 'Ticket asignado a ti',
            body: `Se te asignó ${label}${t.title ? ' · ' + t.title : ''}`,
            ticketId: String(t.id), ticketNumber: t.ticketNumber, ticketUrl: uiUrl(t.id),
            dedupeKey: `n2:${rid}:${t.id}`, ts: now,
          }, 24 * 3600);
          if (ok) counts.n2++;
        }
      }
      // Actualiza el set conocido.
      await redis.del(knownKey);
      if (currentIds.length) {
        await redis.sadd(knownKey, currentIds[0], ...currentIds.slice(1));
        await redis.expire(knownKey, 3 * 24 * 3600);
      }
      await redis.set(`notif:seeded:${rid}`, '1', { ex: 7 * 24 * 3600 });

      // n4 SLA
      for (const t of mine) {
        for (const e of slaEvents(t, cfg.slaWarnMin, now)) {
          const label = t.ticketNumber || `#${t.id}`;
          const ok = await pushEvent([rid], {
            type: 'n4_sla', title: e.overdue ? `SLA vencido · ${e.label}` : `SLA por vencer · ${e.label}`,
            body: `${label}${t.title ? ' · ' + t.title : ''} — ${e.label} ${e.overdue ? 'ya venció' : 'está por vencer'}`,
            ticketId: String(t.id), ticketNumber: t.ticketNumber, ticketUrl: uiUrl(t.id),
            dedupeKey: `n4:${t.id}:${e.kind}`, ts: now,
          }, 6 * 3600);
          if (ok) counts.n4++;
        }
      }
    }
  }

  // n3 (respuesta de cliente) — notas de contacto desde el último poll, al técnico asignado.
  const notes = await clientNotesSince(sinceIso);
  if (notes.length && resources.length) {
    const ticketIds = [...new Set(notes.map((n) => n.ticketID))];
    const noteTickets = await ticketsByIds(ticketIds);
    const byId = new Map(noteTickets.map((t) => [t.id, t]));
    const activeSet = new Set(resources);
    for (const note of notes) {
      const t = byId.get(note.ticketID);
      if (!t || t.assignedResourceID == null || !activeSet.has(t.assignedResourceID)) continue;
      const label = t.ticketNumber || `#${t.id}`;
      const ok = await pushEvent([t.assignedResourceID], {
        type: 'n3_client', title: 'Respuesta de cliente',
        body: `El cliente respondió en ${label}${t.title ? ' · ' + t.title : ''}`,
        ticketId: String(t.id), ticketNumber: t.ticketNumber, ticketUrl: uiUrl(t.id),
        dedupeKey: `n3:${note.id}`, ts: now,
      }, 24 * 3600);
      if (ok) counts.n3++;
    }
  }

  await redis.set(LASTPOLL_KEY, String(now));
  return { ran: true, counts };
}
