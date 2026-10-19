import { describe, it, expect } from 'vitest';
import { calculateVolumeRatio } from '../src/volume.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates an array of `length` identical volume values */
function uniformVolumes(length: number, value = 100): number[] {
  return Array.from({ length }, () => value);
}

// ─── Insufficient data ────────────────────────────────────────────────────────

describe('calculateVolumeRatio — insufficient data', () => {
  it('returns null for an empty previousVolumes array', () => {
    expect(calculateVolumeRatio(250, [])).toBeNull();
  });

  it('returns null for exactly 19 previous candles (need 20)', () => {
    expect(calculateVolumeRatio(250, uniformVolumes(19))).toBeNull();
  });

  it('returns a number for exactly 20 previous candles (minimum viable)', () => {
    const result = calculateVolumeRatio(250, uniformVolumes(20));
    expect(result).not.toBeNull();
    expect(typeof result).toBe('number');
  });
});

// ─── Correct ratio calculation ────────────────────────────────────────────────

describe('calculateVolumeRatio — correct ratio', () => {
  it('returns 2.5 when current volume is 2.5× the uniform average', () => {
    // avg of 20 × 100 = 100; current = 250 → ratio = 2.5
    const result = calculateVolumeRatio(250, uniformVolumes(20, 100));
    expect(result).toBeCloseTo(2.5, 10);
  });

  it('returns 1.0 when current volume equals the average', () => {
    const result = calculateVolumeRatio(100, uniformVolumes(20, 100));
    expect(result).toBeCloseTo(1.0, 10);
  });

  it('returns < 1.0 when current volume is below the average', () => {
    // avg = 100; current = 50 → ratio = 0.5
    const result = calculateVolumeRatio(50, uniformVolumes(20, 100));
    expect(result).toBeCloseTo(0.5, 10);
  });

  it('uses only the LAST 20 previous candles, not all of them', () => {
    // Inject 10 very high volumes at the start; last 20 are uniform 100.
    const prefix = Array.from({ length: 10 }, () => 1_000_000);
    const tail = uniformVolumes(20, 100);
    const previous = [...prefix, ...tail];
    const result = calculateVolumeRatio(250, previous);
    // If using all 30, the average would be massively inflated.
    // If using only the last 20, ratio should be 2.5.
    expect(result).toBeCloseTo(2.5, 5);
  });

  it('returns correct ratio for non-uniform previous volumes', () => {
    // 20 previous volumes: 10 candles of 80, 10 candles of 120
    // average = (10*80 + 10*120) / 20 = 100
    const previous = [
      ...Array.from({ length: 10 }, () => 80),
      ...Array.from({ length: 10 }, () => 120),
    ];
    const result = calculateVolumeRatio(300, previous);
    expect(result).toBeCloseTo(3.0, 10);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('calculateVolumeRatio — edge cases', () => {
  it('returns 0.0 when current volume is zero (no trades this candle)', () => {
    // Zero current volume is valid — means no trading occurred yet
    const result = calculateVolumeRatio(0, uniformVolumes(20, 100));
    expect(result).toBeCloseTo(0.0, 10);
  });

  it('returns null when all 20 previous volumes are zero (undefined ratio)', () => {
    // Zero average → ratio is mathematically undefined
    const result = calculateVolumeRatio(100, uniformVolumes(20, 0));
    expect(result).toBeNull();
  });

  it('returns null when previous volume average is zero even with extra candles', () => {
    const result = calculateVolumeRatio(100, uniformVolumes(25, 0));
    expect(result).toBeNull();
  });
});

// ─── Input immutability ───────────────────────────────────────────────────────

describe('calculateVolumeRatio — input immutability', () => {
  it('does not mutate the previousVolumes array', () => {
    const previous = uniformVolumes(25, 100);
    const copy = [...previous];
    calculateVolumeRatio(250, previous);
    expect(previous).toEqual(copy);
  });
});

// ─── Invalid inputs ───────────────────────────────────────────────────────────

describe('calculateVolumeRatio — invalid inputs', () => {
  it('throws for negative currentVolume', () => {
    expect(() => calculateVolumeRatio(-1, uniformVolumes(20))).toThrow(/volume/i);
  });

  it('throws for NaN currentVolume', () => {
    expect(() => calculateVolumeRatio(NaN, uniformVolumes(20))).toThrow(/volume/i);
  });

  it('throws for Infinity currentVolume', () => {
    expect(() => calculateVolumeRatio(Infinity, uniformVolumes(20))).toThrow(/volume/i);
  });

  it('throws for a negative value in previousVolumes', () => {
    const prev = uniformVolumes(20, 100);
    (prev as number[])[10] = -50;
    expect(() => calculateVolumeRatio(100, prev)).toThrow(/volume/i);
  });

  it('throws for NaN in previousVolumes', () => {
    const prev = uniformVolumes(20, 100);
    (prev as number[])[5] = NaN;
    expect(() => calculateVolumeRatio(100, prev)).toThrow(/volume/i);
  });

  it('throws for Infinity in previousVolumes', () => {
    const prev = uniformVolumes(20, 100);
    (prev as number[])[0] = Infinity;
    expect(() => calculateVolumeRatio(100, prev)).toThrow(/volume/i);
  });
});

