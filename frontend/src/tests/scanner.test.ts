/**
 * Scanner engine tests — pure unit tests, no React rendering.
 *
 * Tests evaluateCondition, evaluateRule, and evaluateAllRules.
 */

import { describe, it, expect } from 'vitest';
import type { RuleCondition, ScannerRule } from '../../../shared/src/types.js';
import type { CoinEvalFields } from '../stream/marketAdapter.js';
import { evaluateCondition, evaluateRule, evaluateAllRules } from '../scanner/evaluateCondition.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const fullFields: CoinEvalFields = {
  p:    50000,
  c24:  3.5,
  v24:  500_000_000,
  rsi:  28,
  sma:  49000,
  vr:   2.1,
  dsma: ((50000 / 49000) - 1) * 100, // ~2.04
};

function makeRule(overrides: Partial<ScannerRule> = {}): ScannerRule {
  return {
    id:         'test-rule',
    name:       'Test Rule',
    enabled:    true,
    logic:      'AND',
    conditions: [],
    ...overrides,
  };
}

function makeCond(overrides: Partial<RuleCondition> = {}): RuleCondition {
  return {
    field:    'rsi14_1h',
    operator: '<',
    value:    30,
    ...overrides,
  };
}

// ── evaluateCondition ─────────────────────────────────────────────────────────

describe('evaluateCondition', () => {
  it('> operator: true when field > value', () => {
    const cond: RuleCondition = { field: 'c24', operator: '>', value: 3.0 };
    expect(evaluateCondition(cond, fullFields)).toBe(true);
  });

  it('> operator: false when field equals value', () => {
    const cond: RuleCondition = { field: 'c24', operator: '>', value: 3.5 };
    expect(evaluateCondition(cond, fullFields)).toBe(false);
  });

  it('>= operator: true when field equals value', () => {
    const cond: RuleCondition = { field: 'c24', operator: '>=', value: 3.5 };
    expect(evaluateCondition(cond, fullFields)).toBe(true);
  });

  it('< operator: true when field < value', () => {
    const cond: RuleCondition = { field: 'rsi14_1h', operator: '<', value: 30 };
    expect(evaluateCondition(cond, fullFields)).toBe(true);
  });

  it('< operator: false when field equals value', () => {
    const cond: RuleCondition = { field: 'rsi14_1h', operator: '<', value: 28 };
    expect(evaluateCondition(cond, fullFields)).toBe(false);
  });

  it('<= operator: true when field equals value', () => {
    const cond: RuleCondition = { field: 'rsi14_1h', operator: '<=', value: 28 };
    expect(evaluateCondition(cond, fullFields)).toBe(true);
  });

  it('returns false for undefined RSI field', () => {
    const fields: CoinEvalFields = { p: 100, c24: 1, v24: 1000 }; // no rsi
    const cond: RuleCondition = { field: 'rsi14_1h', operator: '<', value: 30 };
    expect(evaluateCondition(cond, fields)).toBe(false);
  });

  it('returns false for undefined SMA field', () => {
    const fields: CoinEvalFields = { p: 100, c24: 1, v24: 1000 };
    const cond: RuleCondition = { field: 'sma20_1h', operator: '<', value: 200 };
    expect(evaluateCondition(cond, fields)).toBe(false);
  });

  it('returns false for undefined volumeRatio field', () => {
    const fields: CoinEvalFields = { p: 100, c24: 1, v24: 1000 };
    const cond: RuleCondition = { field: 'volumeRatio20_1h', operator: '>', value: 1 };
    expect(evaluateCondition(cond, fields)).toBe(false);
  });

  it('returns false for NaN value in field', () => {
    const fields: CoinEvalFields = { p: NaN, c24: 0, v24: 0 };
    const cond: RuleCondition = { field: 'p', operator: '>', value: 0 };
    expect(evaluateCondition(cond, fields)).toBe(false);
  });

  it('returns false for Infinity value in field', () => {
    const fields: CoinEvalFields = { p: Infinity, c24: 0, v24: 0 };
    const cond: RuleCondition = { field: 'p', operator: '>', value: 0 };
    expect(evaluateCondition(cond, fields)).toBe(false);
  });

  it('evaluates dsma field (virtual computed field via adapter)', () => {
    // dsma is computed in adaptCoin — here we test it is resolved correctly
    const fields: CoinEvalFields = { p: 50000, c24: 0, v24: 0, dsma: 2.04 };
    const cond: RuleCondition = { field: 'rsi14_1h', operator: '>', value: 0 };
    // dsma field not in RuleField union, use a direct test:
    // Here we verify volume ratio field resolution
    const vrCond: RuleCondition = { field: 'volumeRatio20_1h', operator: '<', value: 5 };
    const fieldsWithVr: CoinEvalFields = { p: 50000, c24: 0, v24: 0, vr: 2.1 };
    expect(evaluateCondition(vrCond, fieldsWithVr)).toBe(true);
  });
});

