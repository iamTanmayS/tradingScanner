/**
 * Format utilities tests.
 */

import { describe, it, expect } from 'vitest';
import {
  formatPrice,
  formatPct,
  formatVolume,
  formatRatio,
  formatRsi,
  computeDsma,
  pctClass,
  UNAVAILABLE,
} from '../design/format.js';

describe('formatPrice', () => {
  it('returns em dash for undefined', () => {
    expect(formatPrice(undefined)).toBe(UNAVAILABLE);
  });
  it('returns em dash for NaN', () => {
    expect(formatPrice(NaN)).toBe(UNAVAILABLE);
  });
  it('returns em dash for Infinity', () => {
    expect(formatPrice(Infinity)).toBe(UNAVAILABLE);
  });
  it('formats large price with 2 decimals', () => {
    expect(formatPrice(82786.01)).toBe('82,786.01');
  });
  it('formats price < 1 with 4 decimals', () => {
    expect(formatPrice(0.7821)).toBe('0.7821');
  });
  it('formats price < 0.01 with 6 decimals', () => {
    const result = formatPrice(0.000043);
    expect(result).toContain('0.000043');
  });
});

describe('formatPct', () => {
  it('returns em dash for undefined', () => {
    expect(formatPct(undefined)).toBe(UNAVAILABLE);
  });
  it('formats positive with + sign', () => {
    expect(formatPct(3.45)).toBe('+3.45%');
  });
  it('formats negative with − sign (minus)', () => {
    expect(formatPct(-1.2)).toBe('−1.20%');
  });
  it('formats zero without sign', () => {
    expect(formatPct(0)).toBe('0.00%');
  });
});

describe('formatVolume', () => {
  it('returns em dash for undefined', () => {
    expect(formatVolume(undefined)).toBe(UNAVAILABLE);
  });
  it('formats billions', () => {
    expect(formatVolume(1_234_000_000)).toBe('$1.23B');
  });
  it('formats millions', () => {
    expect(formatVolume(456_780_000)).toBe('$456.78M');
  });
  it('formats thousands', () => {
    expect(formatVolume(12_340)).toBe('$12.34K');
  });
  it('formats sub-thousand', () => {
    expect(formatVolume(987)).toBe('$987.00');
  });
});

describe('formatRatio', () => {
  it('returns em dash for undefined', () => {
    expect(formatRatio(undefined)).toBe(UNAVAILABLE);
  });
  it('formats with × suffix', () => {
    expect(formatRatio(2.5)).toBe('2.50×');
  });
});

describe('formatRsi', () => {
  it('returns em dash for undefined', () => {
    expect(formatRsi(undefined)).toBe(UNAVAILABLE);
  });
  it('formats to 1 decimal', () => {
    expect(formatRsi(63.51)).toBe('63.5');
  });
});

describe('computeDsma', () => {
  it('returns undefined when sma is 0', () => {
    expect(computeDsma(50000, 0)).toBeUndefined();
  });
  it('returns undefined when price is undefined', () => {
    expect(computeDsma(undefined, 49000)).toBeUndefined();
  });
  it('returns undefined when sma is undefined', () => {
    expect(computeDsma(50000, undefined)).toBeUndefined();
  });
  it('computes correct dsma', () => {
    const result = computeDsma(50000, 49000);
    expect(result).toBeCloseTo(2.04, 1);
  });
  it('returns negative dsma when price below sma', () => {
    const result = computeDsma(48000, 50000);
    expect(result).toBeCloseTo(-4.0, 1);
  });
});

describe('pctClass', () => {
  it('returns "gain" for positive', () => { expect(pctClass(1)).toBe('gain'); });
  it('returns "loss" for negative', () => { expect(pctClass(-1)).toBe('loss'); });
  it('returns "" for zero', () => { expect(pctClass(0)).toBe(''); });
  it('returns "" for undefined', () => { expect(pctClass(undefined)).toBe(''); });
});

