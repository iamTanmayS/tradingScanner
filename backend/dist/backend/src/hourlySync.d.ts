/**
 * hourlySync.ts — Minimal hourly candle maintenance.
 *
 * Detects when the current UTC hour has rolled over and fetches the
 * freshly completed candle for all seeded symbols, committing it into
 * the indicator state.
 *
 * Approach:
 *   - A simple setInterval checks every 30 seconds whether the hour has changed.
 *   - When a new hour is detected, a paced REST fetch runs for all seeded symbols.
 *   - Each candle is committed idempotently (commitNewCandle deduplicates by openTime).
 *
 * Known limitation (documented, not hidden):
 *   The hourly sync updates seeded coins only. Coins that failed initial seeding
 *   will not receive hourly updates unless re-seeded. This is acceptable for
 *   a demo where the top 50 coins by volume are the primary focus.
 */
/**
 * Start the hourly sync timer.
 * Checks every 30 seconds whether the UTC hour has rolled over.
 */
export declare function startHourlySync(): void;
/** Stop the hourly sync timer. */
export declare function stopHourlySync(): void;
