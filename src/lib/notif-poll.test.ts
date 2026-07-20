import { describe, it, expect } from 'vitest';
import { slaEvents, tParsed } from './notif-poll';
import type { AutotaskTicket } from './autotask';

describe('tParsed', () => {
  it('returns null for missing/empty input', () => {
    expect(tParsed(null)).toBeNull();
    expect(tParsed(undefined)).toBeNull();
    expect(tParsed('')).toBeNull();
  });

  it('returns null for an unparseable date string', () => {
    expect(tParsed('not-a-date')).toBeNull();
  });

  it('parses a valid ISO date to epoch ms', () => {
    expect(tParsed('2026-01-01T00:00:00.000Z')).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
  });
});

describe('slaEvents (n4)', () => {
  const base: AutotaskTicket = { id: 1 };
  const now = Date.parse('2026-01-01T12:00:00.000Z');
  const warnMin = 30;

  it('emits nothing when there is no due date', () => {
    expect(slaEvents(base, warnMin, now)).toEqual([]);
  });

  it('emits nothing when the milestone was already met', () => {
    const t: AutotaskTicket = {
      ...base,
      firstResponseDueDateTime: '2026-01-01T12:05:00.000Z',
      firstResponseDateTime: '2026-01-01T11:00:00.000Z', // ya respondido
    };
    expect(slaEvents(t, warnMin, now)).toEqual([]);
  });

  it('emits nothing when the due date is outside the warning window', () => {
    const t: AutotaskTicket = { ...base, firstResponseDueDateTime: '2026-01-01T14:00:00.000Z' }; // 2h away, warn=30min
    expect(slaEvents(t, warnMin, now)).toEqual([]);
  });

  it('emits a non-overdue warning when due date is within the window but in the future', () => {
    const t: AutotaskTicket = { ...base, firstResponseDueDateTime: '2026-01-01T12:15:00.000Z' }; // 15min away
    expect(slaEvents(t, warnMin, now)).toEqual([
      { kind: 'first', label: 'Primera respuesta', overdue: false },
    ]);
  });

  it('emits an overdue warning when the due date has already passed', () => {
    const t: AutotaskTicket = { ...base, firstResponseDueDateTime: '2026-01-01T11:00:00.000Z' }; // 1h in the past
    expect(slaEvents(t, warnMin, now)).toEqual([
      { kind: 'first', label: 'Primera respuesta', overdue: true },
    ]);
  });

  it('tracks first-response and resolution SLAs independently', () => {
    const t: AutotaskTicket = {
      ...base,
      firstResponseDueDateTime: '2026-01-01T12:10:00.000Z', // due soon, not met
      resolutionDueDateTime: '2026-01-01T10:00:00.000Z',   // overdue
      resolvedDateTime: null,
    };
    expect(slaEvents(t, warnMin, now)).toEqual([
      { kind: 'first', label: 'Primera respuesta', overdue: false },
      { kind: 'resolution', label: 'Resolución', overdue: true },
    ]);
  });
});
