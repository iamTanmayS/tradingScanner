/**
 * Simple Moving Average (SMA) calculation.
 *
 * All functions are pure — no global state, no side effects, no I/O.
 * Input arrays are never mutated.
 *
 * Convention:
 *   - "closes" arrays are in chronological order (oldest index 0, newest last).
 *   - SMA is computed over the most recent `period` values.
 *   - Returns null when insufficient data is available.
 *   - All input prices must be finite positive numbers.
 */
/**
 * Calculate the Simple Moving Average of the most recent `period` closing prices.
 *
 * The SMA is the arithmetic mean of the last N values in the array:
 *   SMA = (C[n-period+1] + C[n-period+2] + ... + C[n]) / period
 *
 * Only the most recent `period` values are used — older values are ignored.
 *
 * Design note: For repeated real-time updates, a rolling-sum optimisation
 * (subtract the outgoing close, add the incoming close) can reduce work
 * from O(period) to O(1) per update. That optimisation belongs in the
 * backend indicator cache layer, not in this pure function.
 *
 * @param closes - Chronological closing prices, oldest first. Immutable.
 * @param period - Number of candles to average (default 20). Must be ≥ 1.
 * @returns SMA as a finite number, or null when closes.length < period.
 * @throws {Error} for invalid period or non-finite/non-positive close values.
 */
export declare function calculateSMA(closes: readonly number[], period?: number): number | null;
