/**
 * cache.ts — In-memory market data cache.
 *
 * Maintains one MarketCoin entry per eligible symbol.
 * The cache is the single source of truth for the broadcast snapshot.
 *
 * Design principles:
 *   - The cache model (MarketCoin) is separate from the frontend DTO.
 *     The broadcaster converts cache entries to MarketCoinDTO before sending.
 *   - Partial miniTicker updates are MERGED, never replace the full map.
 *   - Indicator fields are stored here and updated by the indicator layer.
 *   - Invalid prices never overwrite valid ones.
 */
import type { RsiState } from '../../shared/src/rsi.js';
/**
 * Internal cache model — richer than MarketCoinDTO.
 * Fields prefixed with _ are internal state not forwarded to the frontend.
 */
export interface MarketCoin {
    symbol: string;
    price: number;
    open24h: number;
    high24h: number;
    low24h: number;
    v24: number;
    change24h: number;
    rsi14_1h: number | undefined;
    sma20_1h: number | undefined;
    volumeRatio20_1h: number | undefined;
    /** Committed Wilder RSI state from the last closed 1h candle */
    _rsiState: RsiState | undefined;
    /** Closing prices of the last 20 completed 1h candles (for SMA) */
    _closedCloses: number[];
    /** Quote volumes of the last 20 completed 1h candles (for volume ratio) */
    _closedVolumes: number[];
    /** Volume of the currently forming 1h candle (provisional) */
    _currentCandleVolume: number | undefined;
    /** Open time (ms) of the last committed 1h candle — used for dedup */
    _lastCommittedOpenTime: number;
    /** Event time (ms) of the last processed miniTicker message */
    _lastEventTime: number;
}
export declare function getCache(): ReadonlyMap<string, MarketCoin>;
export declare function getCacheEntry(symbol: string): MarketCoin | undefined;
/**
 * Initialise a cache entry for a newly discovered eligible symbol.
 * Called once during universe discovery before any ticker data arrives.
 */
export declare function initCacheEntry(symbol: string): void;
/** Raw mini-ticker entry from Binance !miniTicker@arr */
export interface MiniTickerRaw {
    s: string;
    E: number;
    o: string;
    c: string;
    h: string;
    l: string;
    v: string;
    q: string;
}
/**
 * Merge one raw miniTicker entry into the cache.
 *
 * Rules:
 *  - Symbol must already exist in the cache (eligible universe check).
 *  - All numeric fields are validated; invalid values are silently dropped.
 *  - change24h is derived from valid open/close; not trusted from the stream.
 *  - A valid incoming price never replaces an existing valid one with 0.
 */
export declare function applyTickerUpdate(raw: MiniTickerRaw): void;
/**
 * Process a full miniTicker batch (the array received in one WS message).
 * Returns the count of symbols actually updated.
 */
export declare function applyTickerBatch(batch: MiniTickerRaw[]): number;
/**
 * Returns true if the cache has at least one entry with a valid price.
 * Used to skip broadcasting before any market data has arrived.
 */
export declare function hasValidData(): boolean;
