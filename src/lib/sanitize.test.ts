import { describe, it, expect } from 'vitest';
import { isValidTicketId, sanitizeUser } from './sanitize';

describe('sanitizeUser', () => {
  it('rejects the exact XSS payload used in the audit finding', () => {
    // Hallazgo real: POST /api/presence/{id} con user="<img src=x onerror=...>"
    // quedaba guardado tal cual y se renderizaba sin escapar en admin.js.
    expect(sanitizeUser('<img src=x onerror=alert(1)>')).toBeNull();
    expect(sanitizeUser('<script>alert(document.cookie)</script>')).toBeNull();
  });

  it('rejects other HTML/script metacharacters', () => {
    expect(sanitizeUser('a<b')).toBeNull();
    expect(sanitizeUser('a>b')).toBeNull();
    expect(sanitizeUser('a&b')).toBeNull();
    expect(sanitizeUser('a"b')).toBeNull();
    expect(sanitizeUser('a=b')).toBeNull();
    expect(sanitizeUser('a/b')).toBeNull();
  });

  it('rejects non-string, empty, or whitespace-only input', () => {
    expect(sanitizeUser(undefined)).toBeNull();
    expect(sanitizeUser(null)).toBeNull();
    expect(sanitizeUser(123)).toBeNull();
    expect(sanitizeUser({})).toBeNull();
    expect(sanitizeUser('')).toBeNull();
    expect(sanitizeUser('   ')).toBeNull();
  });

  it('accepts real names, including accents, apostrophes, hyphens and parentheses', () => {
    expect(sanitizeUser('Ricardo Illanes')).toBe('Ricardo Illanes');
    expect(sanitizeUser('José Muñoz')).toBe('José Muñoz');
    expect(sanitizeUser("O'Brien")).toBe("O'Brien");
    expect(sanitizeUser('Jean-Pierre')).toBe('Jean-Pierre');
    expect(sanitizeUser('Ana (soporte)')).toBe('Ana (soporte)');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeUser('  Ricardo Illanes  ')).toBe('Ricardo Illanes');
  });

  it('truncates to 60 characters instead of rejecting outright', () => {
    const long = 'A'.repeat(100);
    const result = sanitizeUser(long);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(60);
  });
});

describe('isValidTicketId', () => {
  it('rejects patterns that widen a redis KEYS glob', () => {
    // Hallazgo real: id sin validar en `ticketpresence:${id}:*` — un id con '*'
    // amplía el patrón y puede mezclar presencia de otros tickets.
    expect(isValidTicketId('*')).toBe(false);
    expect(isValidTicketId('T20260811.0001:*')).toBe(false);
    expect(isValidTicketId('foo*bar')).toBe(false);
  });

  it('rejects empty string and overly long ids', () => {
    expect(isValidTicketId('')).toBe(false);
    expect(isValidTicketId('a'.repeat(101))).toBe(false);
  });

  it('accepts realistic Autotask ticket ids and numbers', () => {
    expect(isValidTicketId('T20260811.0001')).toBe(true);
    expect(isValidTicketId('12345678')).toBe(true);
    expect(isValidTicketId('abc-123_456.789')).toBe(true);
  });
});
