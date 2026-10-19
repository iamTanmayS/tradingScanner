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

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Compute RSI from smoothed averages.
 * Uses the stable form 100 * avgGain / (avgGain + avgLoss) to avoid
 * an intermediate division that can amplify floating-point error.
 *
 * @returns finite number in [0, 100]
 */
function rsiFromAverages(avgGain: number, avgLoss: number): number {
  const total = avgGain + avgLoss;
  if (total === 0) return 50; // flat market — both averages are zero
  return (100 * avgGain) / total;
}

/**
 * Validate that every value in a closes array is a finite positive number.
 * Cryptocurrency prices must be > 0; non-finite values indicate bad data.
 *
 * @throws {Error} with a descriptive message if any value is invalid.
 */
function assertValidCloses(closes: readonly number[]): void {
  for (let i = 0; i < closes.length; i++) {
    const c = closes[i];
    // noUncheckedIndexedAccess: c may be undefined for empty arrays,
    // but the loop bound guards that. The cast is safe here.
    if (c === undefined || !Number.isFinite(c) || c <= 0) {
      throw new Error(
        `Invalid closing price at index ${i}: ${c}. ` +
          'All closes must be finite positive numbers.',
      );
    }
  }
}

/**
 * Validate that a period value is a positive integer ≥ 2.
 *
 * @throws {Error} if the period is not usable.
 */
function assertValidPeriod(period: number): void {
  if (!Number.isInteger(period) || period < 2) {
    throw new Error(
      `Invalid RSI period: ${period}. Period must be an integer ≥ 2.`,
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

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
export function calculateRSI(
  closes: readonly number[],
  period = 14,
): number | null {
  assertValidPeriod(period);
  assertValidCloses(closes);

  // Need at least period+1 prices to form period changes
  if (closes.length < period + 1) return null;

  const smooth = period - 1; // multiplier: period - 1

  // ── Step 1: compute all price changes ───────────────────────────────────────
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const delta = (closes[i] as number) - (closes[i - 1] as number);
    gains.push(delta > 0 ? delta : 0);
    losses.push(delta < 0 ? -delta : 0);
  }

  // ── Step 2: seed initial averages (simple mean of first `period` changes) ───
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i] as number;
    avgLoss += losses[i] as number;
  }
  avgGain /= period;
  avgLoss /= period;

  // ── Step 3: apply Wilder's recursive smoothing for remaining changes ─────────
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * smooth + (gains[i] as number)) / period;
    avgLoss = (avgLoss * smooth + (losses[i] as number)) / period;
  }

  return rsiFromAverages(avgGain, avgLoss);
}

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
export function buildRsiState(
  closes: readonly number[],
  period = 14,
): RsiState | null {
  assertValidPeriod(period);
  assertValidCloses(closes);

  if (closes.length < period + 1) return null;

  const smooth = period - 1;

  // Compute changes
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const delta = (closes[i] as number) - (closes[i - 1] as number);
    gains.push(delta > 0 ? delta : 0);
    losses.push(delta < 0 ? -delta : 0);
  }

  // Seed averages
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i] as number;
    avgLoss += losses[i] as number;
  }
  avgGain /= period;
  avgLoss /= period;

  // Smooth remaining
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * smooth + (gains[i] as number)) / period;
    avgLoss = (avgLoss * smooth + (losses[i] as number)) / period;
  }

  return {
    avgGain,
    avgLoss,
    prevClose: closes[closes.length - 1] as number,
    period,
  };
}

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
export function commitCandle(state: RsiState, newClose: number): RsiState {
  if (!Number.isFinite(newClose) || newClose <= 0) {
    throw new Error(
      `Invalid candle close: ${newClose}. Must be a finite positive number.`,
    );
  }

  const smooth = state.period - 1;
  const delta = newClose - state.prevClose;
  const gain = delta > 0 ? delta : 0;
  const loss = delta < 0 ? -delta : 0;

  return {
    avgGain: (state.avgGain * smooth + gain) / state.period,
    avgLoss: (state.avgLoss * smooth + loss) / state.period,
    prevClose: newClose,
    period: state.period,
  };
}

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
export function calculateProvisionalRsi(
  state: RsiState,
  currentPrice: number,
): number {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error(
      `Invalid live price: ${currentPrice}. Must be a finite positive number.`,
    );
  }

  const smooth = state.period - 1;
  const delta = currentPrice - state.prevClose;
  const gain = delta > 0 ? delta : 0;
  const loss = delta < 0 ? -delta : 0;

  // Apply one Wilder smoothing step without touching state
  const provAvgGain = (state.avgGain * smooth + gain) / state.period;
  const provAvgLoss = (state.avgLoss * smooth + loss) / state.period;

  return rsiFromAverages(provAvgGain, provAvgLoss);
}

