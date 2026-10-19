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
export {};
