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
import { startBroadcaster, stopBroadcaster } from './broadcaster.js';
import { initLifecycle, startPipeline, stopPipeline } from './lifecycle.js';

async function main(): Promise<void> {
  console.log('=== Crypto Scanner Backend ===');
  console.log(
    `Config: port=${config.port}, seedLimit=${config.seedCoinLimit}, candles=${config.seedCandleCount}, onDemand=${config.onDemand}, grace=${config.idleGraceSeconds}s`
  );

  // Step 1 — Fetch eligible universe (uses fast pre-bundled fallback if cloud REST is blocked)
  const eligible = await fetchEligibleSymbols();

  // Step 2 — Rank by volume; select top N for seeding
  const topSymbols = await fetchTopSymbolsByVolume(eligible, config.seedCoinLimit);

  // Step 3 — Initialise ALL eligible symbols in cache (ready for live tickers)
  for (const symbol of eligible) {
    initCacheEntry(symbol);
  }
  console.log(`[main] Cache initialised for ${eligible.size} eligible symbols`);

  // Step 4 — Initialize demand-driven lifecycle with top symbols
  initLifecycle(topSymbols);

  // Step 5 — Start broadcast server (HTTP & WebSocket listening on port)
  startBroadcaster();

  // Step 6 — Market pipeline activation
  if (!config.onDemand) {
    console.log('[main] ON_DEMAND=false — starting market pipeline immediately (24/7 continuous)');
    startPipeline();
  } else {
    console.log(
      `[main] ON_DEMAND=true — market pipeline will start on first frontend connection and sleep after ${config.idleGraceSeconds}s of inactivity (preserves Railway credits)`
    );
  }

  // Graceful shutdown handling
  const shutdown = async () => {
    console.log('\n[main] Shutting down…');
    stopPipeline();
    await stopBroadcaster();
    console.log('[main] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  console.error('[main] Fatal startup error:', err);
  process.exit(1);
});

