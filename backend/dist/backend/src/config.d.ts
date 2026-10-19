/**
 * config.ts — Backend configuration from environment variables.
 *
 * All runtime settings are read once at startup.
 * Defaults are chosen for a safe local demo.
 */
export declare const config: {
    /** Port the backend WebSocket server listens on */
    readonly port: number;
    /**
     * Top N coins by 24h volume to seed indicators for.
     * Default: 0 (seed all eligible coins, ranked by volume).
     * Set SEED_COIN_LIMIT > 0 to restrict to top N.
     */
    readonly seedCoinLimit: number;
    /** Max simultaneous klines HTTP requests during seeding (conservative to protect rate limits) */
    readonly seedConcurrency: number;
    /** Number of 1h candles to fetch per coin (minimum 21 for all indicators) */
    readonly seedCandleCount: number;
    /** Binance REST API base URL (data-api.binance.vision does not block cloud hosting IPs) */
    readonly binanceRestUrl: string;
    /** Binance WebSocket stream URL */
    readonly binanceWsUrl: string;
};
