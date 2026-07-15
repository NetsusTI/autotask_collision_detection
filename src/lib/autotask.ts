// Helpers server-side para la API REST de Autotask.
// El secreto (AUTOTASK_SECRET) vive solo en las env de Vercel — nunca en la extensión.
// La zona (webservices12) se mantiene igual que el resto del proyecto (getAutotaskAssignee).

import { redis } from '@/lib/ticket-lock';

const BASE = 'https://webservices12.autotask.net/ATServicesRest/v1.0';

export function autotaskConfigured(): boolean {
  return Boolean(process.env.AUTOTASK_USER && process.env.AUTOTASK_SECRET);
}

function headers(): Record<string, string> {
  return {
    ApiIntegrationCode: 'CCD-NETSUS',
    UserName: process.env.AUTOTASK_USER ?? '',
    Secret: process.env.AUTOTASK_SECRET ?? '',
    'Content-Type': 'application/json',
  };
}

// --- Tipos de filtro (formato REST de Autotask) ---
export type Filter =
  | { op: 'eq' | 'noteq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'beginsWith'; field: string; value: string | number | boolean }
  | { op: 'in' | 'notIn'; field: string; value: (string | number)[] }
  | { op: 'exist' | 'notExist'; field: string }
  | { op: 'and' | 'or'; items: Filter[] };

interface QueryBody {
  MaxRecords?: number;
  IncludeFields?: string[];
  Filter: Filter[];
}

// Ejecuta {Entity}/query. Devuelve items (array) o [] ante cualquier error.
export async function query<T = Record<string, unknown>>(
  entity: 'Tickets' | 'TicketNotes' | 'Resources',
  body: QueryBody,
): Promise<T[]> {
  if (!autotaskConfigured()) return [];
  try {
    const res = await fetch(`${BASE}/${entity}/query`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.items) ? (data.items as T[]) : [];
  } catch {
    return [];
  }
}

export interface AutotaskTicket {
  id: number;
  ticketNumber?: string;
  title?: string;
  queueID?: number;
  status?: number;
  priority?: number;
  assignedResourceID?: number | null;
  createDate?: string;
  lastActivityDate?: string;
  firstResponseDueDateTime?: string | null;
  firstResponseDateTime?: string | null;
  resolutionPlanDueDateTime?: string | null;
  resolutionPlanDateTime?: string | null;
  resolutionDueDateTime?: string | null;
  resolvedDateTime?: string | null;
}

const TICKET_FIELDS = [
  'id', 'ticketNumber', 'title', 'queueID', 'status', 'priority', 'assignedResourceID',
  'createDate', 'lastActivityDate',
  'firstResponseDueDateTime', 'firstResponseDateTime',
  'resolutionPlanDueDateTime', 'resolutionPlanDateTime',
  'resolutionDueDateTime', 'resolvedDateTime',
];

// Status 5 = Complete en la configuración por defecto de Autotask. Tickets "abiertos" = ≠ 5.
const STATUS_COMPLETE = 5;

// Tickets abiertos en las colas vigiladas (para n1 entrante y n5 crítico).
export async function ticketsInQueues(queueIDs: number[], maxRecords = 200): Promise<AutotaskTicket[]> {
  if (!queueIDs.length) return [];
  return query<AutotaskTicket>('Tickets', {
    MaxRecords: maxRecords,
    IncludeFields: TICKET_FIELDS,
    Filter: [
      { op: 'and', items: [
        { op: 'in', field: 'queueID', value: queueIDs },
        { op: 'noteq', field: 'status', value: STATUS_COMPLETE },
      ] },
    ],
  });
}

// Tickets abiertos asignados a un conjunto de recursos (para n2 asignación y n4 SLA).
export async function ticketsAssignedTo(resourceIDs: number[], maxRecords = 300): Promise<AutotaskTicket[]> {
  if (!resourceIDs.length) return [];
  return query<AutotaskTicket>('Tickets', {
    MaxRecords: maxRecords,
    IncludeFields: TICKET_FIELDS,
    Filter: [
      { op: 'and', items: [
        { op: 'in', field: 'assignedResourceID', value: resourceIDs },
        { op: 'noteq', field: 'status', value: STATUS_COMPLETE },
      ] },
    ],
  });
}

// Tickets por lista de IDs (para mapear notas de cliente → ticket/asignado en n3).
export async function ticketsByIds(ids: number[], maxRecords = 200): Promise<AutotaskTicket[]> {
  if (!ids.length) return [];
  return query<AutotaskTicket>('Tickets', {
    MaxRecords: maxRecords,
    IncludeFields: TICKET_FIELDS,
    Filter: [{ op: 'in', field: 'id', value: ids }],
  });
}

export interface AutotaskNote {
  id: number;
  ticketID: number;
  createDateTime?: string;
  lastActivityDate?: string;
  createdByContactID?: number | null;
  title?: string;
}

// Notas creadas por un contacto (cliente) desde `sinceIso` — señal de "respuesta de cliente" (n3).
export async function clientNotesSince(sinceIso: string, maxRecords = 200): Promise<AutotaskNote[]> {
  return query<AutotaskNote>('TicketNotes', {
    MaxRecords: maxRecords,
    IncludeFields: ['id', 'ticketID', 'createDateTime', 'createdByContactID', 'title'],
    Filter: [
      { op: 'and', items: [
        { op: 'gte', field: 'createDateTime', value: sinceIso },
        { op: 'exist', field: 'createdByContactID' },
      ] },
    ],
  });
}

interface AutotaskResource {
  id: number;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
}

// Resuelve "Nombre Apellido" → resourceID consultando Resources, con cache en Redis (7 días).
// Cachea '' cuando no hay match para no reconsultar en cada ciclo.
export async function resolveResourceIdByName(fullName: string): Promise<number | null> {
  const clean = fullName.trim();
  if (!clean) return null;
  const cacheKey = `resource:byname:${clean.toLowerCase()}`;
  const cached = await redis.get<string>(cacheKey);
  if (cached !== null && cached !== undefined) return cached === '' ? null : Number(cached);

  const parts = clean.split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');

  const filter: Filter[] = lastName
    ? [{ op: 'and', items: [
        { op: 'eq', field: 'firstName', value: firstName },
        { op: 'eq', field: 'lastName', value: lastName },
      ] }]
    : [{ op: 'eq', field: 'firstName', value: firstName }];

  const resources = await query<AutotaskResource>('Resources', {
    MaxRecords: 5,
    IncludeFields: ['id', 'firstName', 'lastName', 'isActive'],
    Filter: filter,
  });

  const match = resources.find((r) => r.isActive) ?? resources[0];
  const id = match?.id ?? null;
  await redis.set(cacheKey, id === null ? '' : String(id), { ex: 7 * 24 * 3600 });
  if (id !== null) await redis.set(`resource:byid:${id}`, clean, { ex: 7 * 24 * 3600 });
  return id;
}

// Reverso del cache anterior — nombre a mostrar para un resourceID ya resuelto antes.
// Best-effort: si nunca se resolvió ese ID, devuelve null (no dispara una consulta nueva).
export async function resolveNameByResourceId(id: number): Promise<string | null> {
  return redis.get<string>(`resource:byid:${id}`);
}

// URL del ticket en la UI de Autotask, si se configuró la base (config:autotask_ui_base).
export function buildTicketUrl(uiBase: string | null, ticketId: number): string | undefined {
  if (!uiBase) return undefined;
  const base = uiBase.replace(/\/+$/, '');
  return `${base}/Mvc/ServiceDesk/TicketDetail.mvc?ticketId=${ticketId}`;
}
