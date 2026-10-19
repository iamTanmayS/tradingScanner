/**
 * config.ts — Backend configuration from environment variables.
 *
 * All runtime settings are read once at startup.
 * Defaults are chosen for a safe local demo.
 */
export declare const config: {
    /** Port the backend WebSocket server listens on */
    port: number;
    /**
     * Top N coins by 24h volume to seed indicators for.
     * Default: 0 (seed all eligible coins, ranked by volume).
     * Set SEED_COIN_LIMIT > 0 to restrict to top N.
     */
    seedCoinLimit: number;
    /** Max simultaneous klines HTTP requests during seeding (conservative to protect rate limits) */
    seedConcurrency: number;
    /** Number of 1h candles to fetch per coin (minimum 21 for all indicators) */
    seedCandleCount: number;
    /** Binance REST API base URL (data-api.binance.vision does not block cloud hosting IPs) */
    binanceRestUrl: string;
    /** Binance WebSocket stream URL */
    binanceWsUrl: string;
    /**
     * If true, upstream Binance WebSocket, indicator seeding, and timers
     * only run while at least one frontend WebSocket client is connected.
     * Shuts down automatically when all clients disconnect to allow Railway
     * Serverless to sleep the container (saving free credits).
     * Default: true. Set ON_DEMAND=false to run 24/7.
     */
    onDemand: boolean;
    /**
     * Grace period in seconds before stopping upstream streams after the last client disconnects.
     * Prevents stream restarts on page refresh or temporary tab switches.
     * Default: 60 seconds.
     */
    idleGraceSeconds: number;
};
