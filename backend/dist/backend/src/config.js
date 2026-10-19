/**
 * config.ts — Backend configuration from environment variables.
 *
 * All runtime settings are read once at startup.
 * Defaults are chosen for a safe local demo.
 */
function getEnvInt(key, defaultValue) {
    const raw = process.env[key];
    if (raw === undefined)
        return defaultValue;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}
function getEnvStr(key, defaultValue) {
    return process.env[key] ?? defaultValue;
}
export const config = {
    /** Port the backend WebSocket server listens on */
    port: getEnvInt('PORT', 4000),
    /**
     * Top N coins by 24h volume to seed indicators for.
     * Default: 0 (seed all eligible coins, ranked by volume).
     * Set SEED_COIN_LIMIT > 0 to restrict to top N.
     */
    seedCoinLimit: getEnvInt('SEED_COIN_LIMIT', 0),
    /** Max simultaneous klines HTTP requests during seeding (conservative to protect rate limits) */
    seedConcurrency: getEnvInt('SEED_CONCURRENCY', 2),
    /** Number of 1h candles to fetch per coin (minimum 21 for all indicators) */
    seedCandleCount: Math.max(getEnvInt('SEED_CANDLE_COUNT', 30), 21),
    /** Binance REST API base URL */
    binanceRestUrl: getEnvStr('BINANCE_REST_URL', 'https://api.binance.com'),
    /** Binance WebSocket stream URL */
    binanceWsUrl: getEnvStr('BINANCE_WS_URL', 'wss://stream.binance.com:9443/ws/!miniTicker@arr'),
};
