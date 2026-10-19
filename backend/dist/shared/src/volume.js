/**
 * Volume Spike Ratio calculation.
 *
 * All functions are pure — no global state, no side effects, no I/O.
 * Input arrays are never mutated.
 *
 * Volume unit requirement (IMPORTANT):
 *   `currentVolume` and every element in `previousVolumes` MUST use the
 *   identical unit. For Binance 1-hour klines, use quote volume (USDT),
 *   which is field index [7] in the klines response array. Do NOT mix
 *   base asset volume (field [5]) with quote asset volume (field [7]).
 *
 * Provisional semantics:
 *   The current candle's volume grows during the hour and is only
 *   finalised when the candle closes. Callers should document whether
 *   the value passed as `currentVolume` is provisional or finalised.
 *
 * Zero-average convention:
 *   If the average of the 20 preceding candle volumes is exactly zero
 *   (e.g. a newly listed coin with no prior hourly activity), the ratio
 *   is mathematically undefined. This function returns null in that case.
 */
// ─── Internal helpers ─────────────────────────────────────────────────────────
/**
 * Validate that a volume value is a finite non-negative number.
 * Volume of zero is valid (no trades occurred in that candle).
 *
 * @throws {Error} with a descriptive message if the value is invalid.
 */
function assertValidVolume(value, label) {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Invalid volume for ${label}: ${value}. ` +
            'Volume must be a finite non-negative number.');
    }
}
/**
 * Validate every element in a previousVolumes array.
 *
 * @throws {Error} if any element is non-finite or negative.
 */
function assertValidVolumes(volumes) {
    for (let i = 0; i < volumes.length; i++) {
        const v = volumes[i];
        if (v === undefined || !Number.isFinite(v) || v < 0) {
            throw new Error(`Invalid volume in previousVolumes at index ${i}: ${v}. ` +
                'All volumes must be finite non-negative numbers.');
        }
    }
}
// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Calculate the volume spike ratio for the current hourly candle.
 *
 * Formula:
 *   averagePrev20 = mean(previousVolumes[last 20])
 *   volumeRatio   = currentVolume / averagePrev20
 *
 * A ratio of 1.0 means the current candle matches the recent average.
 * A ratio of 2.5 means the current candle is accumulating 2.5× the norm.
 *
 * Volume unit note:
 *   currentVolume and all values in previousVolumes must use the same
 *   unit (e.g. USDT quote volume from Binance klines field [7]).
 *   The current candle volume is provisional until the hour closes.
 *
 * @param currentVolume    - Volume of the current (possibly open) candle.
 * @param previousVolumes  - Completed prior candle volumes, chronological.
 *                           Only the last 20 are used even if more are supplied.
 * @returns Ratio ≥ 0, or null when:
 *          - fewer than 20 previous candles exist, OR
 *          - the 20-candle average baseline is exactly zero.
 * @throws {Error} for invalid (non-finite or negative) volume values.
 */
export function calculateVolumeRatio(currentVolume, previousVolumes) {
    assertValidVolume(currentVolume, 'currentVolume');
    assertValidVolumes(previousVolumes);
    if (previousVolumes.length < 20)
        return null;
    // Use only the 20 most recent completed candles
    const start = previousVolumes.length - 20;
    let sum = 0;
    for (let i = start; i < previousVolumes.length; i++) {
        sum += previousVolumes[i];
    }
    const average = sum / 20;
    // Zero average means no prior hourly activity — ratio is undefined
    if (average === 0)
        return null;
    return currentVolume / average;
}
