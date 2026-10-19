/**
 * Shared TypeScript contracts for the Real-Time Crypto Scanner.
 *
 * These types are used by both the backend (ingestion hub) and the
 * frontend (scanner engine). Keep them in sync — changing a field here
 * requires updating the backend serializer and the frontend consumer.
 *
 * Convention for unavailable indicators:
 *   Use `undefined` (omit the field), never `null` or `0`.
 *   Zero is a valid numerical result; it must not represent "missing data".
 */

// ─── Market Data ─────────────────────────────────────────────────────────────

/**
 * Normalized market data object shared between backend and frontend.
 *
 * Prices and volumes come from the Binance !miniTicker@arr stream.
 * Technical indicators are computed from 1-hour REST klines and are
 * populated asynchronously after startup seeding completes.
 */
export interface MarketCoinDTO {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  s: string;

  /** Current market price — miniTicker field `c` (last trade price) */
  p: number;

  /**
   * 24-hour percentage price change.
   * Derived as: ((c - o) / o) * 100, rounded to 2 decimal places.
   * Guarded: 0 when open price is zero (new listing edge case).
   */
  c24: number;

  /** 24-hour rolling high price — miniTicker field `h` */
  h24: number;

  /** 24-hour rolling low price — miniTicker field `l` */
  l24: number;

  /**
   * 24-hour rolling quote asset volume in USDT — miniTicker field `q`.
   *
   * This is the total USDT turnover over the rolling 24-hour window.
   * It is NOT the same as hourly candle volume.
   * It is NOT used in the volumeRatio20_1h calculation.
   */
  v24: number;

  /**
   * Wilder's 14-period RSI computed on 1-hour candle closing prices.
   *
   * Range: 0–100 (inclusive).
   * Conventional thresholds: < 30 oversold, > 70 overbought.
   *
   * Availability: undefined until at least 15 closed 1h candles have been
   * received and the initial Wilder seed has been computed.
   *
   * Live ticks compute a provisional RSI from the previous completed
   * candle's close and the committed Wilder averages, without modifying
   * those committed averages. A new baseline is committed only when
   * a new hourly candle closes.
   */
  rsi14_1h?: number;

  /**
   * Simple Moving Average of the most recent 20 hourly candle closing prices.
   *
   * Availability: undefined until at least 20 closed 1h candles exist.
   */
  sma20_1h?: number;

  /**
   * Volume Spike Ratio: current hourly candle volume divided by the
   * arithmetic average of the preceding 20 completed hourly candle volumes.
   *
   * Example: a value of 2.5 means the current candle is accumulating
   * 2.5× its recent hourly average — a potential volume spike signal.
   *
   * Volume unit: both the current candle and the 20 historical candles
   * must use the identical unit (e.g. quote volume in USDT, from klines
   * field index [7]). Mixing base and quote volume is a bug.
   *
   * The current candle's volume is provisional until the hour closes.
   *
   * Availability: undefined when fewer than 20 completed historical candles
   * exist, or when the 20-candle average baseline is zero.
   */
  volumeRatio20_1h?: number;
}

// ─── Broadcast Protocol ───────────────────────────────────────────────────────

/**
 * Message payload broadcast from the backend WebSocket server to all
 * connected frontend clients at approximately 1 Hz.
 *
 * The `type` field acts as a message discriminator so the client can
 * safely switch on message type if additional message kinds are added later.
 *
 * Timestamp unit: Unix milliseconds (Date.now() on the server at the
 * moment the snapshot is assembled, before JSON.stringify is called).
 */
export interface MarketBroadcastPayload {
  type: 'market_snapshot';
  /** Unix milliseconds — server clock at snapshot assembly time */
  timestamp: number;
  /** Complete current universe snapshot (all tracked USDT coins) */
  coins: MarketCoinDTO[];
}

// ─── Automatic Watchlists ─────────────────────────────────────────────────────

/**
 * Automatic watchlists computed from the market snapshot on every 1Hz tick.
 *
 * These are derived views — not user-created lists. The ranking logic
 * lives on the frontend (Zustand selector). This interface defines the
 * shape of the computed result that components consume.
 *
 * Each array contains trading symbols (e.g. "BTCUSDT"), not full DTOs,
 * so components can look up live data from the market store by key.
 */
export interface AutoWatchlists {
  /** Symbols with the highest positive 24h % change, descending */
  topGainers: string[];
  /** Symbols with the lowest (most negative) 24h % change, ascending */
  topLosers: string[];
  /** Symbols with the highest 24h USDT quote volume, descending */
  highestVolume: string[];
}

// ─── Scanner Rules ────────────────────────────────────────────────────────────

/**
 * Fields on MarketCoinDTO that can be used as a rule condition operand.
 *
 * Adding a new indicator to the scanner requires adding its field name
 * here and to MarketCoinDTO.
 */
export type RuleField =
  | 'p'               // current price
  | 'c24'             // 24h % change
  | 'v24'             // 24h quote volume (USDT)
  | 'rsi14_1h'        // 1h RSI-14
  | 'sma20_1h'        // 1h SMA-20
  | 'volumeRatio20_1h'; // 1h volume spike ratio

/**
 * Supported numeric comparison operators for scanner conditions.
 *
 * Note: == and != on floating-point price/volume are rarely useful
 * in practice, but they are included for completeness and may be
 * used with rounded or integer-like values (e.g. RSI thresholds).
 */
export type ComparisonOperator = '>' | '<' | '>=' | '<=' | '==' | '!=';

/**
 * A single condition within a scanner rule.
 *
 * Example: { field: 'rsi14_1h', operator: '<', value: 30 }
 * reads as "RSI-14 (1h) is below 30".
 *
 * Evaluation when the field is undefined (indicator not yet seeded):
 * the condition evaluates to false — it never throws.
 */
export interface RuleCondition {
  field: RuleField;
  operator: ComparisonOperator;
  /** The numeric threshold to compare the field value against */
  value: number;
}

/**
 * A user-defined or preset scanner rule.
 *
 * Multiple conditions are combined with the rule's logic operator:
 *   AND — all conditions must pass for the coin to match.
 *   OR  — any condition passing is sufficient.
 *
 * Rules are stored in browser localStorage under the versioned key
 * "scanner:rules:v1" and validated with Zod on load.
 */
export interface ScannerRule {
  /** Unique identifier (UUID or similar) */
  id: string;
  /** Human-readable display name, e.g. "RSI Oversold + Volume Spike" */
  name: string;
  /** Whether the rule is actively evaluated against incoming snapshots */
  enabled: boolean;
  /** How multiple conditions are combined */
  logic: 'AND' | 'OR';
  conditions: RuleCondition[];
}

// ─── User Watchlists ──────────────────────────────────────────────────────────

/**
 * A named watchlist created and managed by the user.
 *
 * Stored in localStorage under "scanner:watchlists:v1".
 * Distinct from AutoWatchlists, which are market-condition driven.
 */
export interface UserWatchlist {
  /** Unique identifier */
  id: string;
  /** User-assigned name, e.g. "DeFi Favourites" */
  name: string;
  /** Array of trading symbols the user has pinned, e.g. ["BTCUSDT", "ETHUSDT"] */
  symbols: string[];
}

