/**
 * index.ts — Backend entry point.
 *
 * Startup sequence:
 *   1. Fetch exchange metadata and build the eligible symbol universe.
 *   2. Rank by 24h quote volume; select top N for indicator seeding.
 *   3. Initialise all eligible symbols in the cache.
 *   4. Start the downstream WebSocket broadcast server.
 *   5. Connect to the Binance !miniTicker@arr stream.
 *   6. Seed indicators for the top N coins (paced, background).
 *   7. Start the hourly candle maintenance timer.
 *
 * The broadcast server starts BEFORE seeding completes so the frontend
 * receives live prices immediately. Indicator fields are simply undefined
 * until seeding finishes — this is correct and expected behaviour.
 */
import { fetchEligibleSymbols, fetchTopSymbolsByVolume } from './universe.js';
import { config } from './config.js';
import { initCacheEntry } from './cache.js';
import { seedIndicators } from './indicators.js';
import { startBinanceStream } from './binanceWs.js';
import { startBroadcaster } from './broadcaster.js';
import { startHourlySync } from './hourlySync.js';
async function main() {
    console.log('=== Crypto Scanner Backend ===');
    console.log(`Config: port=${config.port}, seedLimit=${config.seedCoinLimit}, candles=${config.seedCandleCount}`);
    // Step 1 — Fetch eligible universe
    const eligible = await fetchEligibleSymbols();
    // Step 2 — Rank by volume; select top N for seeding
    const topSymbols = await fetchTopSymbolsByVolume(eligible, config.seedCoinLimit);
    // Step 3 — Initialise ALL eligible symbols in cache (they get live prices)
    for (const symbol of eligible) {
        initCacheEntry(symbol);
    }
    console.log(`[main] Cache initialised for ${eligible.size} eligible symbols`);
    // Step 4 — Start broadcast server (starts serving immediately)
    startBroadcaster();
    // Step 5 — Connect to Binance live stream
    startBinanceStream();
    // Step 6 — Seed indicators for top coins in background (does not block)
    seedIndicators(topSymbols).catch((err) => {
        console.error(`[main] Indicator seeding failed: ${String(err)}`);
    });
    // Step 7 — Start hourly candle maintenance
    startHourlySync();
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n[main] Shutting down…');
        const { stopBinanceStream } = await import('./binanceWs.js');
        const { stopBroadcaster } = await import('./broadcaster.js');
        const { stopHourlySync } = await import('./hourlySync.js');
        stopBinanceStream();
        stopHourlySync();
        await stopBroadcaster();
        console.log('[main] Shutdown complete');
        process.exit(0);
    });
}
main().catch((err) => {
    console.error('[main] Fatal startup error:', err);
    process.exit(1);
});
