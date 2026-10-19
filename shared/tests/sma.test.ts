import { describe, it, expect } from 'vitest';
import { calculateSMA } from '../src/sma.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Arithmetic sum of an array */
function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

// ─── Insufficient data ────────────────────────────────────────────────────────

describe('calculateSMA — insufficient data', () => {
  it('returns null for an empty array', () => {
    expect(calculateSMA([])).toBeNull();
  });

  it('returns null for exactly 19 closes with default period 20', () => {
    const closes = Array.from({ length: 19 }, (_, i) => i + 1);
    expect(calculateSMA(closes)).toBeNull();
  });

  it('returns null when length < period for a custom period', () => {
    expect(calculateSMA([100, 101, 102], 5)).toBeNull();
  });

  it('returns a number for exactly 20 closes (minimum viable input)', () => {
    const closes = Array.from({ length: 20 }, (_, i) => i + 1);
    const result = calculateSMA(closes);
    expect(result).not.toBeNull();
    expect(typeof result).toBe('number');
  });
});

// ─── Correct arithmetic mean ──────────────────────────────────────────────────

describe('calculateSMA — correct arithmetic mean', () => {
  it('returns the exact mean of exactly 20 values', () => {
    // [1, 2, ..., 20] → sum = 210, mean = 10.5
    const closes = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(calculateSMA(closes)).toBe(10.5);
  });

  it('returns the mean of the LAST 20 values when array is longer', () => {
    // First 10 are very high; last 20 are [1..20]
    const prefix = Array.from({ length: 10 }, () => 1_000_000);
    const tail = Array.from({ length: 20 }, (_, i) => i + 1);
    const closes = [...prefix, ...tail];
    const result = calculateSMA(closes);
    const expected = sum(tail) / 20;
    expect(result).toBeCloseTo(expected, 10);
  });

  it('returns the correct mean for a custom period of 5', () => {
    const closes = [10, 20, 30, 40, 50, 60];
    // last 5: [20, 30, 40, 50, 60] → mean = 40
    expect(calculateSMA(closes, 5)).toBeCloseTo(40, 10);
  });

  it('returns the single value when period = 1', () => {
    expect(calculateSMA([42, 99, 7], 1)).toBeCloseTo(7, 10);
  });

  it('handles a period equal to the array length', () => {
    const closes = [10, 20, 30, 40, 50];
    expect(calculateSMA(closes, 5)).toBeCloseTo(30, 10);
  });
});

// ─── Repeated and monotonic values ───────────────────────────────────────────

describe('calculateSMA — repeated and monotonic values', () => {
  it('returns the constant value for a flat (all-identical) series', () => {
    const closes = Array.from({ length: 25 }, () => 42);
    expect(calculateSMA(closes)).toBe(42);
  });

  it('returns the arithmetic midpoint for a perfectly linear ascending series', () => {
    // [1, 2, ..., 20]: mean is (1 + 20) / 2 = 10.5
    const closes = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(calculateSMA(closes)).toBeCloseTo(10.5, 10);
  });
});

// ─── Input immutability ───────────────────────────────────────────────────────

describe('calculateSMA — input immutability', () => {
  it('does not mutate the input array', () => {
    const closes = Array.from({ length: 25 }, (_, i) => i + 1);
    const copy = [...closes];
    calculateSMA(closes);
    expect(closes).toEqual(copy);
  });
});

// ─── Invalid period ───────────────────────────────────────────────────────────

describe('calculateSMA — invalid period', () => {
  it('throws for period = 0', () => {
    expect(() => calculateSMA([1, 2, 3], 0)).toThrow(/period/i);
  });

  it('throws for a negative period', () => {
    expect(() => calculateSMA([1, 2, 3], -5)).toThrow(/period/i);
  });

  it('throws for a non-integer period', () => {
    expect(() => calculateSMA([1, 2, 3], 2.5)).toThrow(/period/i);
  });
});

// ─── Invalid closes ───────────────────────────────────────────────────────────

describe('calculateSMA — invalid closes', () => {
  it('throws for NaN in the closes array', () => {
    expect(() => calculateSMA([100, NaN, 102])).toThrow(/Invalid value/i);
  });

  it('throws for Infinity in the closes array', () => {
    expect(() => calculateSMA([100, Infinity, 102])).toThrow(/Invalid value/i);
  });

  it('throws for -Infinity in the closes array', () => {
    expect(() => calculateSMA([100, -Infinity, 102])).toThrow(/Invalid value/i);
  });

  it('throws for a zero price (crypto prices must be positive)', () => {
    expect(() => calculateSMA([0, 100, 200])).toThrow(/Invalid value/i);
  });

  it('throws for a negative price', () => {
    expect(() => calculateSMA([-10, 100, 200])).toThrow(/Invalid value/i);
  });
});

