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
import { buildRsiState, commitCandle, calculateProvisionalRsi, calculateSMA, calculateVolumeRatio, } from '../../shared/src/index.js';
import { getCacheEntry, getCache } from './cache.js';
import { config } from './config.js';
/**
 * Parse a raw Binance kline array into a typed ParsedCandle.
 * Returns null if any required field is invalid.
 */
export function parseKline(raw) {
    const openTime = raw[0];
    const close = parseFloat(raw[4]);
    const closeTime = raw[6];
    const quoteVolume = parseFloat(raw[7]);
    if (!Number.isFinite(openTime) ||
        !Number.isFinite(close) || close <= 0 ||
        !Number.isFinite(closeTime) ||
        !Number.isFinite(quoteVolume) || quoteVolume < 0) {
        return null;
    }
    return { openTime, closeTime, close, quoteVolume };
}
/**
 * Parse an array of raw klines and filter to completed candles only.
 * A candle is completed when closeTime < now.
 */
export function parseCompletedKlines(rawKlines, now = Date.now()) {
    const result = [];
    for (const raw of rawKlines) {
        const parsed = parseKline(raw);
        if (parsed && parsed.closeTime < now) {
            result.push(parsed);
        }
    }
    return result;
}
// ─── Per-symbol seeding ───────────────────────────────────────────────────────
/**
 * Fetch completed 1h klines for one symbol and seed all indicators.
 *
 * On success, the cache entry for `symbol` will have:
 *   - _rsiState set (if >= 15 completed candles)
 *   - _closedCloses set (last 20 closes for SMA)
 *   - _closedVolumes set (last 20 volumes for volume ratio)
 *   - rsi14_1h, sma20_1h, volumeRatio20_1h set where data permits
 *   - _currentCandleVolume set to the last (forming) candle's quote volume
 *   - _lastCommittedOpenTime set for dedup
 *
 * On failure, logs the error and leaves the cache entry unchanged.
 */
/**
 * Fetch klines with automatic endpoint fallback, rate-limit header tracking, and retry.
 */
async function fetchKlinesWithRetry(symbol, maxAttempts = 2) {
    const query = `symbol=${encodeURIComponent(symbol)}&interval=1h&limit=${config.seedCandleCount}`;
    const endpoints = [
        `${config.binanceRestUrl}/api/v3/klines?${query}`,
        `https://data-api.binance.vision/api/v3/klines?${query}`,
    ];
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        for (const url of endpoints) {
            try {
                const res = await fetch(url, {
                    signal: AbortSignal.timeout(8000),
                    headers: { 'User-Agent': 'crypto-scanner-seeder/1.0' },
                });
                // Track Binance rate limit weight header (1200 weight/min ceiling; klines = 2 weight)
                const weightHeader = res.headers?.get?.('x-mbx-used-weight-1m');
                if (weightHeader) {
                    const usedWeight = parseInt(weightHeader, 10);
                    if (Number.isFinite(usedWeight) && usedWeight >= 800) {
                        console.warn(`[seeder] Rate limit weight elevated (${usedWeight}/1200) — pausing 2s to allow decay`);
                        await new Promise((r) => setTimeout(r, 2000));
                    }
                }
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data))
                        return data;
                }
                if (res.status === 429) {
                    const retryAfter = parseInt(res.headers?.get?.('Retry-After') || '3', 10);
                    const backoffMs = Math.max(2500, (Number.isFinite(retryAfter) ? retryAfter : 3) * 1000);
                    console.warn(`[seeder] HTTP 429 rate limit received for ${symbol} — backing off for ${backoffMs}ms`);
                    await new Promise((r) => setTimeout(r, backoffMs));
                }
            }
            catch {
                // try next endpoint
            }
        }
        if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 300 * attempt));
        }
    }
    return null;
}
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
export async function seedSymbol(symbol) {
    const entry = getCacheEntry(symbol);
    if (!entry)
        return false;
    // Skip if already seeded with historical candles
    if (entry._lastCommittedOpenTime > 0) {
        return true;
    }
    const rawKlines = await fetchKlinesWithRetry(symbol);
    if (!rawKlines || rawKlines.length === 0) {
        return false;
    }
    const now = Date.now();
    const completedCandles = parseCompletedKlines(rawKlines, now);
    if (completedCandles.length === 0) {
        return false;
    }
    // Extract close prices and quote volumes (USDT field [7]) from completed candles
    const closes = completedCandles.map((c) => c.close);
    const volumes = completedCandles.map((c) => c.quoteVolume);
    // Store rolling windows (up to 20 candles) so hourly sync can accumulate history
    entry._closedCloses = closes.slice(-20);
    entry._closedVolumes = volumes.slice(-20);
    // ── 1. Seed RSI state (requires >= 15 completed closes) ─────────────────────
    const rsiState = buildRsiState(closes);
    entry._rsiState = rsiState ?? undefined;
    if (entry._rsiState) {
        entry.rsi14_1h = calculateProvisionalRsi(entry._rsiState, entry.price > 0 ? entry.price : entry._rsiState.prevClose);
    }
    else {
        entry.rsi14_1h = undefined;
    }
    // ── 2. Seed SMA-20 (requires >= 20 completed closes) ────────────────────────
    const sma = calculateSMA(closes);
    entry.sma20_1h = sma ?? undefined;
    // ── 3. Seed Volume Ratio (requires >= 21 completed candles: 20 preceding + 1 latest) ──
    if (completedCandles.length >= 21) {
        const latestCompleted = completedCandles[completedCandles.length - 1];
        const preceding20 = completedCandles.slice(-21, -1).map((c) => c.quoteVolume);
        const vr = calculateVolumeRatio(latestCompleted.quoteVolume, preceding20);
        entry.volumeRatio20_1h = vr ?? undefined;
    }
    else {
        entry.volumeRatio20_1h = undefined;
    }
    // Track the last committed candle openTime for dedup in hourly sync
    const lastCompleted = completedCandles[completedCandles.length - 1];
    if (lastCompleted) {
        entry._lastCommittedOpenTime = lastCompleted.openTime;
    }
    return true;
}
// ─── Prioritised seeding with concurrency limit ───────────────────────────────
/**
 * Seed indicators for `symbols` with a controlled concurrency limit.
 *
 * The top coins are seeded first (index 0 = highest volume).
 * Unseeded symbols can be safely retried.
 */
