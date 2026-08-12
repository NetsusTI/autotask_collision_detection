import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/ticket-lock';
import { logError } from '@/lib/error-log';
import { verifyWebhookSignature, parseWebhookPayload, extractFieldValue, extractFieldString } from '@/lib/autotask-webhook';
import { applyWebhookTicketUpdate, buildTicketUrl, resolveNameByResourceId } from '@/lib/autotask';
import { getNotifConfig, activeResourceIdSet, pushEvent } from '@/lib/notif-poll';

// Receptor del webhook de Tickets de Autotask (ver release/README.md y el plan de esta
// migración) — el ÚNICO endpoint de este proyecto cuyo llamador no somos nosotros. La
// autenticación es 100% vía firma HMAC, no x-api-key/sesión admin (Autotask no los tiene).
//
// Camino ADITIVO: esto acelera n1/n2/n5 y calienta la caché de status/asignado que ya
// lee app/api/presence/[id]/route.ts, pero el poll periódico (src/lib/notif-poll.ts)
// sigue corriendo sin cambios como red de seguridad — ver dedupeKey compartido abajo.
const NO_SECRET_LOG_KEY = 'webhookcfg:autotask_secret_missing_logged';
const unparsedFieldLogKey = (field: string) => `webhookcfg:autotask_unparsed_${field}_logged`;

export async function POST(request: NextRequest) {
  // Crudo primero, SIEMPRE — la firma se calcula sobre estos bytes exactos, no sobre
  // un JSON re-serializado (que puede diferir en espacios/orden de claves y no matchear).
  const rawBody = await request.text();

  const secret = process.env.AUTOTASK_WEBHOOK_SECRET;
  if (!secret) {
    // Deduped: un config roto no debe inundar error_log con un log por cada callout.
    const first = await redis.set(NO_SECRET_LOG_KEY, '1', { ex: 3600, nx: true });
    if (first === 'OK') logError('webhook:autotask:no-secret', new Error('AUTOTASK_WEBHOOK_SECRET no configurado'));
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }

  const signature = request.headers.get('x-hook-signature');
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    // Correcto que esto cuente para el umbral de auto-desactivación de Autotask — un
    // secreto mal puesto debe hacerse notar, no fallar en silencio.
    logError('webhook:autotask:badsig', new Error('Firma inválida en callout de Autotask'), rawBody.slice(0, 300));
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload;
  try {
    payload = parseWebhookPayload(JSON.parse(rawBody));
  } catch (e) {
    // La entrega en sí funcionó (la firma es válida) — un JSON que no calza es un
    // problema nuestro de interpretación, no una entrega fallida: 200 igual, para no
    // arriesgar que Autotask cuente esto para su umbral de desactivación automática.
    logError('webhook:autotask:parse', e, rawBody.slice(0, 500));
    return NextResponse.json({ ok: true });
  }

  if (payload.action === 'Deactivated') {
    // Silencioso de otra forma sería una regresión invisible a "solo polling" — que es
    // segura (la red de seguridad sigue andando), pero debe quedar visible igual.
    logError('webhook:autotask:deactivated', new Error('Autotask desactivó el webhook de Tickets'), JSON.stringify(payload.raw).slice(0, 500));
    return NextResponse.json({ ok: true });
  }

  if (payload.id === null || (payload.action !== 'Create' && payload.action !== 'Update')) {
    return NextResponse.json({ ok: true }); // Delete u otra acción — nada que hacer por ahora
  }

  try {
    await handleTicketEvent(payload.id, payload.action, payload.changedFields ?? [], payload.raw);
  } catch (e) {
    logError('webhook:autotask:handle', e, `ticket=${payload.id} action=${payload.action}`);
  }
  return NextResponse.json({ ok: true });
}

