/**
 * klinesProxy.ts — Backend proxy endpoint for Binance klines.
 *
 * Provides a fallback REST endpoint for frontend chart candle requests
 * when direct client-side requests to Binance fail due to CORS, ad-blockers,
 * or rate limiting.
 *
 * Endpoint: GET /api/klines?symbol=BTCUSDT&interval=1h&limit=200
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
export interface KlinesProxyQuery {
    symbol?: string;
    interval?: string;
    limit?: string;
}
/**
 * Handle incoming HTTP request for /api/klines.
 */
export declare function handleKlinesProxy(url: URL, _req: IncomingMessage, res: ServerResponse): Promise<void>;
