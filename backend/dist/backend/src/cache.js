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
// ─── Cache store ─────────────────────────────────────────────────────────────
/** In-memory map keyed by symbol string (e.g. "BTCUSDT") */
const cache = new Map();
export function getCache() {
    return cache;
}
export function getCacheEntry(symbol) {
    return cache.get(symbol);
}
/**
 * Initialise a cache entry for a newly discovered eligible symbol.
 * Called once during universe discovery before any ticker data arrives.
 */
export function initCacheEntry(symbol) {
    if (cache.has(symbol))
        return;
    cache.set(symbol, {
        symbol,
        price: 0,
        open24h: 0,
        high24h: 0,
        low24h: 0,
        v24: 0,
        change24h: 0,
        rsi14_1h: undefined,
        sma20_1h: undefined,
        volumeRatio20_1h: undefined,
        _rsiState: undefined,
        _closedCloses: [],
        _closedVolumes: [],
        _currentCandleVolume: undefined,
        _lastCommittedOpenTime: 0,
        _lastEventTime: 0,
    });
}
// ─── Partial update merge ─────────────────────────────────────────────────────
/**
 * Merge one raw miniTicker entry into the cache.
 *
 * Rules:
 *  - Symbol must already exist in the cache (eligible universe check).
 *  - All numeric fields are validated; invalid values are silently dropped.
 *  - change24h is derived from valid open/close; not trusted from the stream.
 *  - A valid incoming price never replaces an existing valid one with 0.
 */
export function applyTickerUpdate(raw) {
    const entry = cache.get(raw.s);
    if (!entry)
        return; // symbol not in eligible universe — ignore
    const price = parseFloat(raw.c);
    const open = parseFloat(raw.o);
    const high = parseFloat(raw.h);
    const low = parseFloat(raw.l);
    const v24 = parseFloat(raw.q);
    const eventTime = raw.E;
    // Only accept strictly positive, finite prices
    if (Number.isFinite(price) && price > 0) {
        entry.price = price;
    }
    if (Number.isFinite(open) && open > 0) {
        entry.open24h = open;
    }
    if (Number.isFinite(high) && high > 0) {
        entry.high24h = high;
    }
    if (Number.isFinite(low) && low > 0) {
        entry.low24h = low;
    }
    if (Number.isFinite(v24) && v24 >= 0) {
        entry.v24 = v24;
    }
    // Derive change24h safely — never divide by zero
    if (entry.open24h > 0 && entry.price > 0) {
        entry.change24h = ((entry.price - entry.open24h) / entry.open24h) * 100;
    }
    if (Number.isFinite(eventTime)) {
        entry._lastEventTime = eventTime;
    }
}
/**
 * Process a full miniTicker batch (the array received in one WS message).
 * Returns the count of symbols actually updated.
 */
export function applyTickerBatch(batch) {
    let updated = 0;
    for (const item of batch) {
        const before = cache.get(item.s);
        applyTickerUpdate(item);
        if (before)
            updated++;
    }
    return updated;
}
/**
 * Returns true if the cache has at least one entry with a valid price.
 * Used to skip broadcasting before any market data has arrived.
 */
export function hasValidData() {
    for (const entry of cache.values()) {
        if (entry.price > 0)
            return true;
    }
    return false;
}
