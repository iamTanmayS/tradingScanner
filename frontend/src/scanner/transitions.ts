/**
 * Scanner transition tracker.
 *
 * Manages the lifecycle of scanner signal events:
 *   - Silent baseline: populate matchingNow without emitting events
 *   - Exit hysteresis: 2 consecutive non-matching batches required to exit
 *   - Re-entry cooldown: 10 seconds before the same symbol can fire again
 *   - Recent events: bounded log of up to 50 transition entries
 *
 * This module is pure — no React, no side effects beyond the state it mutates.
 */

import type { MarketCoinDTO, ScannerRule } from '../../../shared/src/types.js';
import { adaptCoin } from '../stream/marketAdapter.js';
import { evaluateRule } from './evaluateCondition.js';

/** A single transition event recorded when a symbol first matches a rule. */
export interface TransitionEvent {
  /** When this event was recorded (browser timestamp, ms) */
  timestamp: number;
  /** The symbol that matched */
  symbol: string;
  /** The rule that triggered the transition */
  ruleId: string;
  /** Human-readable rule name for display */
  ruleName: string;
  /** Price at the time of the match */
  price: number;
  /** 24h change % at the time of the match */
  c24: number;
}

/** Scanner state — held in the Zustand store. */
export interface ScannerState {
  /** Currently matching symbols across any enabled rule (Set<symbol>) */
  matchingNow: Set<string>;
  /** Per-rule matching symbols: Map<ruleId, Set<symbol>> */
  ruleMatches: Map<string, Set<string>>;
  /** Map of symbol -> Set<ruleId> for quick lookup of matching rules for a symbol */
  symbolRules: Map<string, Set<string>>;
  /** Bounded event log — FIFO, max 50 entries */
  recentEvents: TransitionEvent[];
  /** Internal: consecutive non-match counter per `${ruleId}:${symbol}` */
  _failCounts: Map<string, number>;
  /** Internal: re-entry cooldown timestamps per `${ruleId}:${symbol}` */
  _cooldowns: Map<string, number>;
}

/** Maximum entries in the recent events log. */
const MAX_RECENT_EVENTS = 50;

/** Consecutive non-match batches required to remove a symbol from matchingNow. */
const EXIT_HYSTERESIS = 2;

/** Re-entry cooldown in milliseconds. */
const REENTRY_COOLDOWN_MS = 10_000;

/** Creates a fresh empty scanner state. */
export function createScannerState(): ScannerState {
  return {
    matchingNow: new Set(),
    ruleMatches: new Map(),
    symbolRules: new Map(),
    recentEvents: [],
    _failCounts: new Map(),
    _cooldowns: new Map(),
  };
}

/**
 * Runs one scanner cycle over a batch of coins.
 *
 * @param state       Mutable scanner state (caller owns the reference)
 * @param coins       Current snapshot of coins to evaluate
 * @param rules       All user-defined rules (enabled and disabled)
 * @param isBaseline  When true, establish matchingNow silently — no events fired
 * @param now         Current timestamp in ms (injectable for testing)
 *
 * The function mutates `state` in-place and returns it for convenience.
 */
export function runScannerCycle(
  state: ScannerState,
  coins: MarketCoinDTO[],
  rules: ScannerRule[],
  isBaseline: boolean,
  now: number = Date.now()
): ScannerState {
  const enabledRules = rules.filter(r => r.enabled);
  const disabledRuleIds = new Set(rules.filter(r => !r.enabled).map(r => r.id));

  // Explicitly disabled rules are immediately removed from ruleMatches
  for (const ruleId of disabledRuleIds) {
    state.ruleMatches.delete(ruleId);
    for (const key of Array.from(state._failCounts.keys())) {
      if (key.startsWith(`${ruleId}:`)) {
        state._failCounts.delete(key);
      }
    }
  }

  // Ensure all enabled rules have a Set in ruleMatches
  for (const rule of enabledRules) {
    if (!state.ruleMatches.has(rule.id)) {
      state.ruleMatches.set(rule.id, new Set());
    }
  }

  for (const coin of coins) {
    if (coin.p <= 0) continue;

    const fields = adaptCoin(coin);
    const sym = coin.s;
    let matchesAny = false;

    for (const rule of enabledRules) {
      const ruleId = rule.id;
      const matchesSet = state.ruleMatches.get(ruleId)!;
      const failKey = `${ruleId}:${sym}`;
      const isMatch = evaluateRule(rule, fields);

      if (isMatch) {
        matchesAny = true;
        state._failCounts.delete(failKey);

        if (!matchesSet.has(sym)) {
          matchesSet.add(sym);

          if (!isBaseline) {
            const cooldownUntil = state._cooldowns.get(failKey) ?? 0;
            if (now >= cooldownUntil) {
              const event: TransitionEvent = {
                timestamp: now,
                symbol: sym,
                ruleId: rule.id,
                ruleName: rule.name,
                price: coin.p,
                c24: coin.c24,
              };
              state.recentEvents = [event, ...state.recentEvents].slice(0, MAX_RECENT_EVENTS);
              state._cooldowns.set(failKey, now + REENTRY_COOLDOWN_MS);
            }
          }
        }
      } else {
        if (matchesSet.has(sym)) {
          const fails = (state._failCounts.get(failKey) ?? 0) + 1;
          state._failCounts.set(failKey, fails);

          if (fails >= EXIT_HYSTERESIS) {
            matchesSet.delete(sym);
            state._failCounts.delete(failKey);
          }
        }
      }
    }

    // Rules in ruleMatches that are not enabled in this batch experience hysteresis
    for (const [ruleId, matchesSet] of state.ruleMatches.entries()) {
      if (!enabledRules.some(r => r.id === ruleId)) {
        if (matchesSet.has(sym)) {
          const failKey = `${ruleId}:${sym}`;
          const fails = (state._failCounts.get(failKey) ?? 0) + 1;
          state._failCounts.set(failKey, fails);

          if (fails >= EXIT_HYSTERESIS) {
            matchesSet.delete(sym);
            state._failCounts.delete(failKey);
          }
        }
      }
    }

    // Global matchingNow hysteresis
    if (matchesAny) {
      state._failCounts.delete(sym);
      state.matchingNow.add(sym);
    } else {
      const fails = (state._failCounts.get(sym) ?? 0) + 1;
      state._failCounts.set(sym, fails);

      if (fails >= EXIT_HYSTERESIS) {
        state.matchingNow.delete(sym);
        state._failCounts.delete(sym);
      }
    }
  }

  // Rebuild symbolRules lookup
  state.symbolRules.clear();
  for (const [ruleId, syms] of state.ruleMatches.entries()) {
    for (const sym of syms) {
      let setForSym = state.symbolRules.get(sym);
      if (!setForSym) {
        setForSym = new Set();
        state.symbolRules.set(sym, setForSym);
      }
      setForSym.add(ruleId);
    }
  }

  return state;
}

/**
 * Resets scanner state for a new baseline (e.g. after reconnect or rule edit).
 *
 * Call this, then immediately call runScannerCycle with isBaseline=true
 * to re-populate matchingNow without emitting events.
 */
export function resetForBaseline(state: ScannerState): ScannerState {
  state.matchingNow = new Set();
  state.ruleMatches = new Map();
  state.symbolRules = new Map();
  state._failCounts = new Map();
  // Preserve recentEvents and cooldowns across reconnect
  return state;
}

