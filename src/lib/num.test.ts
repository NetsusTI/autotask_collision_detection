import { describe, it, expect } from 'vitest';
import { clampInt } from './num';

describe('clampInt', () => {
  it('returns the fallback when there is no stored value', () => {
    expect(clampInt(null, 15, 300, 40)).toBe(40);
    expect(clampInt(undefined, 15, 300, 40)).toBe(40);
    expect(clampInt('', 15, 300, 40)).toBe(40);
  });

  it('returns the fallback instead of NaN when the value is not a number', () => {
    // Bug real: parseInt('abc') -> NaN, y Math.max/min con NaN devuelve NaN, lo que
    // colaba un TTL inválido a redis.set(key, val, { ex: NaN }).
    expect(clampInt('abc', 15, 300, 40)).toBe(40);
    expect(clampInt('   ', 15, 300, 40)).toBe(40);
  });

  it('clamps below the minimum', () => {
    expect(clampInt('1', 15, 300, 40)).toBe(15);
  });

  it('clamps above the maximum', () => {
    expect(clampInt('9999', 15, 300, 40)).toBe(300);
  });

  it('passes through an in-range value', () => {
    expect(clampInt('120', 15, 300, 40)).toBe(120);
  });

  it('truncates a decimal string via parseInt', () => {
    expect(clampInt('120.9', 15, 300, 40)).toBe(120);
  });
});
