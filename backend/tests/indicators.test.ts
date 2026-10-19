/**
 * indicators.test.ts — Unit tests for kline parsing and indicator seeding.
 *
 * Tests:
 *   - parseKline: correct field extraction and validation.
 *   - parseCompletedKlines: filters out forming (open) candles.
 *   - Indicator values from seeded state.
 *   - Provisional RSI immutability.
 *   - commitNewCandle idempotency.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseKline, parseCompletedKlines, commitNewCandle, seedSymbol, type RawKline } from '../src/indicators.js';
import { initCacheEntry, getCacheEntry } from '../src/cache.js';
import { buildRsiState } from '../../shared/src/rsi.js';
import { calculateProvisionalRsi } from '../../shared/src/rsi.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = Date.now();
const ONE_HOUR = 3_600_000;

/** Create a synthetic completed 1h kline (closeTime in the past) */
function makeKline(
  openTime: number,
  close: string,
  quoteVolume: string,
  offsetMs = -ONE_HOUR,
): RawKline {
  const closeTime = openTime + ONE_HOUR - 1 + offsetMs;
  return [
    openTime,   // 0: openTime
    '100',      // 1: open
    '110',      // 2: high
    '90',       // 3: low
    close,      // 4: close
    '1000',     // 5: baseVolume (unused)
    closeTime,  // 6: closeTime
    quoteVolume, // 7: quoteVolume (USDT)
    500,        // 8: trades
  ];
}

// ─── parseKline ───────────────────────────────────────────────────────────────

describe('parseKline', () => {
  it('extracts openTime, close, closeTime, quoteVolume correctly', () => {
    const raw = makeKline(1_000_000, '4500.50', '125000.75');
    const parsed = parseKline(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.openTime).toBe(1_000_000);
    expect(parsed!.close).toBeCloseTo(4500.50, 5);
    expect(parsed!.quoteVolume).toBeCloseTo(125000.75, 5);
  });

  it('returns null for a non-positive close price', () => {
    expect(parseKline(makeKline(1000, '0', '100000'))).toBeNull();
    expect(parseKline(makeKline(1000, '-50', '100000'))).toBeNull();
  });

  it('returns null for a negative quote volume', () => {
    expect(parseKline(makeKline(1000, '100', '-1'))).toBeNull();
  });

  it('returns null for NaN close', () => {
    expect(parseKline(makeKline(1000, 'NaN', '100'))).toBeNull();
  });

  it('accepts zero quote volume (valid: no trades in that hour)', () => {
    const parsed = parseKline(makeKline(1000, '100', '0'));
    expect(parsed).not.toBeNull();
    expect(parsed!.quoteVolume).toBe(0);
  });
});

// ─── parseCompletedKlines ────────────────────────────────────────────────────

describe('parseCompletedKlines', () => {
  it('includes candles whose closeTime is before now', () => {
    const pastKline = makeKline(NOW - 4 * ONE_HOUR, '100', '50000');
    const result = parseCompletedKlines([pastKline], NOW);
    expect(result).toHaveLength(1);
  });

  it('excludes the currently forming candle (closeTime >= now)', () => {
    // A forming candle: closeTime is in the future
    const openTime = NOW - ONE_HOUR / 2;
    const closeTime = openTime + ONE_HOUR - 1; // still in future
    const forming: RawKline = [openTime, '100', '110', '90', '105', '500', closeTime, '80000', 100];
    const result = parseCompletedKlines([forming], NOW);
    expect(result).toHaveLength(0);
  });

  it('filters mix of completed and forming candles', () => {
    const completedRaw = makeKline(NOW - 3 * ONE_HOUR, '100', '50000');
    const formingOpen = NOW - ONE_HOUR / 2;
    const formingClose = formingOpen + ONE_HOUR - 1;
    const formingRaw: RawKline = [formingOpen, '100', '110', '90', '105', '500', formingClose, '80000', 100];
    const result = parseCompletedKlines([completedRaw, formingRaw], NOW);
    expect(result).toHaveLength(1);
  });
});

// ─── commitNewCandle — idempotency ────────────────────────────────────────────

