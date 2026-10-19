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

import { getCacheEntry, getCache } from './cache.js';
import { commitNewCandle, parseCompletedKlines, type RawKline } from './indicators.js';
import { config } from './config.js';

// ─── State ────────────────────────────────────────────────────────────────────

let lastSyncHour = -1; // UTC hour of last sync
let syncTimer: ReturnType<typeof setInterval> | null = null;

// ─── Single-symbol candle fetch ───────────────────────────────────────────────

/**
 * Fetch the most recent 2 closed 1h candles for a symbol and commit
 * any candles newer than the last committed openTime.
 *
 * We fetch 2 candles because the most recent Binance kline may be the
 * currently forming one — we need the second-to-last (or later) as the
 * newly closed one.
 */
async function syncSymbol(symbol: string): Promise<void> {
  const entry = getCacheEntry(symbol);
  if (!entry) return;

  const url =
    `${config.binanceRestUrl}/api/v3/klines` +
    `?symbol=${symbol}&interval=1h&limit=3`;

  let rawKlines: RawKline[];
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[hourlySync] ${symbol}: HTTP ${res.status} — skipping`);
      return;
    }
    rawKlines = (await res.json()) as RawKline[];
  } catch (err) {
    console.warn(`[hourlySync] ${symbol}: fetch error — ${String(err)}`);
    return;
  }

  const now = Date.now();
  const completed = parseCompletedKlines(rawKlines, now);

  for (const candle of completed) {
    commitNewCandle(symbol, candle);
  }
}

// ─── Hourly sync batch ────────────────────────────────────────────────────────

/**
 * Run a paced hourly sync for all symbols that have been seeded
 * (i.e. have a committed RSI state or at least some closed candles).
 */
async function runHourlySync(): Promise<void> {
  const seededSymbols: string[] = [];
  const unseededSymbols: string[] = [];

  for (const [symbol, entry] of getCache().entries()) {
    if (entry._rsiState || entry._closedCloses.length > 0) {
      seededSymbols.push(symbol);
    } else {
      unseededSymbols.push(symbol);
    }
  }

  if (seededSymbols.length > 0) {
    console.log(`[hourlySync] Syncing ${seededSymbols.length} seeded symbols`);

    let index = 0;
    async function worker(): Promise<void> {
      while (true) {
        const i = index++;
        if (i >= seededSymbols.length) break;
        const sym = seededSymbols[i];
        if (!sym) break;
        await syncSymbol(sym);
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    const workers = Array.from({ length: config.seedConcurrency }, () => worker());
    await Promise.all(workers);
    console.log(`[hourlySync] Seeded symbols sync complete`);
  }

  // Attempt to initialize any previously unseeded symbols
  if (unseededSymbols.length > 0) {
    console.log(`[hourlySync] Attempting to seed ${unseededSymbols.length} unseeded symbols`);
    const { seedSymbol } = await import('./indicators.js');
    let uIndex = 0;
    async function unseededWorker(): Promise<void> {
      while (true) {
        const i = uIndex++;
        if (i >= unseededSymbols.length) break;
        const sym = unseededSymbols[i];
        if (!sym) break;
        await seedSymbol(sym);
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const uWorkers = Array.from({ length: Math.min(3, config.seedConcurrency) }, () => unseededWorker());
    await Promise.all(uWorkers);
    console.log(`[hourlySync] Unseeded symbols processing complete`);
  }
}

// ─── Timer ────────────────────────────────────────────────────────────────────

/**
 * Start the hourly sync timer.
 * Checks every 30 seconds whether the UTC hour has rolled over.
 */
export function startHourlySync(): void {
  lastSyncHour = new Date().getUTCHours();

  syncTimer = setInterval(() => {
    const currentHour = new Date().getUTCHours();
    if (currentHour !== lastSyncHour) {
      lastSyncHour = currentHour;
      console.log(`[hourlySync] New UTC hour detected (${currentHour}:00) — triggering candle sync`);
      runHourlySync().catch((err: unknown) => {
        console.error(`[hourlySync] Sync error: ${String(err)}`);
      });
    }
  }, 30_000);
}

/** Stop the hourly sync timer. */
export function stopHourlySync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

