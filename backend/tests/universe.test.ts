/**
 * universe.test.ts — Unit tests for exchange filtering and volume ranking.
 *
 * All tests use synthetic data — no real HTTP requests.
 */

import { describe, it, expect } from 'vitest';
import {
  filterEligibleSymbols,
  rankByVolume,
  STABLECOIN_BASE_ASSETS,
  type ExchangeSymbol,
  type Ticker24h,
} from '../src/universe.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSymbol(
  symbol: string,
  baseAsset: string,
  quoteAsset = 'USDT',
  status = 'TRADING',
): ExchangeSymbol {
  return { symbol, baseAsset, quoteAsset, status };
}

function makeTicker(symbol: string, quoteVolume: string): Ticker24h {
  return { symbol, quoteVolume };
}

// ─── filterEligibleSymbols ────────────────────────────────────────────────────

describe('filterEligibleSymbols', () => {
  it('accepts active USDT trading pairs', () => {
    const symbols = [
      makeSymbol('BTCUSDT', 'BTC'),
      makeSymbol('ETHUSDT', 'ETH'),
    ];
    const result = filterEligibleSymbols(symbols);
    expect(result.has('BTCUSDT')).toBe(true);
    expect(result.has('ETHUSDT')).toBe(true);
    expect(result.size).toBe(2);
  });

  it('rejects non-TRADING status symbols', () => {
    const symbols = [
      makeSymbol('XYZUSDT', 'XYZ', 'USDT', 'BREAK'),
      makeSymbol('ABCUSDT', 'ABC', 'USDT', 'PRE_TRADING'),
    ];
    expect(filterEligibleSymbols(symbols).size).toBe(0);
  });

  it('rejects non-USDT quote assets', () => {
    const symbols = [
      makeSymbol('BTCBUSD', 'BTC', 'BUSD'),
      makeSymbol('ETHBTC', 'ETH', 'BTC'),
      makeSymbol('BTCETH', 'BTC', 'ETH'),
    ];
    expect(filterEligibleSymbols(symbols).size).toBe(0);
  });

  it('rejects known stablecoin base assets', () => {
    const stableSymbols = [...STABLECOIN_BASE_ASSETS].map((base) =>
      makeSymbol(`${base}USDT`, base),
    );
    expect(filterEligibleSymbols(stableSymbols).size).toBe(0);
  });

  it('rejects USDCUSDT specifically', () => {
    const symbols = [makeSymbol('USDCUSDT', 'USDC')];
    expect(filterEligibleSymbols(symbols).size).toBe(0);
  });

  it('accepts a mix and filters correctly', () => {
    const symbols = [
      makeSymbol('BTCUSDT', 'BTC'),
      makeSymbol('USDCUSDT', 'USDC'),  // stablecoin — excluded
      makeSymbol('ETHBTC', 'ETH', 'BTC'), // wrong quote — excluded
      makeSymbol('SOLUSDT', 'SOL', 'USDT', 'BREAK'), // not trading — excluded
      makeSymbol('BNBUSDT', 'BNB'),
    ];
    const result = filterEligibleSymbols(symbols);
    expect(result.has('BTCUSDT')).toBe(true);
    expect(result.has('BNBUSDT')).toBe(true);
    expect(result.size).toBe(2);
  });

  it('returns an empty set for an empty input', () => {
    expect(filterEligibleSymbols([]).size).toBe(0);
  });
});

// ─── rankByVolume ─────────────────────────────────────────────────────────────

describe('rankByVolume', () => {
  const eligible = new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']);

  it('selects the highest-volume eligible symbols', () => {
    const tickers = [
      makeTicker('BTCUSDT', '1000000'),
      makeTicker('ETHUSDT', '500000'),
      makeTicker('SOLUSDT', '300000'),
      makeTicker('BNBUSDT', '200000'),
    ];
    const result = rankByVolume(tickers, eligible, 3);
    expect(result).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  });

  it('ignores tickers for symbols not in the eligible set', () => {
    const tickers = [
      makeTicker('USDCUSDT', '999999999'), // not eligible
      makeTicker('BTCUSDT', '1000000'),
    ];
    const result = rankByVolume(tickers, eligible, 5);
    expect(result).toEqual(['BTCUSDT']);
    expect(result).not.toContain('USDCUSDT');
  });

  it('returns at most `limit` symbols', () => {
    const tickers = [
      makeTicker('BTCUSDT', '1000000'),
      makeTicker('ETHUSDT', '900000'),
      makeTicker('SOLUSDT', '800000'),
      makeTicker('BNBUSDT', '700000'),
    ];
    expect(rankByVolume(tickers, eligible, 2)).toHaveLength(2);
  });

  it('handles non-finite volume strings gracefully', () => {
    const tickers = [
      makeTicker('BTCUSDT', 'NaN'),
      makeTicker('ETHUSDT', 'not-a-number'),
      makeTicker('SOLUSDT', '500000'),
    ];
    const result = rankByVolume(tickers, eligible, 5);
    // Only SOLUSDT has a valid volume
    expect(result).toEqual(['SOLUSDT']);
  });

  it('returns an empty array when there are no eligible tickers', () => {
    expect(rankByVolume([], eligible, 10)).toEqual([]);
  });
});

