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
// ─── Internal helpers ─────────────────────────────────────────────────────────
/**
 * Validate that every element in the array is a finite positive number.
 *
 * @throws {Error} with a descriptive message if any value is invalid.
 */
function assertValidCloses(closes, label = 'closes') {
    for (let i = 0; i < closes.length; i++) {
        const c = closes[i];
        if (c === undefined || !Number.isFinite(c) || c <= 0) {
            throw new Error(`Invalid value in ${label} at index ${i}: ${c}. ` +
                'All values must be finite positive numbers.');
        }
    }
}
/**
 * Validate that a period value is a positive integer ≥ 1.
 *
 * @throws {Error} if the period is unusable.
 */
function assertValidPeriod(period) {
    if (!Number.isInteger(period) || period < 1) {
        throw new Error(`Invalid SMA period: ${period}. Period must be a positive integer.`);
    }
}
// ─── Public API ───────────────────────────────────────────────────────────────
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
export function calculateSMA(closes, period = 20) {
    assertValidPeriod(period);
    assertValidCloses(closes);
    if (closes.length < period)
        return null;
    // Sum only the last `period` elements
    const start = closes.length - period;
    let sum = 0;
    for (let i = start; i < closes.length; i++) {
        sum += closes[i];
    }
    return sum / period;
}
