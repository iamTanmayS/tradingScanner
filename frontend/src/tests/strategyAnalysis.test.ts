/**
 * Strategy analysis tests — validates plain-language strategy explanations,
 * duplicate name disambiguation, and honest data states.
 */

import { describe, it, expect } from 'vitest';
import type { ScannerRule } from '../../../shared/src/types.js';
import type { CoinEvalFields } from '../stream/marketAdapter.js';
import {
  analyzeCondition,
  analyzeStrategy,
  analyzeAllStrategies,
} from '../scanner/strategyAnalysis.js';

describe('analyzeCondition', () => {
  it('formats current and target values with plain language', () => {
    const fields: CoinEvalFields = {
      p: 65000,
      c24: 4.25,
      v24: 250_000_000,
      rsi: 28.4,
      sma: 63000,
      vr: 2.1,
    };

    const cond = { field: 'rsi14_1h' as const, operator: '<' as const, value: 35 };
    const analysis = analyzeCondition(cond, fields);

    expect(analysis.status).toBe('passed');
    expect(analysis.formattedCurrent).toBe('28.4');
    expect(analysis.formattedTarget).toBe('< 35.0');
    expect(analysis.explanation).toContain('RSI (1h) is 28.4');
    expect(analysis.isRsi).toBe(true);
  });

  it('honestly reports waiting_data when an indicator is undefined', () => {
    const fields: CoinEvalFields = {
      p: 1.25,
      c24: -1.5,
      v24: 10_000,
      // rsi undefined
    };

    const cond = { field: 'rsi14_1h' as const, operator: '<' as const, value: 30 };
    const analysis = analyzeCondition(cond, fields);

    expect(analysis.status).toBe('waiting_data');
    expect(analysis.formattedCurrent).toBe('—');
    expect(analysis.explanation).toBe('RSI (1h) is waiting for indicator data');
  });
});

describe('analyzeStrategy', () => {
  it('reports "2 of 2 conditions met" for full match under AND', () => {
    const fields: CoinEvalFields = {
      p: 100,
      c24: 5,
      v24: 1_000_000,
      rsi: 25,
      vr: 2.5,
    };

    const rule: ScannerRule = {
      id: 'r1',
      name: 'Oversold Spike',
      enabled: true,
      logic: 'AND',
      conditions: [
        { field: 'rsi14_1h', operator: '<', value: 30 },
        { field: 'volumeRatio20_1h', operator: '>', value: 2 },
      ],
    };

    const res = analyzeStrategy(rule, fields);
    expect(res.status).toBe('matched');
    expect(res.summaryText).toBe('2 of 2 conditions met');
  });

  it('reports "1 of 2 conditions met" for partial match under AND', () => {
    const fields: CoinEvalFields = {
      p: 100,
      c24: 5,
      v24: 1_000_000,
      rsi: 45, // fails
      vr: 2.5, // passes
    };

    const rule: ScannerRule = {
      id: 'r1',
      name: 'Oversold Spike',
      enabled: true,
      logic: 'AND',
      conditions: [
        { field: 'rsi14_1h', operator: '<', value: 30 },
        { field: 'volumeRatio20_1h', operator: '>', value: 2 },
      ],
    };

    const res = analyzeStrategy(rule, fields);
    expect(res.status).toBe('partial');
    expect(res.summaryText).toBe('1 of 2 conditions met');
  });

  it('reports "Strategy paused" when rule is disabled', () => {
    const fields: CoinEvalFields = { p: 100, c24: 5, v24: 1_000_000, rsi: 25 };
    const rule: ScannerRule = {
      id: 'r1',
      name: 'Oversold Spike',
      enabled: false,
      logic: 'AND',
      conditions: [{ field: 'rsi14_1h', operator: '<', value: 30 }],
    };

    const res = analyzeStrategy(rule, fields);
    expect(res.status).toBe('paused');
    expect(res.summaryText).toBe('Strategy paused');
  });
});

describe('analyzeAllStrategies', () => {
  it('disambiguates identical rule names using condition summaries', () => {
    const fields: CoinEvalFields = { p: 100, c24: 0, v24: 1000, rsi: 30 };
    const rules: ScannerRule[] = [
      {
        id: 'r1',
        name: 'Oversold',
        enabled: true,
        logic: 'AND',
        conditions: [{ field: 'rsi14_1h', operator: '<', value: 35 }],
      },
      {
        id: 'r2',
        name: 'Oversold',
        enabled: true,
        logic: 'AND',
        conditions: [{ field: 'rsi14_1h', operator: '<', value: 25 }],
      },
    ];

    const results = analyzeAllStrategies(rules, fields);
    expect(results).toHaveLength(2);
    expect(results[0]?.displayName).not.toBe(results[1]?.displayName);
    expect(results[0]?.displayName).toContain('RSI (1h)');
  });

  it('sorts matched strategies first, then partial, then not met', () => {
    const fields: CoinEvalFields = { p: 100, c24: 0, v24: 1000, rsi: 25 };
    const rules: ScannerRule[] = [
      {
        id: 'r1',
        name: 'Not Met',
        enabled: true,
        logic: 'AND',
        conditions: [{ field: 'rsi14_1h', operator: '>', value: 70 }],
      },
      {
        id: 'r2',
        name: 'Matched',
        enabled: true,
        logic: 'AND',
        conditions: [{ field: 'rsi14_1h', operator: '<', value: 30 }],
      },
    ];

    const results = analyzeAllStrategies(rules, fields);
    expect(results[0]?.id).toBe('r2'); // matched first
    expect(results[1]?.id).toBe('r1'); // not met second
  });
});