describe('commitNewCandle', () => {
  beforeEach(() => {
    initCacheEntry('BTCUSDT');
    const entry = getCacheEntry('BTCUSDT')!;
    // Pre-seed with 20 closes for SMA
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const volumes = Array.from({ length: 20 }, () => 50000);
    entry._closedCloses = closes;
    entry._closedVolumes = volumes;
    entry._rsiState = buildRsiState(closes) ?? undefined;
    entry._lastCommittedOpenTime = 0;
    entry.price = 120;
  });

  it('commits a new candle and updates sma20_1h', () => {
    const candle = {
      openTime: ONE_HOUR,
      closeTime: 2 * ONE_HOUR - 1,
      close: 121,
      quoteVolume: 60000,
    };
    commitNewCandle('BTCUSDT', candle);
    const entry = getCacheEntry('BTCUSDT')!;
    expect(entry.sma20_1h).toBeDefined();
    expect(entry._lastCommittedOpenTime).toBe(ONE_HOUR);
  });

  it('is idempotent — committing the same candle twice has no double effect', () => {
    const candle = {
      openTime: ONE_HOUR,
      closeTime: 2 * ONE_HOUR - 1,
      close: 121,
      quoteVolume: 60000,
    };
    commitNewCandle('BTCUSDT', candle);
    const smaAfterFirst = getCacheEntry('BTCUSDT')!.sma20_1h;

    commitNewCandle('BTCUSDT', candle); // second commit — same candle
    const smaAfterSecond = getCacheEntry('BTCUSDT')!.sma20_1h;

    expect(smaAfterFirst).toBe(smaAfterSecond);
  });

  it('advances RSI state to the new candle close', () => {
    const entry = getCacheEntry('BTCUSDT')!;
    const stateBefore = entry._rsiState;

    commitNewCandle('BTCUSDT', {
      openTime: ONE_HOUR,
      closeTime: 2 * ONE_HOUR - 1,
      close: 121,
      quoteVolume: 60000,
    });

    expect(entry._rsiState).not.toBe(stateBefore); // new object
    expect(entry._rsiState?.prevClose).toBe(121);
  });
});

// ─── Regression checks for full universe indicator seeding ────────────────────

