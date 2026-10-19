/**
 * Wilder's RSI-14 implementation.
 *
 * All functions are pure — no global state, no side effects, no I/O.
 * Input arrays are never mutated.
 *
 * Conventions used throughout:
 *   - "closes" arrays are in chronological order (oldest index 0, newest last).
 *   - All closing prices must be finite positive numbers.
 *   - `null` is returned — never NaN or undefined — when data is insufficient.
 *   - Flat-market convention: RSI = 50 when both avgGain and avgLoss are 0.
 *
 * Provisional RSI:
 *   The live (intraday) RSI is computed from the previous completed candle's
 *   close and the committed Wilder averages stored in an RsiState object.
 *   Repeated live ticks always use the SAME committed baseline — they never
 *   update avgGain or avgLoss. A new RsiState is produced only when a new
 *   hourly candle closes and commitCandle() is called.
 */
/**
 * Committed Wilder RSI state produced after seeding from historical candles.
 * Pass this into calculateProvisionalRsi() on every live price tick.
 * Update it by calling commitCandle() when a new hourly candle closes.
 */
export interface RsiState {
    /** Smoothed average gain at the last committed candle close */
    readonly avgGain: number;
    /** Smoothed average loss at the last committed candle close */
    readonly avgLoss: number;
    /** Closing price of the last committed hourly candle */
    readonly prevClose: number;
    /** RSI period — typically 14 */
    readonly period: number;
}
/**
 * Calculate Wilder's RSI from a chronological array of closing prices.
 *
 * Algorithm:
 *   1. Compute price changes for each adjacent pair.
 *   2. Seed initial avgGain / avgLoss as simple averages of the first
 *      `period` changes (Wilder's initialisation).
 *   3. Apply Wilder's recursive smoothing for all subsequent changes:
 *        avgGain = (prevAvgGain * (period - 1) + gain) / period
 *        avgLoss = (prevAvgLoss * (period - 1) + loss) / period
 *   4. Compute RSI = 100 * avgGain / (avgGain + avgLoss).
 *
 * @param closes - Chronological closing prices, oldest first. Immutable.
 * @param period - RSI period (default 14). Must be an integer ≥ 2.
 * @returns RSI in [0, 100], or null when fewer than period+1 closes exist.
 * @throws {Error} for invalid period or non-finite/non-positive closes.
 */
export declare function calculateRSI(closes: readonly number[], period?: number): number | null;
/**
 * Build an RsiState object from a historical closes array.
 *
 * This is called once during backend startup seeding. The resulting state
 * is stored in the indicator cache alongside prevClose, then used by
 * calculateProvisionalRsi() on every subsequent live tick.
 *
 * @param closes - Chronological closing prices, oldest first. Need period+1 minimum.
 * @param period - RSI period (default 14).
 * @returns Committed RsiState, or null if insufficient data.
 * @throws {Error} for invalid inputs.
 */
export declare function buildRsiState(closes: readonly number[], period?: number): RsiState | null;
/**
 * Commit a newly closed hourly candle into the RSI state.
 *
 * Call this ONCE per closed candle (keyed by candle openTime to ensure
 * idempotency — the same candle must never be committed twice).
 *
 * Returns a new RsiState; the original is not mutated.
 *
 * @param state   - Current committed state.
 * @param newClose - Closing price of the newly closed candle.
 * @returns New committed RsiState.
 * @throws {Error} for invalid inputs.
 */
export declare function commitCandle(state: RsiState, newClose: number): RsiState;
/**
 * Calculate a provisional (intraday) RSI from a live price tick.
 *
 * This performs O(1) work regardless of historical candle count.
 *
 * The committed state is NOT modified. Every live tick between candle
 * closes uses the same baseline (same avgGain, avgLoss, prevClose).
 * This is deliberate: only commitCandle() advances the baseline.
 *
 * @param state       - Committed RSI state from the last closed candle.
 * @param currentPrice - Current live price (provisional candle close).
 * @returns Provisional RSI in [0, 100].
 * @throws {Error} for invalid inputs.
 */
export declare function calculateProvisionalRsi(state: RsiState, currentPrice: number): number;
