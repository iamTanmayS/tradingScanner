/**
 * Transition tracker tests — silent baseline, exit hysteresis, cooldown, event log.
 *
 * Pure unit tests — no React rendering.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { MarketCoinDTO, ScannerRule } from '../../../shared/src/types.js';
import {
  createScannerState,
  resetForBaseline,
  runScannerCycle,
  type ScannerState,
} from '../scanner/transitions.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCoin(overrides: Partial<MarketCoinDTO> = {}): MarketCoinDTO {
  return {
    s:   'BTCUSDT',
    p:   50000,
    c24: 2.5,
    h24: 51000,
    l24: 49000,
    v24: 1_000_000_000,
    ...overrides,
  };
}

function makeMatchingRule(): ScannerRule {
  return {
    id:      'rule-1',
    name:    'Always Match',
    enabled: true,
    logic:   'AND',
    conditions: [{ field: 'p', operator: '>', value: 0 }],
  };
}

function makeNonMatchingRule(): ScannerRule {
  return {
    id:      'rule-2',
    name:    'Never Match',
    enabled: true,
    logic:   'AND',
    conditions: [{ field: 'p', operator: '>', value: 999_999_999 }],
  };
}

let state: ScannerState;
beforeEach(() => { state = createScannerState(); });

// ── Baseline ──────────────────────────────────────────────────────────────────

describe('baseline', () => {
  it('populates matchingNow without emitting events', () => {
    const coin   = makeCoin({ s: 'BTCUSDT' });
    const rules  = [makeMatchingRule()];

    runScannerCycle(state, [coin], rules, true, 1000);

    expect(state.matchingNow.has('BTCUSDT')).toBe(true);
    expect(state.recentEvents).toHaveLength(0);
  });

  it('resetForBaseline clears matchingNow and fail counts', () => {
    state.matchingNow.add('BTCUSDT');
    state._failCounts.set('BTCUSDT', 2);

    resetForBaseline(state);

    expect(state.matchingNow.size).toBe(0);
    expect(state._failCounts.size).toBe(0);
    expect(state.recentEvents).toHaveLength(0); // events preserved
  });

  it('baseline after reconnect does not emit events for pre-existing matches', () => {
    state.matchingNow.add('ETHUSDT');
    const reset = resetForBaseline(state);
    const coin  = makeCoin({ s: 'ETHUSDT' });

    runScannerCycle(reset, [coin], [makeMatchingRule()], true, 2000);

    expect(reset.recentEvents).toHaveLength(0);
    expect(reset.matchingNow.has('ETHUSDT')).toBe(true);
  });
});

// ── Entry ─────────────────────────────────────────────────────────────────────

describe('entry event', () => {
  it('emits event when coin first enters matchingNow (non-baseline)', () => {
    const coin  = makeCoin({ s: 'BTCUSDT' });
    const rules = [makeMatchingRule()];

    runScannerCycle(state, [coin], rules, false, 1000);

    expect(state.matchingNow.has('BTCUSDT')).toBe(true);
    expect(state.recentEvents).toHaveLength(1);
    expect(state.recentEvents[0]?.symbol).toBe('BTCUSDT');
    expect(state.recentEvents[0]?.ruleName).toBe('Always Match');
  });

  it('does NOT emit a second event for ongoing match (no per-tick events)', () => {
    const coin  = makeCoin({ s: 'BTCUSDT' });
    const rules = [makeMatchingRule()];

    runScannerCycle(state, [coin], rules, false, 1000);
    runScannerCycle(state, [coin], rules, false, 2000); // still matching
    runScannerCycle(state, [coin], rules, false, 3000);

    expect(state.recentEvents).toHaveLength(1); // only the first entry
  });

  it('skips coins with price <= 0', () => {
    const coin  = makeCoin({ s: 'BTCUSDT', p: 0 });
    const rules = [makeMatchingRule()];

    runScannerCycle(state, [coin], rules, false, 1000);

    expect(state.matchingNow.has('BTCUSDT')).toBe(false);
    expect(state.recentEvents).toHaveLength(0);
  });
});

// ── Exit hysteresis ───────────────────────────────────────────────────────────

describe('exit hysteresis', () => {
  it('does not exit after 1 non-matching batch', () => {
    const coin  = makeCoin({ s: 'BTCUSDT' });
    const rules = [makeMatchingRule()];

    runScannerCycle(state, [coin], rules, false, 1000); // enter
    runScannerCycle(state, [coin], [makeNonMatchingRule()], false, 2000); // 1 fail

    expect(state.matchingNow.has('BTCUSDT')).toBe(true); // still in
  });

  it('exits after 2 consecutive non-matching batches', () => {
    const coin  = makeCoin({ s: 'BTCUSDT' });
    const rules = [makeMatchingRule()];

    runScannerCycle(state, [coin], rules, false, 1000); // enter
    runScannerCycle(state, [coin], [makeNonMatchingRule()], false, 2000); // fail 1
    runScannerCycle(state, [coin], [makeNonMatchingRule()], false, 3000); // fail 2 → exit

    expect(state.matchingNow.has('BTCUSDT')).toBe(false);
  });

  it('resets fail counter if coin re-matches before exit', () => {
    const coin    = makeCoin({ s: 'BTCUSDT' });
    const match   = [makeMatchingRule()];
    const nomatch = [makeNonMatchingRule()];

    runScannerCycle(state, [coin], match,   false, 1000); // enter
    runScannerCycle(state, [coin], nomatch, false, 2000); // fail 1
    runScannerCycle(state, [coin], match,   false, 3000); // back to matching → reset fail
    runScannerCycle(state, [coin], nomatch, false, 4000); // fail 1 again (not 2)

    expect(state.matchingNow.has('BTCUSDT')).toBe(true);
  });
});

// ── Re-entry cooldown ─────────────────────────────────────────────────────────

describe('re-entry cooldown', () => {
  it('blocks second entry event within 10s cooldown', () => {
    const coin  = makeCoin({ s: 'BTCUSDT' });
    const match   = [makeMatchingRule()];
    const nomatch = [makeNonMatchingRule()];

    runScannerCycle(state, [coin], match,   false, 1000);   // enter → event 1
    runScannerCycle(state, [coin], nomatch, false, 2000);   // fail 1
    runScannerCycle(state, [coin], nomatch, false, 3000);   // fail 2 → exit
    // Re-enter within cooldown (1000 + 10000 = 11000ms, but now is 5000)
    runScannerCycle(state, [coin], match,   false, 5000);   // re-enter within cooldown

    expect(state.matchingNow.has('BTCUSDT')).toBe(true);
    expect(state.recentEvents).toHaveLength(1); // no second event
  });

  it('allows re-entry event after cooldown expires', () => {
    const coin  = makeCoin({ s: 'BTCUSDT' });
    const match   = [makeMatchingRule()];
    const nomatch = [makeNonMatchingRule()];

    runScannerCycle(state, [coin], match,   false, 1000);    // enter → event 1, cooldown until 11000
    runScannerCycle(state, [coin], nomatch, false, 2000);
    runScannerCycle(state, [coin], nomatch, false, 3000);    // exit
    // Re-enter after cooldown
    runScannerCycle(state, [coin], match,   false, 12000);   // 12000 > 11000 → allowed

    expect(state.recentEvents).toHaveLength(2); // second event fired
  });
});

// ── Event log bounds ──────────────────────────────────────────────────────────

describe('event log bounds', () => {
  it('truncates recentEvents to 50 entries', () => {
    const rules = [makeMatchingRule()];

    for (let i = 0; i < 60; i++) {
      const freshState = createScannerState();
      const sym = `COIN${i}USDT`;
      const coin = makeCoin({ s: sym });
      runScannerCycle(state, [coin], rules, false, i * 100);
      // Merge events
      state.recentEvents = [...freshState.recentEvents, ...state.recentEvents].slice(0, 50);
    }

    // Simulate 60 unique entries via single-pass
    const bigState = createScannerState();
    const coins = Array.from({ length: 60 }, (_, i) => makeCoin({ s: `X${i}USDT` }));
    for (const coin of coins) {
      runScannerCycle(bigState, [coin], rules, false, Date.now());
    }

    expect(bigState.recentEvents.length).toBeLessThanOrEqual(50);
  });
});

// ── Per-rule independent matching & tab membership ────────────────────────────

describe('per-rule independent matching & tab membership', () => {
  it('tracks matches independently for multiple enabled rules', () => {
    const coinBTC = makeCoin({ s: 'BTCUSDT', p: 50000, c24: 5 });
    const coinETH = makeCoin({ s: 'ETHUSDT', p: 3000, c24: -2 });

    const ruleHighPrice: ScannerRule = {
      id: 'rule-high-price',
      name: 'High Price',
      enabled: true,
      logic: 'AND',
      conditions: [{ field: 'p', operator: '>', value: 10000 }],
    };

    const ruleGainer: ScannerRule = {
      id: 'rule-gainer',
      name: '24h Gainer',
      enabled: true,
      logic: 'AND',
      conditions: [{ field: 'c24', operator: '>', value: 0 }],
    };

    const rules = [ruleHighPrice, ruleGainer];
    runScannerCycle(state, [coinBTC, coinETH], rules, false, 1000);

    // Rule A: BTC matches (50000 > 10000), ETH fails (3000 <= 10000)
    const highMatches = state.ruleMatches.get('rule-high-price');
    expect(highMatches?.has('BTCUSDT')).toBe(true);
    expect(highMatches?.has('ETHUSDT')).toBe(false);

    // Rule B: BTC matches (5 > 0), ETH fails (-2 <= 0)
    const gainerMatches = state.ruleMatches.get('rule-gainer');
    expect(gainerMatches?.has('BTCUSDT')).toBe(true);
    expect(gainerMatches?.has('ETHUSDT')).toBe(false);

    // BTC matches both rules
    expect(state.symbolRules.get('BTCUSDT')?.has('rule-high-price')).toBe(true);
    expect(state.symbolRules.get('BTCUSDT')?.has('rule-gainer')).toBe(true);
  });

  it('coin matching only Rule A appears only in Rule A, coin matching both appears in both', () => {
    const coinSOL = makeCoin({ s: 'SOLUSDT', p: 150, c24: 10 }); // only gainer, not high price
    const coinBTC = makeCoin({ s: 'BTCUSDT', p: 60000, c24: 8 }); // both

    const ruleHighPrice: ScannerRule = {
      id: 'rule-high-price',
      name: 'High Price',
      enabled: true,
      logic: 'AND',
      conditions: [{ field: 'p', operator: '>', value: 10000 }],
    };

    const ruleGainer: ScannerRule = {
      id: 'rule-gainer',
      name: '24h Gainer',
      enabled: true,
      logic: 'AND',
      conditions: [{ field: 'c24', operator: '>', value: 0 }],
    };

    runScannerCycle(state, [coinSOL, coinBTC], [ruleHighPrice, ruleGainer], false, 1000);

    // SOL appears only in rule-gainer
    expect(state.ruleMatches.get('rule-gainer')?.has('SOLUSDT')).toBe(true);
    expect(state.ruleMatches.get('rule-high-price')?.has('SOLUSDT')).toBe(false);

    // BTC appears in both
    expect(state.ruleMatches.get('rule-gainer')?.has('BTCUSDT')).toBe(true);
    expect(state.ruleMatches.get('rule-high-price')?.has('BTCUSDT')).toBe(true);
  });

  it('disabling a rule immediately removes it from ruleMatches and symbolRules', () => {
    const coin = makeCoin({ s: 'BTCUSDT', p: 50000 });
    const ruleA: ScannerRule = {
      id: 'rule-a',
      name: 'Rule A',
      enabled: true,
      logic: 'AND',
      conditions: [{ field: 'p', operator: '>', value: 1000 }],
    };
    const ruleB: ScannerRule = {
      id: 'rule-b',
      name: 'Rule B',
      enabled: true,
      logic: 'AND',
      conditions: [{ field: 'p', operator: '>', value: 1000 }],
    };

    // Cycle 1: both enabled
    runScannerCycle(state, [coin], [ruleA, ruleB], false, 1000);
    expect(state.ruleMatches.get('rule-a')?.has('BTCUSDT')).toBe(true);
    expect(state.ruleMatches.get('rule-b')?.has('BTCUSDT')).toBe(true);

    // Cycle 2: disable ruleA
    const ruleADisabled = { ...ruleA, enabled: false };
    runScannerCycle(state, [coin], [ruleADisabled, ruleB], false, 2000);

    expect(state.ruleMatches.has('rule-a')).toBe(false);
    expect(state.ruleMatches.get('rule-b')?.has('BTCUSDT')).toBe(true);
    expect(state.symbolRules.get('BTCUSDT')?.has('rule-a')).toBeFalsy();
    expect(state.symbolRules.get('BTCUSDT')?.has('rule-b')).toBe(true);
  });

  it('hysteresis is tracked per rule independently', () => {
    const coin = makeCoin({ s: 'BTCUSDT', p: 50000, c24: 5 });
    const rulePrice: ScannerRule = {
      id: 'rule-price',
      name: 'Price Rule',
      enabled: true,
      logic: 'AND',
      conditions: [{ field: 'p', operator: '>', value: 40000 }],
    };
    const ruleChange: ScannerRule = {
      id: 'rule-change',
      name: 'Change Rule',
      enabled: true,
      logic: 'AND',
      conditions: [{ field: 'c24', operator: '>', value: 0 }],
    };

    // Initial match
    runScannerCycle(state, [coin], [rulePrice, ruleChange], false, 1000);
    expect(state.ruleMatches.get('rule-price')?.has('BTCUSDT')).toBe(true);
    expect(state.ruleMatches.get('rule-change')?.has('BTCUSDT')).toBe(true);

    // Batch 1: Change drops below 0 (1 fail for change rule), price still matches
    const coinDrop1 = makeCoin({ s: 'BTCUSDT', p: 50000, c24: -1 });
    runScannerCycle(state, [coinDrop1], [rulePrice, ruleChange], false, 2000);
    expect(state.ruleMatches.get('rule-price')?.has('BTCUSDT')).toBe(true);
    expect(state.ruleMatches.get('rule-change')?.has('BTCUSDT')).toBe(true); // 1 fail, still in

    // Batch 2: Change still below 0 (2 fails for change rule -> exit), price still matches
    const coinDrop2 = makeCoin({ s: 'BTCUSDT', p: 50000, c24: -2 });
    runScannerCycle(state, [coinDrop2], [rulePrice, ruleChange], false, 3000);
    expect(state.ruleMatches.get('rule-price')?.has('BTCUSDT')).toBe(true);
    expect(state.ruleMatches.get('rule-change')?.has('BTCUSDT')).toBe(false); // exited
  });
});

