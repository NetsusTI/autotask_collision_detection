import { describe, it, expect } from 'vitest';
import { normName, dedupeOthers, minutesSince, formatDuration } from './collision';

describe('normName', () => {
  it('trims leading/trailing whitespace', () => {
    expect(normName('  Juan Perez  ')).toBe('juan perez');
  });

  it('collapses internal repeated whitespace', () => {
    expect(normName('Juan   Perez')).toBe('juan perez');
  });

  it('folds case', () => {
    expect(normName('JUAN PEREZ')).toBe('juan perez');
  });
});

describe('dedupeOthers', () => {
  it('excludes the current user by exact match', () => {
    expect(dedupeOthers(['Juan Perez', 'Ana Soto'], 'Juan Perez')).toEqual(['Ana Soto']);
  });

  it('excludes the current user even with different case/whitespace', () => {
    // Bug real: dos polls del mismo técnico registran claves de presencia con distinta
    // capitalización/espacios → sin normalizar, el propio usuario aparecía en su lista
    // de "otros" y disparaba una falsa colisión contra sí mismo.
    expect(dedupeOthers(['juan perez ', 'Ana Soto'], 'Juan Perez')).toEqual(['Ana Soto']);
    expect(dedupeOthers(['  JUAN   PEREZ', 'Ana Soto'], 'juan perez')).toEqual(['Ana Soto']);
  });

  it('collapses duplicate case/whitespace variants of another person into one entry', () => {
    const result = dedupeOthers(['Ana Soto', 'ana soto ', 'ANA SOTO'], 'Juan Perez');
    expect(result).toEqual(['Ana Soto']);
  });

  it('keeps the first-seen spelling for a deduped name', () => {
    const result = dedupeOthers(['Ana  Soto', 'ana soto'], 'Juan Perez');
    expect(result).toEqual(['Ana  Soto']);
  });

  it('returns an empty list when alone on the ticket', () => {
    expect(dedupeOthers(['Juan Perez'], 'Juan Perez')).toEqual([]);
    expect(dedupeOthers([], 'Juan Perez')).toEqual([]);
  });

  it('handles multiple distinct other technicians', () => {
    expect(dedupeOthers(['Juan Perez', 'Ana Soto', 'Pedro Diaz'], 'Juan Perez'))
      .toEqual(['Ana Soto', 'Pedro Diaz']);
  });
});

describe('minutesSince', () => {
  const now = Date.parse('2026-01-01T00:10:00.000Z');

  it('returns 0 when there is no stored entry timestamp', () => {
    expect(minutesSince(null, now)).toBe(0);
    expect(minutesSince(undefined, now)).toBe(0);
  });

  it('computes whole minutes elapsed since entry', () => {
    const entry = Date.parse('2026-01-01T00:00:00.000Z').toString();
    expect(minutesSince(entry, now)).toBe(10);
  });

  it('floors partial minutes', () => {
    const entry = (now - 90 * 1000).toString(); // 1.5 minutes ago
    expect(minutesSince(entry, now)).toBe(1);
  });
});

describe('formatDuration', () => {
  it('formats durations under a minute as seconds only', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45_000)).toBe('45s');
  });

  it('formats durations of a minute or more as "Xm Ys"', () => {
    expect(formatDuration(60_000)).toBe('1m 0s');
    expect(formatDuration(125_000)).toBe('2m 5s');
  });

  it('rounds to the nearest second', () => {
    expect(formatDuration(59_600)).toBe('1m 0s'); // rounds up to 60s first
    expect(formatDuration(500)).toBe('1s');
  });

  it('handles durations over an hour', () => {
    expect(formatDuration(3_661_000)).toBe('61m 1s');
  });
});
