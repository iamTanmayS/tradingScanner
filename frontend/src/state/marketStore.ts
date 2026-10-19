/**
 * Market store — Zustand.
 *
 * Holds the live market snapshot, connection state, and derived lists.
 *
 * Architecture:
 *   - coinsMap: Map<symbol, MarketCoinDTO>  — source of truth for all live data
 *   - setSnapshot: merges incoming payload, recomputes derived lists
 *   - Derived lists (gainers, losers, volume, rsiExtremes) computed ONCE per
 *     snapshot in setSnapshot — NOT in component selectors or render
 *   - Coins with price <= 0 are excluded from display and derived lists
 *   - Connection state is managed separately (set by the stream hook)
 */

import { create } from 'zustand';
import type { MarketCoinDTO, MarketBroadcastPayload } from '../../../shared/src/types.js';
import type { ScannerState } from '../scanner/transitions.js';
import {
  createScannerState,
  resetForBaseline,
  runScannerCycle,
} from '../scanner/transitions.js';
import type { ScannerRule } from '../../../shared/src/types.js';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/** Number of top symbols to include in each auto-watchlist panel. */
const AUTO_LIST_SIZE = 10;

/** RSI thresholds for the "RSI Extremes" panel */
const RSI_OVERSOLD = 35;
const RSI_OVERBOUGHT = 65;

export interface RsiExtreme {
  symbol: string;
  rsi: number;
  zone: 'oversold' | 'overbought';
}

export interface MarketState {
  // ── Live data ───────────────────────────────────────────────────────────────
  coinsMap: Map<string, MarketCoinDTO>;

  // ── Connection ──────────────────────────────────────────────────────────────
  connectionStatus: ConnectionStatus;
  /**
   * Browser timestamp (Date.now()) of when the last payload was received.
   * Used to compute data staleness in the UI. NOT the server's timestamp.
   */
  lastReceived: number;

  // ── Derived auto-watchlists (computed once per setSnapshot) ─────────────────
  topGainers: string[];   // symbols sorted by c24 desc
  topLosers: string[];    // symbols sorted by c24 asc
  highestVolume: string[]; // symbols sorted by v24 desc
  rsiExtremes: RsiExtreme[]; // symbols with RSI near extremes

  // ── Scanner ─────────────────────────────────────────────────────────────────
  scannerState: ScannerState;
  isBaseline: boolean;

  // ── Actions ─────────────────────────────────────────────────────────────────
  setSnapshot: (payload: MarketBroadcastPayload, rules: ScannerRule[]) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  resetBaseline: () => void;
}

export const useMarketStore = create<MarketState>((set, get) => ({
  coinsMap: new Map(),
  connectionStatus: 'connecting',
  lastReceived: 0,
  topGainers: [],
  topLosers: [],
  highestVolume: [],
  rsiExtremes: [],
  scannerState: createScannerState(),
  isBaseline: true,

  setSnapshot(payload: MarketBroadcastPayload, rules: ScannerRule[]) {
    const { coinsMap: prev, scannerState, isBaseline } = get();

    // Merge incoming coins into the map (partial updates — don't replace)
    const next = new Map(prev);
    for (const coin of payload.coins) {
      if (coin.p > 0) {
        next.set(coin.s, coin);
      }
    }

    // Build a flat array of valid coins for ranking
    const coins = Array.from(next.values());

    // ── Derive auto-watchlists ──────────────────────────────────────────────
    const withPrice = coins.filter(c => c.p > 0);

    const topGainers = [...withPrice]
      .sort((a, b) => b.c24 - a.c24)
      .slice(0, AUTO_LIST_SIZE)
      .map(c => c.s);

    const topLosers = [...withPrice]
      .sort((a, b) => a.c24 - b.c24)
      .slice(0, AUTO_LIST_SIZE)
      .map(c => c.s);

    const highestVolume = [...withPrice]
      .sort((a, b) => b.v24 - a.v24)
      .slice(0, AUTO_LIST_SIZE)
      .map(c => c.s);

    // RSI extremes: coins with RSI < oversold threshold or > overbought
    const rsiExtremes: RsiExtreme[] = withPrice
      .filter(c => c.rsi14_1h !== undefined)
      .map(c => {
        const rsi = c.rsi14_1h as number;
        if (rsi <= RSI_OVERSOLD) return { symbol: c.s, rsi, zone: 'oversold' as const };
        if (rsi >= RSI_OVERBOUGHT) return { symbol: c.s, rsi, zone: 'overbought' as const };
        return null;
      })
      .filter((x): x is RsiExtreme => x !== null)
      .sort((a, b) => {
        // Oversold nearest to 0 first, overbought nearest to 100 first
        if (a.zone === 'oversold' && b.zone === 'oversold') return a.rsi - b.rsi;
        if (a.zone === 'overbought' && b.zone === 'overbought') return b.rsi - a.rsi;
        return a.zone === 'oversold' ? -1 : 1;
      })
      .slice(0, AUTO_LIST_SIZE);

    // ── Run scanner cycle ───────────────────────────────────────────────────
    // Clone scanner state so React detects the change
    const nextScanner = runScannerCycle(
      {
        matchingNow: new Set(scannerState.matchingNow),
        ruleMatches: new Map(Array.from(scannerState.ruleMatches.entries()).map(([k, v]) => [k, new Set(v)])),
        symbolRules: new Map(Array.from(scannerState.symbolRules.entries()).map(([k, v]) => [k, new Set(v)])),
        recentEvents: scannerState.recentEvents,
        _failCounts: new Map(scannerState._failCounts),
        _cooldowns: new Map(scannerState._cooldowns),
      },
      payload.coins,
      rules,
      isBaseline
    );

    set({
      coinsMap: next,
      lastReceived: Date.now(),
      topGainers,
      topLosers,
      highestVolume,
      rsiExtremes,
      scannerState: nextScanner,
      isBaseline: false,
    });
  },

  setConnectionStatus(status: ConnectionStatus) {
    set({ connectionStatus: status });
  },

  resetBaseline() {
    const { scannerState } = get();
    const reset = resetForBaseline({
      matchingNow: new Set(scannerState.matchingNow),
      ruleMatches: new Map(Array.from(scannerState.ruleMatches.entries()).map(([k, v]) => [k, new Set(v)])),
      symbolRules: new Map(Array.from(scannerState.symbolRules.entries()).map(([k, v]) => [k, new Set(v)])),
      recentEvents: scannerState.recentEvents,
      _failCounts: new Map(scannerState._failCounts),
      _cooldowns: new Map(scannerState._cooldowns),
    });
    set({ scannerState: reset, isBaseline: true });
  },
}));

