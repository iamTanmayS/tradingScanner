/**
 * indicators.ts — Historical indicator seeding and live indicator updates.
 *
 * Responsibilities:
 *   1. Fetch completed 1h klines for the top-N coins and seed
 *      RSI-14, SMA-20, and Volume Ratio into the cache.
 *   2. After seeding, apply live provisional RSI updates on every price tick.
 *   3. On hourly candle close, commit the new candle into the indicator state.
 *
 * Volume unit:
 *   All volume comparisons use QUOTE ASSET volume (USDT), which is klines
 *   field index [7]. Base asset volume (field [5]) is intentionally ignored
 *   to ensure consistent units across all 21 candles.
 *
 * Candle close detection:
 *   A candle is considered "completed" when its closeTime < Date.now().
 *   The last candle in a klines response is typically still forming and is
 *   excluded from committed indicator state.
 */
/**
 * Raw kline array element from Binance REST API.
 * Index positions as per Binance documentation:
 *   [0]  openTime (ms)
 *   [1]  open
 *   [2]  high
 *   [3]  low
 *   [4]  close          ← used for RSI/SMA
 *   [5]  baseVolume     ← NOT used
 *   [6]  closeTime (ms) ← used to detect completed candles
 *   [7]  quoteVolume    ← used for Volume Ratio (USDT)
 *   [8]  trades
 */
export type RawKline = [
    number,
    string,
    string,
    string,
    string,
    string,
    number,
    string,
    number,
    ...unknown[]
];
export interface ParsedCandle {
    openTime: number;
    closeTime: number;
    close: number;
    quoteVolume: number;
}
/**
 * Parse a raw Binance kline array into a typed ParsedCandle.
 * Returns null if any required field is invalid.
 */
export declare function parseKline(raw: RawKline): ParsedCandle | null;
/**
 * Parse an array of raw klines and filter to completed candles only.
 * A candle is completed when closeTime < now.
 */
export declare function parseCompletedKlines(rawKlines: RawKline[], now?: number): ParsedCandle[];
/**
 * Fetch completed 1h klines for one symbol and seed indicators independently.
 *
 * Requirements for indicators:
 *   - RSI-14: requires >= 15 completed closes (14 deltas).
 *   - SMA-20: requires >= 20 completed closes.
 *   - Volume Ratio: requires >= 21 completed candles (20 preceding + 1 latest).
 *
 * Each indicator is computed independently based on available history.
 * A newly listed coin with 15-19 candles gets RSI-14 even if SMA and Volume Ratio
 * are not yet available.
 *
 * Returns true if candle history was successfully fetched and recorded.
 * Returns false only on network/fetch failure or 0 candles.
 */
export declare function seedSymbol(symbol: string): Promise<boolean>;
/**
 * Seed indicators for `symbols` with a controlled concurrency limit.
 *
 * The top coins are seeded first (index 0 = highest volume).
 * Unseeded symbols can be safely retried.
 */
export declare function seedIndicators(symbols: string[]): Promise<void>;
/**
 * Apply a live price tick to update provisional indicators.
 *
 * Only provisional RSI is updated here (O(1), no state mutation).
 * SMA and volume ratio are updated on hourly candle close only.
 *
 * Call this AFTER applyTickerUpdate() has set entry.price.
 */
export declare function applyLiveIndicatorTick(symbol: string): void;
/**
 * Apply live indicator ticks for ALL seeded symbols in the cache.
 * Called once per miniTicker batch after merging ticker updates.
 */
export declare function applyAllLiveTicks(): void;
/**
 * Commit a newly closed 1h candle for a symbol.
 *
 * This is called by the hourly maintenance loop when a new candle is detected.
 * It:
 *   1. Advances the Wilder RSI state via commitCandle().
 *   2. Shifts _closedCloses and _closedVolumes (keep last 20).
 *   3. Recalculates SMA-20 and volume ratio from the new history.
 *   4. Updates indicator fields on the cache entry.
 *
 * Idempotent: if candle.openTime === _lastCommittedOpenTime, it is a no-op.
 */
export declare function commitNewCandle(symbol: string, candle: ParsedCandle): void;
