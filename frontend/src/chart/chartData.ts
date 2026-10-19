/**
 * chartData.ts — Data utilities for TradingView Lightweight Charts v5.
 *
 * Handles:
 *   - Normalizing raw Binance klines to Lightweight Charts data structures.
 *   - Wilder RSI-14 series computation aligned identically with shared/src/rsi.ts.
 *   - Dynamic price precision detection based on coin price scale.
 *   - Historical fetching with transparent backend proxy fallback.
 */

import type { CandlestickData, HistogramData, LineData, Time } from 'lightweight-charts';
import type { RsiState } from '../../../shared/src/rsi.js';
import { calculateProvisionalRsi, commitCandle } from '../../../shared/src/rsi.js';

export { calculateProvisionalRsi, commitCandle, type RsiState };

export interface Kline {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // Quote asset volume (USDT)
}

export type DataSource = 'binance-direct' | 'backend-proxy';

export interface FetchKlinesResult {
  klines: Kline[];
  source: DataSource;
}

const BINANCE_DIRECT_REST = 'https://data-api.binance.vision/api/v3/klines';
const BACKEND_PROXY_REST =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
    ? `${import.meta.env.VITE_API_URL}/api/klines`
    : typeof window !== 'undefined' && window.location.hostname !== 'localhost'
      ? `${window.location.origin}/api/klines`
      : 'http://localhost:4000/api/klines';

/**
 * Parse raw Binance kline tuples into structured, sorted Klines.
 */
export function parseKlines(raw: unknown[]): Kline[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((row) => {
      const r = row as (string | number)[];
      const rawTime = Number(r[0] ?? 0);
      const time = Math.floor(rawTime / 1000) as Time;
      const open = parseFloat(String(r[1] ?? '0'));
      const high = parseFloat(String(r[2] ?? '0'));
      const low = parseFloat(String(r[3] ?? '0'));
      const close = parseFloat(String(r[4] ?? '0'));
      const volume = parseFloat(String(r[7] ?? '0')); // quote asset volume in USDT

      return { time, open, high, low, close, volume };
    })
    .filter(
      (k) =>
        Number.isFinite(k.open) &&
        Number.isFinite(k.high) &&
        Number.isFinite(k.low) &&
        Number.isFinite(k.close) &&
        (k.time as number) > 0,
    )
    .sort((a, b) => (a.time as number) - (b.time as number));
}

/**
 * Convert Klines into CandlestickData array.
 */
export function toCandlestickData(klines: Kline[]): CandlestickData[] {
  return klines.map((k) => ({
    time: k.time,
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
  }));
}

/**
 * Convert Klines into HistogramData array for Volume pane with bullish/bearish colors.
 */
export function toVolumeData(klines: Kline[]): HistogramData[] {
  return klines.map((k) => ({
    time: k.time,
    value: k.volume,
    color: k.close >= k.open ? 'rgba(52, 211, 160, 0.55)' : 'rgba(244, 104, 122, 0.55)',
  }));
}

export interface HistoricalRsiResult {
  rsiData: LineData[];
  state: RsiState | null;
}

/**
 * Calculate historical Wilder RSI-14 series and return the committed RsiState
 * for subsequent live provisional updates.
 *
 * Mathematically identical to Wilder smoothing in shared/src/rsi.ts.
 */
export function computeHistoricalRsiSeries(klines: Kline[], period = 14): HistoricalRsiResult {
  if (klines.length < period + 1) {
    return { rsiData: [], state: null };
  }

  const closes = klines.map((k) => k.close);
  const rsiData: LineData[] = [];

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const delta = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    if (delta >= 0) avgGain += delta;
    else avgLoss += Math.abs(delta);
  }
  avgGain /= period;
  avgLoss /= period;

  const firstRsi = avgGain + avgLoss === 0 ? 50 : (100 * avgGain) / (avgGain + avgLoss);
  const periodKline = klines[period];
  if (periodKline) {
    rsiData.push({
      time: periodKline.time,
      value: Math.round(firstRsi * 100) / 100,
    });
  }

  const smooth = period - 1;
  for (let i = period + 1; i < closes.length; i++) {
    const delta = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * smooth + gain) / period;
    avgLoss = (avgLoss * smooth + loss) / period;
    const rsi = avgGain + avgLoss === 0 ? 50 : (100 * avgGain) / (avgGain + avgLoss);
    const currentKline = klines[i];
    if (currentKline) {
      rsiData.push({
        time: currentKline.time,
        value: Math.round(rsi * 100) / 100,
      });
    }
  }

  const lastClose = closes[closes.length - 1] ?? 0;
  const state: RsiState = {
    avgGain,
    avgLoss,
    prevClose: lastClose,
    period,
  };

  return { rsiData, state };
}

/**
 * Determine dynamic price precision and minimum tick move for price formatting.
 */
export function getPricePrecision(price: number): { precision: number; minMove: number } {
  if (!Number.isFinite(price) || price <= 0) {
    return { precision: 2, minMove: 0.01 };
  }
  if (price < 0.0001) {
    return { precision: 8, minMove: 0.00000001 };
  }
  if (price < 0.01) {
    return { precision: 6, minMove: 0.000001 };
  }
  if (price < 1) {
    return { precision: 4, minMove: 0.0001 };
  }
  if (price < 100) {
    return { precision: 2, minMove: 0.01 };
  }
  return { precision: 2, minMove: 0.01 };
}

/**
 * Fetch klines with primary direct Binance request and transparent backend proxy fallback.
 */
export async function fetchKlinesWithFallback(
  symbol: string,
  interval: string,
  limit = 200,
  signal?: AbortSignal,
): Promise<FetchKlinesResult> {
  const query = `symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;

  const init: RequestInit = signal ? { signal } : {};

  // 1. Try direct Binance REST
  try {
    const directUrl = `${BINANCE_DIRECT_REST}?${query}`;
    const directRes = await fetch(directUrl, init);
    if (directRes.ok) {
      const raw = (await directRes.json()) as unknown[];
      const klines = parseKlines(raw);
      if (klines.length > 0) {
        return { klines, source: 'binance-direct' };
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    console.warn(`[chartData] Direct Binance fetch failed for ${symbol}: ${String(err)}. Trying backend fallback...`);
  }

  // 2. Fallback to backend proxy
  try {
    const proxyUrl = `${BACKEND_PROXY_REST}?${query}`;
    const proxyRes = await fetch(proxyUrl, init);
    if (proxyRes.ok) {
      const raw = (await proxyRes.json()) as unknown[];
      const klines = parseKlines(raw);
      if (klines.length > 0) {
        return { klines, source: 'backend-proxy' };
      }
    }
    throw new Error(`Proxy returned HTTP ${proxyRes.status}`);
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new Error(`Failed to load candle data from direct source and proxy fallback: ${String(err)}`);
  }
}
