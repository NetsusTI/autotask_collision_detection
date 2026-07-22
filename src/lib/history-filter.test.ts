import { describe, it, expect } from 'vitest';
import { applyHistoryFilters, buildHistoryCsv, type HistoryEventLike } from './history-filter';

const now = Date.parse('2026-01-15T12:00:00.000Z');

function ev(overrides: Partial<HistoryEventLike>): HistoryEventLike {
  return { ts: now, ticketId: '1', ticketNumber: 'T20260115.0001', users: ['Juan Perez', 'Ana Soto'], ...overrides };
}

describe('applyHistoryFilters', () => {
  it('period "all" keeps everything', () => {
    const events = [ev({ ts: now - 30 * 86400000 })];
    expect(applyHistoryFilters(events, { period: 'all', now })).toHaveLength(1);
  });

  it('period "today" excludes events older than 24h', () => {
    const events = [ev({ ts: now - 2 * 3600000 }), ev({ ts: now - 25 * 3600000 })];
    expect(applyHistoryFilters(events, { period: 'today', now })).toHaveLength(1);
  });

  it('period "week" excludes events older than 7 days', () => {
    const events = [ev({ ts: now - 3 * 86400000 }), ev({ ts: now - 8 * 86400000 })];
    expect(applyHistoryFilters(events, { period: 'week', now })).toHaveLength(1);
  });

  it('period "custom" respects dateFrom/dateTo bounds', () => {
    const events = [ev({ ts: now - 86400000 }), ev({ ts: now - 10 * 86400000 })];
    const result = applyHistoryFilters(events, {
      period: 'custom', now, dateFrom: now - 2 * 86400000, dateTo: now,
    });
    expect(result).toHaveLength(1);
  });

  it('search matches ticket number, ticket id, or technician name (case-insensitive)', () => {
    const events = [ev({ ticketNumber: 'T20260115.0001', users: ['Juan Perez'] })];
    expect(applyHistoryFilters(events, { period: 'all', search: 'juan' })).toHaveLength(1);
    expect(applyHistoryFilters(events, { period: 'all', search: 'T20260115' })).toHaveLength(1);
    expect(applyHistoryFilters(events, { period: 'all', search: 'nadie' })).toHaveLength(0);
  });

  it('combines period and search filters', () => {
    const events = [
      ev({ ts: now - 1000, users: ['Juan Perez'] }),
      ev({ ts: now - 30 * 86400000, users: ['Juan Perez'] }),
    ];
    expect(applyHistoryFilters(events, { period: 'today', search: 'juan', now })).toHaveLength(1);
  });
});

describe('buildHistoryCsv', () => {
  it('builds a header row plus one row per event', () => {
    const csv = buildHistoryCsv([ev({})]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('"Fecha","Ticket","Técnicos"');
    expect(lines).toHaveLength(2);
  });

  it('falls back to "#ticketId" when there is no ticket number', () => {
    const csv = buildHistoryCsv([ev({ ticketNumber: null, ticketId: '42' })]);
    expect(csv).toContain('#42');
  });

  it('joins multiple technicians with "; "', () => {
    const csv = buildHistoryCsv([ev({ users: ['Juan Perez', 'Ana Soto'] })]);
    expect(csv).toContain('Juan Perez; Ana Soto');
  });

  it('escapes embedded double quotes', () => {
    const csv = buildHistoryCsv([ev({ ticketNumber: 'T"20260115"' })]);
    expect(csv).toContain('T""20260115""');
  });
});
