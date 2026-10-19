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
/** Shape of a single symbol entry from /api/v3/exchangeInfo */
export interface ExchangeSymbol {
    symbol: string;
    status: string;
    baseAsset: string;
    quoteAsset: string;
}
/** Shape of a single entry from /api/v3/ticker/24hr */
export interface Ticker24h {
    symbol: string;
    quoteVolume: string;
}
/**
 * Base assets that must be excluded from the trading universe.
 * These are stablecoins (pegged to USD or EUR) and synthetic USD tokens.
 * Symbols whose base asset is in this set are filtered out even if they
 * technically end in USDT and are actively trading.
 */
export declare const STABLECOIN_BASE_ASSETS: Set<string>;
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
export declare function filterEligibleSymbols(symbols: ExchangeSymbol[]): Set<string>;
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
export declare function rankByVolume(tickers: Ticker24h[], eligible: Set<string>, limit: number): string[];
/**
 * Fetch eligible symbols from Binance exchange metadata.
 *
 * @throws {Error} if the HTTP request fails or the response is malformed.
 */
export declare function fetchEligibleSymbols(): Promise<Set<string>>;
/**
 * Fetch 24h ticker stats and return the top N eligible symbols by quote volume.
 *
 * @param eligible - Set of eligible symbols from fetchEligibleSymbols()
 * @param limit    - Maximum number of symbols to select (0 = all eligible)
 * @throws {Error} if the HTTP request fails.
 */
export declare function fetchTopSymbolsByVolume(eligible: Set<string>, limit: number): Promise<string[]>;
