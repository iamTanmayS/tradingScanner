/**
 * universe.ts — Exchange metadata and universe filtering.
 *
 * Responsibilities:
 *   1. Fetch /api/v3/exchangeInfo and extract active USDT trading pairs.
 *   2. Apply a stablecoin exclusion list to the base assets.
 *   3. Fetch 24h ticker stats and rank eligible symbols by quote volume.
 *   4. Return the top N symbols for indicator seeding.
 *
 * The filtering logic is kept as pure functions so it can be unit tested
 * without making real HTTP requests.
 */
import { config } from './config.js';
// ─── Stablecoin exclusion list ────────────────────────────────────────────────
/**
 * Base assets that must be excluded from the trading universe.
 * These are stablecoins (pegged to USD or EUR) and synthetic USD tokens.
 * Symbols whose base asset is in this set are filtered out even if they
 * technically end in USDT and are actively trading.
 */
export const STABLECOIN_BASE_ASSETS = new Set([
    'USDC', 'FDUSD', 'TUSD', 'BUSD', 'USDP', 'DAI',
    'EUR', 'AEUR', 'USDS', 'USD1', 'PYUSD', 'USDE', 'XUSD',
    'FRAX', 'USTC', 'USDD', 'USDJ', 'SUSD', 'MUSD',
]);
// ─── Pure filtering function ──────────────────────────────────────────────────
/**
 * Filter a raw exchangeInfo symbol list down to eligible trading pairs.
 *
 * Inclusion criteria:
 *   - status === "TRADING"
 *   - quoteAsset === "USDT"
 *
 * Exclusion criteria:
 *   - baseAsset is in STABLECOIN_BASE_ASSETS
 *
 * The function is pure and does not make network requests, making it
 * straightforward to unit test with synthetic input data.
 *
 * @param symbols - Raw symbol objects from /api/v3/exchangeInfo
 * @returns Set of eligible trading pair symbol strings (e.g. "BTCUSDT")
 */
export function filterEligibleSymbols(symbols) {
    const eligible = new Set();
    for (const sym of symbols) {
        if (sym.status === 'TRADING' &&
            sym.quoteAsset === 'USDT' &&
            !STABLECOIN_BASE_ASSETS.has(sym.baseAsset)) {
            eligible.add(sym.symbol);
        }
    }
    return eligible;
}
/**
 * Rank eligible symbols by 24h quote volume (highest first) and
 * return only the top `limit` symbols.
 *
 * Tickers for symbols not in the eligible set are ignored.
 *
 * @param tickers  - Raw 24hr ticker array from Binance
 * @param eligible - Set of eligible symbol strings
 * @param limit    - Maximum number of symbols to return
 * @returns Ordered array of top-N symbol strings
 */
export function rankByVolume(tickers, eligible, limit) {
    const ranked = tickers
        .filter((t) => eligible.has(t.symbol))
        .map((t) => ({ symbol: t.symbol, vol: parseFloat(t.quoteVolume) }))
        .filter((t) => Number.isFinite(t.vol))
        .sort((a, b) => b.vol - a.vol)
        .map((t) => t.symbol);
    return limit > 0 ? ranked.slice(0, limit) : ranked;
}
// ─── Network functions ────────────────────────────────────────────────────────
/**
 * Fetch JSON from Binance with host fallback and browser-like User-Agent.
 * Prevents cloud datacenter IP blocks (HTTP 418 / 451) on Render, AWS, and GCP.
 */
async function fetchBinanceJson(apiPath) {
    const hosts = [
        config.binanceRestUrl,
        'https://data-api.binance.vision',
        'https://api1.binance.com',
        'https://api2.binance.com',
        'https://api3.binance.com',
        'https://api.binance.com',
    ];
    const uniqueHosts = Array.from(new Set(hosts));
    let lastError = null;
    for (const host of uniqueHosts) {
        const url = `${host}${apiPath}`;
        try {
            const res = await fetch(url, {
                signal: AbortSignal.timeout(10000),
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                },
            });
            if (res.ok) {
                return (await res.json());
            }
            lastError = new Error(`${url} failed: HTTP ${res.status}`);
            console.warn(`[universe] ${url} returned HTTP ${res.status} — trying next host...`);
        }
        catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            console.warn(`[universe] ${url} error: ${lastError.message} — trying next host...`);
        }
    }
    throw lastError ?? new Error(`All Binance hosts failed for ${apiPath}`);
}
/**
 * Fetch eligible symbols from Binance exchange metadata.
 *
 * @throws {Error} if the HTTP request fails or the response is malformed.
 */
export async function fetchEligibleSymbols() {
    console.log(`[universe] Fetching exchange info`);
    const data = await fetchBinanceJson('/api/v3/exchangeInfo');
    if (!Array.isArray(data.symbols)) {
        throw new Error('exchangeInfo response missing "symbols" array');
    }
    const eligible = filterEligibleSymbols(data.symbols);
    console.log(`[universe] ${eligible.size} eligible USDT pairs after filtering`);
    return eligible;
}
/**
 * Fetch 24h ticker stats and return the top N eligible symbols by quote volume.
 *
 * @param eligible - Set of eligible symbols from fetchEligibleSymbols()
 * @param limit    - Maximum number of symbols to select (0 = all eligible)
 * @throws {Error} if the HTTP request fails.
 */
export async function fetchTopSymbolsByVolume(eligible, limit) {
    console.log(`[universe] Fetching 24h tickers to rank by volume`);
    const tickers = await fetchBinanceJson('/api/v3/ticker/24hr');
    if (!Array.isArray(tickers)) {
        throw new Error('ticker/24hr response is not an array');
    }
    const top = rankByVolume(tickers, eligible, limit);
    // If seeding all (limit <= 0), append any eligible symbols that didn't have 24h ticker records
    if (limit <= 0) {
        const seen = new Set(top);
        for (const sym of eligible) {
            if (!seen.has(sym)) {
                top.push(sym);
                seen.add(sym);
            }
        }
    }
    console.log(`[universe] Selected ${top.length} coins for indicator seeding (top by volume)`);
    return top;
}
