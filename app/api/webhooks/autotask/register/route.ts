import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';
import { checkAdminSession } from '@/lib/admin-auth';
import { autotaskConfigured, headers as autotaskHeaders, BASE } from '@/lib/autotask';

// Acción administrativa manual — se dispara UNA VEZ desde el panel admin, no se
// auto-ejecuta en ningún cron/deploy. Registra el webhook de Tickets en Autotask
// apuntando a app/api/webhooks/autotask/route.ts.
//
// Los nombres/formato exactos de TicketWebhooks/TicketWebhookFields están pobremente
// documentados en público (verificado — no hay confirmación oficial de cómo se resuelve
// el FieldID de cada campo del lado de Autotask). Por eso esto es deliberadamente
// best-effort en la suscripción de campos: el webhook principal (que sí está bien
// documentado) se crea igual aunque algún campo puntual falle, y la respuesta detalla
// campo por campo qué pasó — para revisar en vivo (ver release/README.md del plan).
const WEBHOOK_URL = 'https://netsus-two.vercel.app/api/webhooks/autotask';
const WEBHOOK_NAME = 'Autotask CoView';
const DESIRED_FIELDS = ['status', 'assignedResourceID', 'priority', 'ticketNumber', 'title'];

interface FieldResult {
  field: string;
  ok: boolean;
  detail: string;
}

async function resolveFieldIds(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await fetch(`${BASE}/Tickets/entityInformation/fields`, { headers: autotaskHeaders() });
    if (!res.ok) return map;
    const data = await res.json();
    const fields: { name?: string; id?: string | number; fieldID?: string | number }[] = data?.fields ?? [];
    for (const f of fields) {
      if (!f.name) continue;
      const id = f.id ?? f.fieldID;
      if (id !== undefined && id !== null) map.set(f.name.toLowerCase(), String(id));
    }
  } catch {
    // devuelve el mapa vacío — cada campo queda reportado como "no resuelto" abajo
  }
  return map;
}

async function subscribeField(webhookId: string, fieldId: string): Promise<Response> {
  return fetch(`${BASE}/TicketWebhooks/${webhookId}/Fields`, {
    method: 'POST',
    headers: autotaskHeaders(),
    body: JSON.stringify({
      WebhookID: webhookId,
      FieldID: fieldId,
      IsSubscribedField: true,   // dispara el callout cuando este campo cambia
      IsDisplayAlwaysField: true, // e incluye su valor en el payload siempre
    }),
  });
}

export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await checkAdminSession(request))) return NextResponse.json({ error: 'admin session required' }, { status: 403 });

  if (!autotaskConfigured()) {
    return NextResponse.json({ error: 'Autotask no configurado (faltan credenciales en Vercel)' }, { status: 400 });
  }
  const secret = process.env.AUTOTASK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Falta AUTOTASK_WEBHOOK_SECRET en las variables de entorno — configúralo en Vercel antes de registrar' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;

  const existing = await redis.get<string>('config:autotask_webhook_id');
  if (existing && !force) {
    return NextResponse.json({ ok: true, alreadyRegistered: true, webhookId: existing });
  }

  let webhookId: string;
  try {
    const res = await fetch(`${BASE}/TicketWebhooks`, {
      method: 'POST',
      headers: autotaskHeaders(),
      body: JSON.stringify({
        Name: WEBHOOK_NAME,
        WebhookUrl: WEBHOOK_URL,
        DeactivationUrl: WEBHOOK_URL,
        IsActive: true,
        IsSubscribedToUpdateEvents: true,
        SecretKey: secret,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json({ error: 'Autotask rechazó la creación del webhook', status: res.status, detail: data }, { status: 502 });
    }
    const id = data?.itemId ?? data?.item?.id ?? data?.id;
    if (id === undefined || id === null) {
      return NextResponse.json({ error: 'Autotask no devolvió un ID de webhook reconocible', detail: data }, { status: 502 });
    }
    webhookId = String(id);
  } catch (e) {
    return NextResponse.json({ error: 'Fallo de red hablando con Autotask', detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  await redis.set('config:autotask_webhook_id', webhookId);

  // Suscripción de campos — best-effort, no bloquea el registro del webhook principal.
  const fieldIds = await resolveFieldIds();
  const fieldResults: FieldResult[] = [];
  for (const field of DESIRED_FIELDS) {
    const fieldId = fieldIds.get(field.toLowerCase());
    if (!fieldId) {
      fieldResults.push({ field, ok: false, detail: 'no se encontró el FieldID en entityInformation/fields' });
      continue;
    }
    try {
      const res = await subscribeField(webhookId, fieldId);
      if (res.ok) {
        fieldResults.push({ field, ok: true, detail: `FieldID ${fieldId}` });
      } else {
        const detail = await res.text().catch(() => '');
        fieldResults.push({ field, ok: false, detail: `HTTP ${res.status}: ${detail.slice(0, 200)}` });
      }
    } catch (e) {
      fieldResults.push({ field, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, webhookId, webhookUrl: WEBHOOK_URL, fieldResults });
}