async function handleTicketEvent(id: number, action: 'Create' | 'Update', changedFields: string[], raw: unknown) {
  const isCreate = action === 'Create';
  const changed = new Set(changedFields.map((f) => f.toLowerCase()));
  // En un Create no hay "campos cambiados" — todo lo suscrito viene en el payload.
  const touches = (field: string) => isCreate || changed.has(field.toLowerCase());

  const statusVal = touches('status') ? extractFieldValue(raw, ['status', 'Status']) : undefined;
  const assignedVal = touches('assignedResourceID') ? extractFieldValue(raw, ['assignedResourceID', 'AssignedResourceID']) : undefined;
  const priorityVal = touches('priority') ? extractFieldValue(raw, ['priority', 'Priority']) : undefined;
  const ticketNumber = extractFieldString(raw, ['ticketNumber', 'TicketNumber']) ?? undefined;
  const title = extractFieldString(raw, ['title', 'Title']) ?? undefined;

  // Autotask dijo que el campo cambió pero no lo pudimos leer del payload — avisar UNA
  // vez (deduped por campo) para poder revisar el shape real en vez de adivinar.
  await Promise.all(
    (['status', 'assignedResourceID'] as const)
      .filter((f) => touches(f) && (f === 'status' ? statusVal === undefined : assignedVal === undefined))
      .map(async (f) => {
        const key = unparsedFieldLogKey(f);
        const first = await redis.set(key, '1', { ex: 24 * 3600, nx: true });
        if (first === 'OK') {
          logError('webhook:autotask:unparsed-field', new Error(`No se pudo leer "${f}" del payload del webhook`), JSON.stringify(raw).slice(0, 800));
        }
      }),
  );

  const known: { status?: number | null; assignedResourceID?: number | null; priority?: number | null } = {};
  if (statusVal !== undefined) known.status = statusVal;
  if (assignedVal !== undefined) known.assignedResourceID = assignedVal;
  if (priorityVal !== undefined) known.priority = priorityVal;

  await applyWebhookTicketUpdate(id, known, {
    status: touches('status') && statusVal === undefined,
    assignedResourceID: touches('assignedResourceID') && assignedVal === undefined,
  });

  // --- Notificaciones (n1/n2/n5) — mismo dedupeKey que runPoll() en notif-poll.ts, así
  // el poll de reconciliación (que sigue corriendo sin cambios) nunca duplica el aviso
  // cuando llegue a ver lo mismo unos segundos/minutos después.
  const cfg = await getNotifConfig();
  if (!cfg.enabled) return;
  const resourceSet = await activeResourceIdSet();
  const resources = [...resourceSet];
  const now = Date.now();
  const uiUrl = buildTicketUrl(cfg.uiBase, id);
  const label = ticketNumber || `#${id}`;
  const titleSuffix = title ? ` · ${title}` : '';

  if (isCreate) {
    let assigneeSuffix = ' — sin asignar';
    if (assignedVal !== undefined && assignedVal !== null) {
      const assigneeName = await resolveNameByResourceId(assignedVal);
      assigneeSuffix = assigneeName ? ` — asignado a ${assigneeName}` : ' — sin asignar';
    }
    await pushEvent(resources, {
      type: 'n1_queue', title: 'Nuevo ticket en la cola',
      body: `${label}${titleSuffix} entró en la cola${assigneeSuffix}`,
      ticketId: String(id), ticketNumber, ticketUrl: uiUrl,
      dedupeKey: `n1:${id}`, ts: now,
    }, 6 * 3600);
  }

  if (priorityVal !== undefined && priorityVal !== null && cfg.criticalPriorities.includes(priorityVal)) {
    await pushEvent(resources, {
      type: 'n5_critical', title: 'Ticket crítico en la cola',
      body: `${label}${titleSuffix} es crítico y está en la cola`,
      ticketId: String(id), ticketNumber, ticketUrl: uiUrl,
      dedupeKey: `n5:${id}`, ts: now,
    }, 6 * 3600);
  }

  if (assignedVal !== undefined && assignedVal !== null && resourceSet.has(assignedVal)) {
    // Misma protección anti-avalancha que runPoll(): no avisar la primera vez que se
    // ve a un recurso (evita notificar retroactivamente TODOS sus tickets ya asignados).
    const seeded = (await redis.get<string>(`notif:seeded:${assignedVal}`)) === '1';
    if (seeded) {
      await pushEvent([assignedVal], {
        type: 'n2_assign', title: 'Ticket asignado a ti',
        body: `Se te asignó ${label}${titleSuffix}`,
        ticketId: String(id), ticketNumber, ticketUrl: uiUrl,
        dedupeKey: `n2:${assignedVal}:${id}`, ts: now,
      }, 24 * 3600);
    }
  }
}