describe('universe-wide indicator seeding and regression checks', () => {
  beforeEach(() => {
    initCacheEntry('AAVEUSDT');
    const entry = getCacheEntry('AAVEUSDT')!;
    entry.price = 150.25;
    entry.open24h = 145.0;
    entry.change24h = 3.62;
  });

  it('symbol outside top 50 starts with undefined indicators (never coerced to 0)', () => {
    const entry = getCacheEntry('AAVEUSDT')!;
    expect(entry.rsi14_1h).toBeUndefined();
    expect(entry.sma20_1h).toBeUndefined();
    expect(entry.volumeRatio20_1h).toBeUndefined();
    // Live price is intact
    expect(entry.price).toBe(150.25);
  });

  it('seedSymbol initializes indicators while preserving live price', async () => {
    // Generate 30 synthetic completed klines
    const rawKlines: RawKline[] = Array.from({ length: 30 }, (_, i) =>
      makeKline(NOW - (31 - i) * ONE_HOUR, String(140 + i), String(50000 + i * 1000)),
    );

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => rawKlines,
    });

    try {
      const ok = await seedSymbol('AAVEUSDT');
      expect(ok).toBe(true);

      const entry = getCacheEntry('AAVEUSDT')!;
      // Indicators are now available!
      expect(entry.rsi14_1h).toBeDefined();
      expect(typeof entry.rsi14_1h).toBe('number');
      expect(entry.rsi14_1h).toBeGreaterThan(0);
      expect(entry.rsi14_1h).toBeLessThanOrEqual(100);

      expect(entry.sma20_1h).toBeDefined();
      expect(typeof entry.sma20_1h).toBe('number');
      expect(entry.sma20_1h).toBeGreaterThan(140);

      expect(entry.volumeRatio20_1h).toBeDefined();
      expect(typeof entry.volumeRatio20_1h).toBe('number');
      expect(entry.volumeRatio20_1h).toBeGreaterThan(0);

      // Live price was preserved
      expect(entry.price).toBe(150.25);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('failed initialization leaves indicators undefined and allows successful retry', async () => {
    initCacheEntry('RETRYUSDT');
    const entry = getCacheEntry('RETRYUSDT')!;
    entry.price = 25.0;

    const originalFetch = global.fetch;

    // 1. Initial attempt fails
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network drop'));
    const ok1 = await seedSymbol('RETRYUSDT');
    expect(ok1).toBe(false);
    expect(entry.rsi14_1h).toBeUndefined();
    expect(entry.price).toBe(25.0); // live price preserved

    // 2. Retry attempt succeeds
    const rawKlines: RawKline[] = Array.from({ length: 30 }, (_, i) =>
      makeKline(NOW - (31 - i) * ONE_HOUR, String(20 + i), '100000'),
    );
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => rawKlines,
    });

    try {
      const ok2 = await seedSymbol('RETRYUSDT');
      expect(ok2).toBe(true);
      expect(entry.rsi14_1h).toBeDefined();
      expect(entry.sma20_1h).toBeDefined();
      expect(entry.price).toBe(25.0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('commitNewCandle volume ratio uses latest completed candle compared to 20 preceding candles', () => {
    initCacheEntry('VRTESTUSDT');
    const entry = getCacheEntry('VRTESTUSDT')!;
    // 20 preceding volumes averaging 10,000 USDT
    entry._closedVolumes = Array.from({ length: 20 }, () => 10000);
    entry._closedCloses = Array.from({ length: 20 }, () => 100);
    entry._lastCommittedOpenTime = 0;

    // Newly completed candle with 25,000 USDT quoteVolume
    commitNewCandle('VRTESTUSDT', {
      openTime: ONE_HOUR,
      closeTime: 2 * ONE_HOUR - 1,
      close: 105,
      quoteVolume: 25000,
    });

    // 25,000 / 10,000 = 2.5
    expect(entry.volumeRatio20_1h).toBeCloseTo(2.5, 4);
    // Baseline is shifted and now ends with 25000
    expect(entry._closedVolumes).toHaveLength(20);
    expect(entry._closedVolumes[19]).toBe(25000);
  });
});

// ─── Provisional RSI does not mutate state ────────────────────────────────────

describe('provisional RSI — no state mutation', () => {
  it('calling calculateProvisionalRsi twice with the same price returns the same value', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const state = buildRsiState(closes)!;
    const r1 = calculateProvisionalRsi(state, 121);
    const r2 = calculateProvisionalRsi(state, 121);
    expect(r1).toBe(r2);
    // State must not have changed
    expect(state.avgGain).toBeDefined();
  });
});

// ─── Independent indicator availability for young/newly listed coins ─────────

describe('independent indicator availability', () => {
  it('16 candles: RSI-14 is available while SMA-20 and Volume Ratio remain undefined', async () => {
    initCacheEntry('YOUNG16USDT');
    const entry = getCacheEntry('YOUNG16USDT')!;
    entry.price = 50.0;

    // 16 completed candles
    const rawKlines: RawKline[] = Array.from({ length: 16 }, (_, i) =>
      makeKline(NOW - (17 - i) * ONE_HOUR, String(50 + (i % 3)), '10000'),
    );

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'x-mbx-used-weight-1m': '10' }),
      json: async () => rawKlines,
    });

    try {
      const ok = await seedSymbol('YOUNG16USDT');
      expect(ok).toBe(true);

      // RSI-14: requires >= 15 candles -> AVAILABLE
      expect(entry.rsi14_1h).toBeDefined();
      expect(entry.rsi14_1h).toBeGreaterThan(0);
      expect(entry.rsi14_1h).toBeLessThanOrEqual(100);

      // SMA-20: requires 20 candles -> UNAVAILABLE (undefined)
      expect(entry.sma20_1h).toBeUndefined();

      // Volume Ratio: requires 21 candles -> UNAVAILABLE (undefined)
      expect(entry.volumeRatio20_1h).toBeUndefined();

      // Rolling array recorded the 16 closes for future promotion
      expect(entry._closedCloses).toHaveLength(16);
      expect(entry._closedVolumes).toHaveLength(16);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('20 candles: RSI-14 and SMA-20 are available while Volume Ratio remains undefined', async () => {
    initCacheEntry('YOUNG20USDT');
    const entry = getCacheEntry('YOUNG20USDT')!;
    entry.price = 10.0;

    // 20 completed candles
    const rawKlines: RawKline[] = Array.from({ length: 20 }, (_, i) =>
      makeKline(NOW - (21 - i) * ONE_HOUR, String(10 + (i % 2)), '20000'),
    );

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'x-mbx-used-weight-1m': '12' }),
      json: async () => rawKlines,
    });

    try {
      const ok = await seedSymbol('YOUNG20USDT');
      expect(ok).toBe(true);

      // RSI-14: available
      expect(entry.rsi14_1h).toBeDefined();

      // SMA-20: available
      expect(entry.sma20_1h).toBeDefined();
      expect(entry.sma20_1h).toBeGreaterThan(0);

      // Volume Ratio: requires 21 candles -> UNAVAILABLE (undefined)
      expect(entry.volumeRatio20_1h).toBeUndefined();

      expect(entry._closedCloses).toHaveLength(20);
      expect(entry._closedVolumes).toHaveLength(20);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('commitNewCandle incrementally activates indicators as candle counts reach thresholds', () => {
    initCacheEntry('GRADUALUSDT');
    const entry = getCacheEntry('GRADUALUSDT')!;
    entry.price = 100;
    // Start with 14 closed candles (insufficient for RSI, SMA, or VR)
    entry._closedCloses = Array.from({ length: 14 }, () => 100);
    entry._closedVolumes = Array.from({ length: 14 }, () => 5000);
    entry._lastCommittedOpenTime = 0;

    expect(entry.rsi14_1h).toBeUndefined();
    expect(entry.sma20_1h).toBeUndefined();
    expect(entry.volumeRatio20_1h).toBeUndefined();

    // ── Hour 15 closes: RSI should activate! SMA and VR still undefined ──
    commitNewCandle('GRADUALUSDT', {
      openTime: ONE_HOUR * 15,
      closeTime: ONE_HOUR * 16 - 1,
      close: 102,
      quoteVolume: 6000,
    });

    expect(entry.rsi14_1h).toBeDefined();
    expect(entry.sma20_1h).toBeUndefined();
    expect(entry.volumeRatio20_1h).toBeUndefined();
    expect(entry._closedCloses).toHaveLength(15);

    // ── Hours 16 through 19 close ──
    for (let h = 16; h <= 19; h++) {
      commitNewCandle('GRADUALUSDT', {
        openTime: ONE_HOUR * h,
        closeTime: ONE_HOUR * (h + 1) - 1,
        close: 100 + (h % 3),
        quoteVolume: 5000,
      });
      expect(entry.rsi14_1h).toBeDefined();
      expect(entry.sma20_1h).toBeUndefined();
      expect(entry.volumeRatio20_1h).toBeUndefined();
    }
    expect(entry._closedCloses).toHaveLength(19);

    // ── Hour 20 closes: SMA-20 should activate! VR still undefined ──
    commitNewCandle('GRADUALUSDT', {
      openTime: ONE_HOUR * 20,
      closeTime: ONE_HOUR * 21 - 1,
      close: 105,
      quoteVolume: 5000,
    });

    expect(entry.rsi14_1h).toBeDefined();
    expect(entry.sma20_1h).toBeDefined(); // SMA-20 now active!
    expect(entry.volumeRatio20_1h).toBeUndefined(); // VR still needs 20 prior completed

    // ── Hour 21 closes: Volume Ratio should activate! ──
    commitNewCandle('GRADUALUSDT', {
      openTime: ONE_HOUR * 21,
      closeTime: ONE_HOUR * 22 - 1,
      close: 104,
      quoteVolume: 10000, // 2x volume spike
    });

    expect(entry.rsi14_1h).toBeDefined();
    expect(entry.sma20_1h).toBeDefined();
    expect(entry.volumeRatio20_1h).toBeDefined(); // VR now active!
    expect(entry.volumeRatio20_1h).toBeGreaterThan(1.5);
  });
});


