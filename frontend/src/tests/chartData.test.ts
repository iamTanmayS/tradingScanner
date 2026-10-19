/**
 * chartData.test.ts — Unit tests for chart data parsing, RSI math, and fallback fetching.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  parseKlines,
  toCandlestickData,
  toVolumeData,
  computeHistoricalRsiSeries,
  getPricePrecision,
  fetchKlinesWithFallback,
  type Kline,
} from '../chart/chartData.js';
import { calculateRSI } from '../../../shared/src/rsi.js';
import type { Time } from 'lightweight-charts';

describe('parseKlines', () => {
  it('parses raw Binance klines tuple into sorted Kline objects', () => {
    const raw = [
      [1700003600000, '100', '110', '95', '105', '50', 1700007199999, '5000'],
      [1700000000000, '90', '102', '89', '100', '40', 1700003599999, '4000'],
    ];

    const klines = parseKlines(raw);
    expect(klines.length).toBe(2);
    // Should be sorted chronologically
    expect(klines[0]!.time).toBe(1700000000 as Time);
    expect(klines[0]!.open).toBe(90);
    expect(klines[0]!.volume).toBe(4000);

    expect(klines[1]!.time).toBe(1700003600 as Time);
    expect(klines[1]!.close).toBe(105);
  });

  it('filters out invalid or non-numeric items', () => {
    const raw = [
      ['invalid', 'bad', 'bad', 'bad', 'bad'],
      [1700000000000, '100', '110', '90', '105', '10', 1700003599999, '1000'],
    ];
    const klines = parseKlines(raw);
    expect(klines.length).toBe(1);
    expect(klines[0]!.open).toBe(100);
  });
});

describe('toCandlestickData & toVolumeData', () => {
  const klines: Kline[] = [
    { time: 100 as Time, open: 10, high: 15, low: 8, close: 12, volume: 1000 },
    { time: 200 as Time, open: 12, high: 14, low: 9, close: 9, volume: 2000 },
  ];

  it('transforms klines into CandlestickData', () => {
    const candles = toCandlestickData(klines);
    expect(candles.length).toBe(2);
    expect(candles[0]!.time).toBe(100 as Time);
    expect(candles[0]!.open).toBe(10);
    expect(candles[0]!.close).toBe(12);
  });

  it('transforms klines into VolumeData with green/red colors', () => {
    const vols = toVolumeData(klines);
    expect(vols.length).toBe(2);
    expect(vols[0]!.value).toBe(1000);
    // 12 >= 10 -> bullish green
    expect(vols[0]!.color).toContain('52, 211, 160');
    // 9 < 12 -> bearish red
    expect(vols[1]!.color).toContain('244, 104, 122');
  });
});

describe('computeHistoricalRsiSeries', () => {
  it('returns empty array when fewer than 15 candles', () => {
    const shortKlines: Kline[] = Array.from({ length: 14 }, (_, i) => ({
      time: (i * 100) as Time,
      open: 100,
      high: 105,
      low: 95,
      close: 100 + i,
      volume: 500,
    }));
    const res = computeHistoricalRsiSeries(shortKlines, 14);
    expect(res.rsiData.length).toBe(0);
    expect(res.state).toBeNull();
  });

  it('matches calculateRSI from shared package at the final candle', () => {
    // Generate 50 realistic price steps
    let p = 100;
    const klines: Kline[] = [];
    const deltas = [1, -2, 3, -1, -2, 4, 2, -3, 1, 2, -1, 3, -2, 1, 2, -4, 5, 1, -2, 3];
    for (let i = 0; i < 30; i++) {
      p += deltas[i % deltas.length]!;
      klines.push({
        time: (1000 + i * 3600) as Time,
        open: p - 1,
        high: p + 2,
        low: p - 2,
        close: p,
        volume: 1000,
      });
    }

    const { rsiData, state } = computeHistoricalRsiSeries(klines, 14);
    expect(rsiData.length).toBe(16); // 30 candles - 14 = 16 points

    const sharedRsi = calculateRSI(klines.map((k) => k.close), 14);
    expect(sharedRsi).not.toBeNull();
    const lastCalculatedRsi = rsiData[rsiData.length - 1]!.value;

    // Both should match rounded to 2 decimal places
    expect(Math.abs(lastCalculatedRsi - (sharedRsi ?? 0))).toBeLessThanOrEqual(0.02);
    expect(state).not.toBeNull();
    expect(state!.prevClose).toBe(klines[klines.length - 1]!.close);
  });

  it('handles flat prices and returns RSI 50 for flat market', () => {
    const flatKlines: Kline[] = Array.from({ length: 25 }, (_, i) => ({
      time: (1000 + i * 3600) as Time,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 1000,
    }));

    const { rsiData, state } = computeHistoricalRsiSeries(flatKlines, 14);
    expect(rsiData.length).toBe(11);
    // Every flat RSI should be exactly 50
    for (const point of rsiData) {
      expect(point.value).toBe(50);
    }
    expect(state).not.toBeNull();
    expect(state!.avgGain).toBe(0);
    expect(state!.avgLoss).toBe(0);
  });
});

describe('Volume semantics (quote asset USDT at index [7])', () => {
  it('extracts quote volume from index 7 instead of base volume from index 5', () => {
    // Index 5: 12.5 (BTC), Index 7: 1250000 (USDT quote volume)
    const raw = [
      [1700000000000, '100000', '101000', '99000', '100500', '12.5', 1700003599999, '1250000', 500],
    ];

    const klines = parseKlines(raw);
    expect(klines.length).toBe(1);
    expect(klines[0]!.volume).toBe(1250000); // Must be quote volume, NOT 12.5
    expect(klines[0]!.volume).not.toBe(12.5);
  });
});

describe('getPricePrecision', () => {
  it('assigns 8 decimal places for tiny altcoins < 0.0001', () => {
    const res = getPricePrecision(0.00001234);
    expect(res.precision).toBe(8);
    expect(res.minMove).toBe(0.00000001);
  });

  it('assigns 4 decimal places for coins between 0.01 and 1', () => {
    const res = getPricePrecision(0.456);
    expect(res.precision).toBe(4);
    expect(res.minMove).toBe(0.0001);
  });

  it('assigns 2 decimal places for coins >= 100', () => {
    const res = getPricePrecision(84500.5);
    expect(res.precision).toBe(2);
    expect(res.minMove).toBe(0.01);
  });
});

describe('fetchKlinesWithFallback', () => {
  it('falls back to backend proxy if direct fetch fails', async () => {
    const mockDirectFailure = vi.fn().mockRejectedValue(new Error('CORS Error'));
    const mockProxySuccess = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        [1700000000000, '50', '55', '48', '52', '100', 1700003599999, '5200'],
      ],
    });

    // Mock global fetch
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('binance.vision')) return mockDirectFailure();
      return mockProxySuccess();
    });

    try {
      const res = await fetchKlinesWithFallback('SOLUSDT', '1h', 5);
      expect(res.source).toBe('backend-proxy');
      expect(res.klines.length).toBe(1);
      expect(res.klines[0]!.close).toBe(52);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('rejects with error when both direct Binance and backend proxy fail', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('binance.vision')) {
        return Promise.reject(new Error('Direct connection refused'));
      }
      return Promise.resolve({
        ok: false,
        status: 502,
        json: async () => ({ error: 'Proxy upstream failed' }),
      });
    });

    try {
      await expect(fetchKlinesWithFallback('BTCUSDT', '1h', 10)).rejects.toThrow(
        /Failed to load candle data from direct source and proxy fallback/,
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});

