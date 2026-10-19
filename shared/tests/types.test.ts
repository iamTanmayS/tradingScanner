import { describe, it, expect } from 'vitest';
import type {
  MarketCoinDTO,
  MarketBroadcastPayload,
  AutoWatchlists,
  RuleCondition,
  ScannerRule,
  UserWatchlist,
} from '../src/types.js';

// ─── Overview ─────────────────────────────────────────────────────────────────
//
// Tests verify structural invariants, correct field mappings matching
// Binance miniTicker compact conventions (s, p, c24, h24, l24, v24),
// optional indicator semantics (undefined when uncalculated, never null or 0),
// and strict adherence to shared contracts.

// ─── MarketCoinDTO ────────────────────────────────────────────────────────────

describe('MarketCoinDTO', () => {
  it('accepts a minimal object (only required fields, no indicators)', () => {
    const coin: MarketCoinDTO = {
      s: 'BTCUSDT',
      p: 81000,
      c24: -1.83,
      h24: 82000,
      l24: 80000,
      v24: 345_084_458,
    };

    expect(coin.s).toBe('BTCUSDT');
    expect(typeof coin.p).toBe('number');
    expect(typeof coin.c24).toBe('number');
    expect(typeof coin.h24).toBe('number');
    expect(typeof coin.l24).toBe('number');
    expect(typeof coin.v24).toBe('number');
    expect(coin.rsi14_1h).toBeUndefined();
    expect(coin.sma20_1h).toBeUndefined();
    expect(coin.volumeRatio20_1h).toBeUndefined();
  });

  it('accepts an object with optional indicator fields populated', () => {
    const coin: MarketCoinDTO = {
      s: 'ETHUSDT',
      p: 2367,
      c24: -1.83,
      h24: 2430,
      l24: 2356,
      v24: 345_084_458,
      rsi14_1h: 48.5,
      sma20_1h: 2400,
      volumeRatio20_1h: 2.1,
    };

    expect(coin.rsi14_1h).toBeCloseTo(48.5, 5);
    expect(coin.sma20_1h).toBeCloseTo(2400, 5);
    expect(coin.volumeRatio20_1h).toBeCloseTo(2.1, 5);
  });

  it('optional indicator fields must remain undefined when omitted, never null', () => {
    const coin: MarketCoinDTO = {
      s: 'SOLUSDT',
      p: 140,
      c24: 2.5,
      h24: 145,
      l24: 135,
      v24: 50_000_000,
    };

    expect(coin.rsi14_1h).toBeUndefined();
    expect(coin.sma20_1h).toBeUndefined();
    expect(coin.volumeRatio20_1h).toBeUndefined();
  });
});

// ─── AutoWatchlists ───────────────────────────────────────────────────────────

describe('AutoWatchlists', () => {
  it('accepts an object with three string symbol arrays', () => {
    const watchlists: AutoWatchlists = {
      topGainers: ['BTCUSDT', 'ETHUSDT'],
      topLosers: ['SOLUSDT'],
      highestVolume: ['BNBUSDT', 'BTCUSDT'],
    };

    expect(watchlists.topGainers).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(watchlists.topLosers).toEqual(['SOLUSDT']);
    expect(watchlists.highestVolume).toEqual(['BNBUSDT', 'BTCUSDT']);
  });

  it('accepts empty symbol arrays', () => {
    const watchlists: AutoWatchlists = {
      topGainers: [],
      topLosers: [],
      highestVolume: [],
    };
    expect(watchlists.topGainers).toHaveLength(0);
    expect(watchlists.topLosers).toHaveLength(0);
    expect(watchlists.highestVolume).toHaveLength(0);
  });
});

// ─── MarketBroadcastPayload ───────────────────────────────────────────────────

describe('MarketBroadcastPayload', () => {
  it('accepts a valid market_snapshot payload', () => {
    const payload: MarketBroadcastPayload = {
      type: 'market_snapshot',
      timestamp: 1792340334000,
      coins: [
        {
          s: 'BTCUSDT',
          p: 81000,
          c24: -1.83,
          h24: 82000,
          l24: 80000,
          v24: 345_084_458,
        },
      ],
    };

    expect(payload.type).toBe('market_snapshot');
    expect(typeof payload.timestamp).toBe('number');
    expect(payload.coins).toHaveLength(1);
    expect(payload.coins[0]?.s).toBe('BTCUSDT');
  });
});

// ─── RuleCondition ────────────────────────────────────────────────────────────

describe('RuleCondition', () => {
  it('accepts a valid condition object with each field type', () => {
    const condition: RuleCondition = {
      field: 'rsi14_1h',
      operator: '<',
      value: 30,
    };

    expect(condition.field).toBe('rsi14_1h');
    expect(condition.operator).toBe('<');
    expect(condition.value).toBe(30);
  });

  it('accepts all supported comparison operators', () => {
    const operators: RuleCondition['operator'][] = ['<', '<=', '>', '>=', '==', '!='];
    for (const op of operators) {
      const c: RuleCondition = { field: 'c24', operator: op, value: 5 };
      expect(c.operator).toBe(op);
    }
  });

  it('accepts all supported RuleFields', () => {
    const fields: RuleCondition['field'][] = [
      'p', 'c24', 'v24', 'rsi14_1h', 'sma20_1h', 'volumeRatio20_1h',
    ];
    for (const f of fields) {
      const c: RuleCondition = { field: f, operator: '>', value: 0 };
      expect(c.field).toBe(f);
    }
  });
});

// ─── ScannerRule ──────────────────────────────────────────────────────────────

describe('ScannerRule', () => {
  it('accepts a valid rule with AND logic and conditions', () => {
    const rule: ScannerRule = {
      id: 'rule-001',
      name: 'Oversold RSI',
      enabled: true,
      logic: 'AND',
      conditions: [{ field: 'rsi14_1h', operator: '<', value: 30 }],
    };

    expect(rule.id).toBe('rule-001');
    expect(rule.logic).toBe('AND');
    expect(rule.conditions).toHaveLength(1);
    expect(rule.enabled).toBe(true);
  });

  it('accepts a rule with OR logic and multiple conditions', () => {
    const rule: ScannerRule = {
      id: 'rule-002',
      name: 'Volume spike or pump',
      enabled: true,
      logic: 'OR',
      conditions: [
        { field: 'volumeRatio20_1h', operator: '>', value: 2.0 },
        { field: 'c24', operator: '>', value: 10 },
      ],
    };

    expect(rule.logic).toBe('OR');
    expect(rule.conditions).toHaveLength(2);
  });

  it('accepts a disabled rule', () => {
    const rule: ScannerRule = {
      id: 'rule-003',
      name: 'Disabled rule',
      enabled: false,
      logic: 'AND',
      conditions: [{ field: 'p', operator: '>', value: 100 }],
    };
    expect(rule.enabled).toBe(false);
  });
});

// ─── UserWatchlist ────────────────────────────────────────────────────────────

describe('UserWatchlist', () => {
  it('accepts a valid user watchlist with symbol strings', () => {
    const wl: UserWatchlist = {
      id: 'wl-001',
      name: 'My DeFi picks',
      symbols: ['UNIUSDT', 'AAVEUSDT', 'MKRUSDT'],
    };

    expect(wl.id).toBe('wl-001');
    expect(wl.symbols).toEqual(['UNIUSDT', 'AAVEUSDT', 'MKRUSDT']);
  });

  it('accepts an empty watchlist', () => {
    const wl: UserWatchlist = {
      id: 'wl-empty',
      name: 'Empty watchlist',
      symbols: [],
    };
    expect(wl.symbols).toHaveLength(0);
  });
});
