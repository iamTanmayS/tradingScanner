/**
 * Public entry point for @crypto-scanner/shared.
 *
 * Import shared types and indicator functions through this module.
 * Do not import from internal file paths directly.
 */

// Types & contracts
export type {
  MarketCoinDTO,
  MarketBroadcastPayload,
  AutoWatchlists,
  RuleField,
  ComparisonOperator,
  RuleCondition,
  ScannerRule,
  UserWatchlist,
} from './types.js';

// RSI — Wilder's 14-period
export type { RsiState } from './rsi.js';
export {
  calculateRSI,
  buildRsiState,
  commitCandle,
  calculateProvisionalRsi,
} from './rsi.js';

// SMA — Simple Moving Average
export { calculateSMA } from './sma.js';

// Volume — Spike ratio
export { calculateVolumeRatio } from './volume.js';

