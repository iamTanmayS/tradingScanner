/**
 * Frontend adapter: maps backend DTO fields to scanner rule evaluation keys.
 *
 * The backend sends MarketCoinDTO with transport-compact field names.
 * The scanner engine needs a consistent lookup surface that also includes
 * derived fields like `dsma` (% distance from SMA).
 *
 * This adapter keeps the DTO contract untouched while giving the scanner
 * a stable, readable API.
 *
 * Field mapping:
 *   rsi  → rsi14_1h
 *   sma  → sma20_1h
 *   vr   → volumeRatio20_1h
 *   dsma → computed: ((p / sma20_1h) - 1) * 100   (only when both are valid)
 *   p    → p  (price, pass-through)
 *   c24  → c24 (24h % change, pass-through)
 *   v24  → v24 (24h volume, pass-through)
 */

import type { MarketCoinDTO } from '../../../shared/src/types.js';

/** The resolved field values the scanner engine evaluates against. */
export interface CoinEvalFields {
  p: number;
  c24: number;
  v24: number;
  rsi?: number | undefined;
  sma?: number | undefined;
  vr?: number | undefined;
  /**
   * % deviation from SMA-20.
   * Positive = price above SMA (bullish), Negative = below (bearish).
   * undefined when price or sma is missing or sma is zero.
   */
  dsma?: number | undefined;
}

/**
 * Adapts a MarketCoinDTO into the flat field surface used by the scanner engine.
 *
 * All indicator fields use undefined (not 0) when unavailable.
 */
export function adaptCoin(coin: MarketCoinDTO): CoinEvalFields {
  const { p, c24, v24, rsi14_1h, sma20_1h, volumeRatio20_1h } = coin;

  let dsma: number | undefined;
  if (
    typeof p === 'number' &&
    p > 0 &&
    typeof sma20_1h === 'number' &&
    sma20_1h > 0
  ) {
    dsma = ((p / sma20_1h) - 1) * 100;
  }

  return {
    p,
    c24,
    v24,
    rsi: rsi14_1h,
    sma: sma20_1h,
    vr: volumeRatio20_1h,
    dsma,
  };
}

