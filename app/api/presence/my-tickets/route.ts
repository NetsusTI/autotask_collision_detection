import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey, redis } from '@/lib/ticket-lock';
import { query, resolveResourceIdByName, autotaskConfigured } from '@/lib/autotask';
import type { Filter } from '@/lib/autotask';

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = request.nextUrl;
  const user = url.searchParams.get('user')?.trim() ?? '';
  const sinceParam = url.searchParams.get('since');

  if (!user) return NextResponse.json({ error: 'user required' }, { status: 400 });
  if (!autotaskConfigured()) return NextResponse.json({ tickets: [] });

  const resourceId = await resolveResourceIdByName(user);
  if (!resourceId) return NextResponse.json({ tickets: [] });

  const sinceIso = sinceParam
    ? (isNaN(Number(sinceParam)) ? sinceParam : new Date(Number(sinceParam)).toISOString())
    : null;

  const filter: Filter[] = sinceIso
    ? [{ op: 'and', items: [
        { op: 'eq', field: 'assignedResourceID', value: resourceId },
        { op: 'gte', field: 'lastActivityDate', value: sinceIso },
        { op: 'noteq', field: 'status', value: 5 },
      ] }]
    : [{ op: 'and', items: [
        { op: 'eq', field: 'assignedResourceID', value: resourceId },
        { op: 'noteq', field: 'status', value: 5 },
      ] }];

  const tickets = await query<{ id: number; ticketNumber?: string; title?: string }>('Tickets', {
    MaxRecords: sinceIso ? 10 : 50,
    IncludeFields: ['id', 'ticketNumber', 'title'],
    Filter: filter,
  });

  const uiBase = await redis.get<string>('config:autotask_ui_base');

  return NextResponse.json({
    tickets: tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber ?? null,
      title: t.title ?? null,
      url: uiBase
        ? `${uiBase.replace(/\/+$/, '')}/Mvc/ServiceDesk/TicketDetail.mvc?ticketId=${t.id}`
        : null,
    })),
  });
}