export async function seedIndicators(symbols) {
    console.log(`[seeder] Starting indicator seeding for ${symbols.length} coins ` +
        `(concurrency=${config.seedConcurrency}, candles=${config.seedCandleCount})`);
    let index = 0;
    let seeded = 0;
    const failedSymbols = [];
    async function worker() {
        while (true) {
            const i = index++;
            if (i >= symbols.length)
                break;
            const sym = symbols[i];
            if (!sym)
                break;
            const ok = await seedSymbol(sym);
            if (ok) {
                seeded++;
            }
            else {
                failedSymbols.push(sym);
            }
            // Pacing delay to stay well under Binance rate limits (120ms between requests)
            await new Promise((r) => setTimeout(r, 120));
        }
    }
    // Launch cooperative workers
    const workers = Array.from({ length: config.seedConcurrency }, () => worker());
    await Promise.all(workers);
    console.log(`[seeder] Pass 1 complete: ${seeded}/${symbols.length} seeded, ${failedSymbols.length} failed`);
    // Retry pass for failed symbols
    if (failedSymbols.length > 0) {
        console.log(`[seeder] Retrying ${failedSymbols.length} failed symbols...`);
        await new Promise((r) => setTimeout(r, 2000));
        let retryIdx = 0;
        async function retryWorker() {
            while (true) {
                const i = retryIdx++;
                if (i >= failedSymbols.length)
                    break;
                const sym = failedSymbols[i];
                if (!sym)
                    break;
                const ok = await seedSymbol(sym);
                if (ok)
                    seeded++;
                await new Promise((r) => setTimeout(r, 200));
            }
        }
        const retryWorkers = Array.from({ length: Math.min(3, config.seedConcurrency) }, () => retryWorker());
        await Promise.all(retryWorkers);
        console.log(`[seeder] Indicator seeding complete: ${seeded}/${symbols.length} symbols processed`);
    }
}
// ─── Live tick: provisional RSI update ───────────────────────────────────────
/**
 * Apply a live price tick to update provisional indicators.
 *
 * Only provisional RSI is updated here (O(1), no state mutation).
 * SMA and volume ratio are updated on hourly candle close only.
 *
 * Call this AFTER applyTickerUpdate() has set entry.price.
 */
export function applyLiveIndicatorTick(symbol) {
    const entry = getCacheEntry(symbol);
    if (!entry || !entry._rsiState || entry.price <= 0)
        return;
    try {
        entry.rsi14_1h = calculateProvisionalRsi(entry._rsiState, entry.price);
    }
    catch {
        // Price or state invalid — leave existing RSI value unchanged
    }
}
/**
 * Apply live indicator ticks for ALL seeded symbols in the cache.
 * Called once per miniTicker batch after merging ticker updates.
 */
export function applyAllLiveTicks() {
    for (const symbol of getCache().keys()) {
        applyLiveIndicatorTick(symbol);
    }
}
// ─── Hourly candle commit ─────────────────────────────────────────────────────
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
export function commitNewCandle(symbol, candle) {
    const entry = getCacheEntry(symbol);
    if (!entry)
        return;
    // Dedup: don't commit the same candle twice
    if (candle.openTime <= entry._lastCommittedOpenTime)
        return;
    // ── Advance RSI state ───────────────────────────────────────────────────────
    if (entry._rsiState) {
        entry._rsiState = commitCandle(entry._rsiState, candle.close);
    }
    else {
        // Not yet seeded — build from scratch if we have enough data
        const allCloses = [...entry._closedCloses, candle.close];
        const state = buildRsiState(allCloses);
        entry._rsiState = state ?? undefined;
    }
    // ── Update closed price / volume history (rolling 20-candle window) ─────────
    entry._closedCloses.push(candle.close);
    if (entry._closedCloses.length > 20)
        entry._closedCloses.shift();
    // ── Recalculate Volume Ratio: newly completed candle vs preceding 20 completed candles ──
    if (entry._closedVolumes.length >= 20) {
        const vr = calculateVolumeRatio(candle.quoteVolume, entry._closedVolumes);
        entry.volumeRatio20_1h = vr ?? undefined;
    }
    entry._closedVolumes.push(candle.quoteVolume);
    if (entry._closedVolumes.length > 20)
        entry._closedVolumes.shift();
    // ── Recalculate SMA-20 ──────────────────────────────────────────────────────
    const sma = calculateSMA(entry._closedCloses);
    entry.sma20_1h = sma ?? undefined;
    // ── Update RSI with current price (or prevClose if ticker price not yet arrived) ──
    if (entry._rsiState) {
        const evalPrice = entry.price > 0 ? entry.price : entry._rsiState.prevClose;
        entry.rsi14_1h = calculateProvisionalRsi(entry._rsiState, evalPrice);
    }
    entry._lastCommittedOpenTime = candle.openTime;
}
