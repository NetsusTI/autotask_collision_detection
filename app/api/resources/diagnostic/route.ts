import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';
import { checkAdminSession } from '@/lib/admin-auth';
import { autotaskConfigured, headers } from '@/lib/autotask';

const BASE = 'https://webservices12.autotask.net/ATServicesRest/v1.0';

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await checkAdminSession(request))) return NextResponse.json({ error: 'admin session required' }, { status: 403 });

  if (!autotaskConfigured()) {
    return NextResponse.json({ configured: false, error: 'AUTOTASK_USER o AUTOTASK_SECRET no configurados' });
  }

  // 1. Prueba de zona: verifica que webservices12 sea correcto
  const zoneRes = await fetch('https://webservices12.autotask.net/ATServicesRest/v1.0/zoneInformation', {
    headers: { ...headers(), 'Content-Type': 'application/json' },
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));

  // 2. Query de recursos activos — captura la respuesta cruda
  let rawBody = '';
  let rawStatus = 0;
  let parsedItems: unknown[] = [];
  try {
    const res = await fetch(`${BASE}/Resources/query`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        MaxRecords: 10,
        IncludeFields: ['id', 'firstName', 'lastName', 'isActive'],
        Filter: [{ op: 'eq', field: 'isActive', value: true }],
      }),
    });
    rawStatus = res.status;
    rawBody = await res.text();
    try { parsedItems = JSON.parse(rawBody)?.items ?? []; } catch { /* noop */ }
  } catch (e) {
    rawBody = String(e);
  }

  // 3. Prueba alternativa sin filtro — para ver si la entidad devuelve algo
  let noFilterStatus = 0;
  let noFilterCount = 0;
  try {
    const res2 = await fetch(`${BASE}/Resources/query`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ MaxRecords: 5, IncludeFields: ['id', 'firstName', 'lastName'] }),
    });
    noFilterStatus = res2.status;
    const d2 = await res2.json().catch(() => ({}));
    noFilterCount = Array.isArray(d2?.items) ? d2.items.length : 0;
  } catch { /* noop */ }

  // 4. Metadata de campos de la entidad Resources — para encontrar el nombre real
  // del campo de departamento/rol sin adivinar (adivinar un IncludeFields inválido
  // tira 500 en la query real). Se filtra a los que suenan relevantes.
  let fieldNames: string[] = [];
  let relevantFields: unknown[] = [];
  try {
    const res3 = await fetch(`${BASE}/Resources/entityInformation/fields`, { headers: headers() });
    if (res3.ok) {
      const d3 = await res3.json();
      const fields = Array.isArray(d3?.fields) ? d3.fields : [];
      fieldNames = fields.map((f: { name?: string }) => f.name).filter(Boolean);
      relevantFields = fields.filter((f: { name?: string }) =>
        /depart|role|type|title|queue|team|group/i.test(f.name ?? ''));
    }
  } catch { /* noop */ }

  // 5. Muestra real de esos campos para gente conocida (si el metadata encontró algo).
  let sampleWithFields: unknown[] = [];
  const candidateFields = ['id', 'firstName', 'lastName', ...relevantFields.map((f) => (f as { name: string }).name)];
  if (relevantFields.length) {
    try {
      const res4 = await fetch(`${BASE}/Resources/query`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          MaxRecords: 15,
          IncludeFields: candidateFields,
          Filter: [{ op: 'eq', field: 'isActive', value: true }],
        }),
      });
      if (res4.ok) {
        const d4 = await res4.json();
        sampleWithFields = Array.isArray(d4?.items) ? d4.items : [];
      }
    } catch { /* noop */ }
  }

  return NextResponse.json({
    configured: true,
    zone: { status: zoneRes.status ?? 0, ok: zoneRes.ok },
    resourcesQuery: { status: rawStatus, itemsFound: parsedItems.length, rawSnippet: rawBody.slice(0, 500) },
    resourcesNoFilter: { status: noFilterStatus, itemsFound: noFilterCount },
    allFieldNames: fieldNames,
    relevantFields: relevantFields,
    sampleWithFields,
  });
}