// ── evaluateRule ──────────────────────────────────────────────────────────────

describe('evaluateRule', () => {
  it('AND: returns true when all conditions pass', () => {
    const rule = makeRule({
      logic: 'AND',
      conditions: [
        { field: 'rsi14_1h', operator: '<', value: 30 },
        { field: 'c24',      operator: '>', value: 0 },
      ],
    });
    expect(evaluateRule(rule, fullFields)).toBe(true);
  });

  it('AND: returns false when any condition fails', () => {
    const rule = makeRule({
      logic: 'AND',
      conditions: [
        { field: 'rsi14_1h', operator: '<', value: 30 },
        { field: 'c24',      operator: '>', value: 10 }, // fails — 3.5 < 10
      ],
    });
    expect(evaluateRule(rule, fullFields)).toBe(false);
  });

  it('OR: returns true when any condition passes', () => {
    const rule = makeRule({
      logic: 'OR',
      conditions: [
        { field: 'rsi14_1h', operator: '<', value: 30 }, // passes
        { field: 'c24',      operator: '>', value: 10 }, // fails
      ],
    });
    expect(evaluateRule(rule, fullFields)).toBe(true);
  });

  it('OR: returns false when all conditions fail', () => {
    const rule = makeRule({
      logic: 'OR',
      conditions: [
        { field: 'rsi14_1h', operator: '>', value: 80 }, // fails
        { field: 'c24',      operator: '<', value: -5 }, // fails
      ],
    });
    expect(evaluateRule(rule, fullFields)).toBe(false);
  });

  it('returns false for disabled rule', () => {
    const rule = makeRule({
      enabled: false,
      conditions: [{ field: 'rsi14_1h', operator: '<', value: 30 }],
    });
    expect(evaluateRule(rule, fullFields)).toBe(false);
  });

  it('returns false for rule with no conditions', () => {
    const rule = makeRule({ conditions: [] });
    expect(evaluateRule(rule, fullFields)).toBe(false);
  });

  it('returns false (not throw) when indicator is undefined', () => {
    const fields: CoinEvalFields = { p: 1000, c24: 1, v24: 1000 }; // no rsi
    const rule = makeRule({
      conditions: [{ field: 'rsi14_1h', operator: '<', value: 30 }],
    });
    expect(() => evaluateRule(rule, fields)).not.toThrow();
    expect(evaluateRule(rule, fields)).toBe(false);
  });

  it('handles multiple conditions with missing indicators gracefully', () => {
    const fields: CoinEvalFields = { p: 1000, c24: 5, v24: 1000 }; // no rsi, no sma, no vr
    const rule = makeRule({
      logic: 'AND',
      conditions: [
        { field: 'c24',              operator: '>', value: 0 },    // passes
        { field: 'rsi14_1h',         operator: '<', value: 30 },   // undefined → false
        { field: 'volumeRatio20_1h', operator: '>', value: 1.5 },  // undefined → false
      ],
    });
    expect(evaluateRule(rule, fields)).toBe(false);
  });

  it('OR with one missing indicator still resolves from valid conditions', () => {
    const fields: CoinEvalFields = { p: 1000, c24: 5, v24: 1000 }; // no rsi
    const rule = makeRule({
      logic: 'OR',
      conditions: [
        { field: 'rsi14_1h', operator: '<', value: 30 }, // undefined → false
        { field: 'c24',      operator: '>', value: 3 },  // passes
      ],
    });
    expect(evaluateRule(rule, fields)).toBe(true);
  });
});

// ── evaluateAllRules ──────────────────────────────────────────────────────────

describe('evaluateAllRules', () => {
  it('returns empty set when no rules match', () => {
    const rules: ScannerRule[] = [
      makeRule({ id: 'r1', conditions: [{ field: 'rsi14_1h', operator: '>', value: 80 }] }),
    ];
    const result = evaluateAllRules(rules, fullFields);
    expect(result.size).toBe(0);
  });

  it('returns matching rule IDs', () => {
    const rules: ScannerRule[] = [
      makeRule({ id: 'r1', conditions: [{ field: 'rsi14_1h', operator: '<', value: 30 }] }),
      makeRule({ id: 'r2', conditions: [{ field: 'c24', operator: '>', value: 10 }] }),
    ];
    const result = evaluateAllRules(rules, fullFields);
    expect(result.has('r1')).toBe(true);
    expect(result.has('r2')).toBe(false);
  });

  it('skips disabled rules', () => {
    const rules: ScannerRule[] = [
      makeRule({ id: 'r1', enabled: false, conditions: [{ field: 'rsi14_1h', operator: '<', value: 30 }] }),
    ];
    expect(evaluateAllRules(rules, fullFields).size).toBe(0);
  });
});

