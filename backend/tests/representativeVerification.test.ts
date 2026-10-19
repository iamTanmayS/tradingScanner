/**
 * representativeVerification.test.ts — Verification of the 7 representative symbols.
 *
 * Verifies:
 *   - BTCUSDT
 *   - ETHUSDT
 *   - AAVEUSDT
 *   - AMPUSDT
 *   - XLMUSDT
 *   - ZROUSDT
 *   - DOTUSDT
 *
 * Confirms each symbol:
 *   1. Successfully seeds indicators from Binance.
 *   2. Has valid positive RSI-14 (1h), SMA-20 (1h), and Volume Ratio.
 *   3. Populates the cache entry.
 *   4. Is included in the broadcast MarketCoinDTO snapshot.
 */

import { describe, it, expect } from 'vitest';
import { seedSymbol } from '../src/indicators.js';
import { initCacheEntry, getCacheEntry, applyTickerUpdate } from '../src/cache.js';
import { buildSnapshot } from '../src/broadcaster.js';

describe('Representative 7 Symbols Verification', () => {
  const symbols = [
    'BTCUSDT',
    'ETHUSDT',
    'AAVEUSDT',
    'AMPUSDT',
    'XLMUSDT',
    'ZROUSDT',
    'DOTUSDT',
  ];

  it('all 7 symbols successfully seed RSI, SMA, and Volume Ratio from live Binance candles', async () => {
    for (const sym of symbols) {
      initCacheEntry(sym);
      const seeded = await seedSymbol(sym);
      expect(seeded, `Failed to seed ${sym}`).toBe(true);

      const entry = getCacheEntry(sym);
      expect(entry, `Cache entry missing for ${sym}`).toBeDefined();

      // Apply realistic live price using the last closed candle
      const lastClose = entry!._closedCloses[entry!._closedCloses.length - 1] ?? 100;
      applyTickerUpdate({
        s: sym,
        E: Date.now(),
        c: lastClose.toString(),
        o: lastClose.toString(),
        h: (lastClose * 1.01).toString(),
        l: (lastClose * 0.99).toString(),
        v: '10000',
        q: '1000000',
      });
      // RSI-14
      expect(entry!.rsi14_1h, `${sym} missing RSI-14`).toBeDefined();
      expect(entry!.rsi14_1h).toBeGreaterThan(0);
      expect(entry!.rsi14_1h).toBeLessThanOrEqual(100);

      // SMA-20
      expect(entry!.sma20_1h, `${sym} missing SMA-20`).toBeDefined();
      expect(entry!.sma20_1h).toBeGreaterThan(0);

      // Volume Ratio
      expect(entry!.volumeRatio20_1h, `${sym} missing Volume Ratio`).toBeDefined();
      expect(entry!.volumeRatio20_1h).toBeGreaterThan(0);

      console.log(`[VERIFY] ${sym.padEnd(10)} | Price: ${entry!.price.toFixed(4).padStart(10)} | RSI(14): ${entry!.rsi14_1h?.toFixed(2).padStart(6)} | SMA(20): ${entry!.sma20_1h?.toFixed(4).padStart(10)} | VolRatio: ${entry!.volumeRatio20_1h?.toFixed(3).padStart(6)}`);
      // 20 closes and 20 volumes recorded
      expect(entry!._closedCloses.length).toBe(20);
      expect(entry!._closedVolumes.length).toBe(20);
    }

    // Verify broadcast snapshot contains all 7 with complete indicators
    const snapshot = buildSnapshot();
    for (const sym of symbols) {
      const coin = snapshot.coins.find((c) => c.s === sym);
      expect(coin, `${sym} not found in snapshot`).toBeDefined();
      expect(coin!.rsi14_1h, `${sym} missing rsi14_1h in DTO`).toBeDefined();
      expect(coin!.sma20_1h, `${sym} missing sma20_1h in DTO`).toBeDefined();
      expect(coin!.volumeRatio20_1h, `${sym} missing volumeRatio20_1h in DTO`).toBeDefined();
    }
  }, 30000); // 30s timeout for live network seeding of 7 coins
});

