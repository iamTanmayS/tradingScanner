/**
 * lifecycle.ts — Demand-driven market pipeline lifecycle manager.
 *
 * Coordinates:
 *   - Upstream Binance WebSocket ingestion (start/stop)
 *   - Background indicator seeding (triggered on first client connection)
 *   - Hourly candle maintenance (start/stop)
 *   - Broadcast tick loop (start/stop)
 *
 * When the frontend is not in use:
 *   After the last client disconnects, a grace period timer starts (default 60s).
 *   If no client reconnects, all upstream network sockets and timers are shut down.
 *   This allows Railway Serverless App-Sleeping to scale down to 0 replicas,
 *   preserving free tier credits ($0/month while idle).
 *
 * When a user opens the frontend:
 *   The WebSocket connection wakes Railway and triggers `handleClientConnect`,
 *   which immediately resumes the Binance stream and sends live data.
 */
/**
 * Initialize the demand-driven lifecycle with the top symbols to seed.
 * Hooks into broadcaster connection events.
 */
export declare function initLifecycle(topSymbols: string[]): void;
/** Check if the market pipeline is currently running. */
export declare function isPipelineActive(): boolean;
/**
 * Start all upstream ingestion and periodic tasks.
 */
export declare function startPipeline(): void;
/**
 * Stop all upstream ingestion and timers so Node.js can idle completely.
 */
export declare function stopPipeline(): void;
