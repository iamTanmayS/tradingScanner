/**
 * klinesProxy.ts — Backend proxy endpoint for Binance klines.
 *
 * Provides a fallback REST endpoint for frontend chart candle requests
 * when direct client-side requests to Binance fail due to CORS, ad-blockers,
 * or rate limiting.
 *
 * Endpoint: GET /api/klines?symbol=BTCUSDT&interval=1h&limit=200
 */
const BINANCE_PRIMARY_REST = 'https://data-api.binance.vision/api/v3/klines';
const BINANCE_SECONDARY_REST = 'https://api.binance.com/api/v3/klines';
const ALLOWED_INTERVALS = new Set([
    '1m', '3m', '5m', '15m', '30m',
    '1h', '2h', '4h', '6h', '8h', '12h',
    '1d', '3d', '1w', '1M',
]);
const SYMBOL_REGEX = /^[A-Z0-9]{3,20}$/;
/**
 * Handle incoming HTTP request for /api/klines.
 */
export async function handleKlinesProxy(url, _req, res) {
    const symbol = (url.searchParams.get('symbol') ?? '').toUpperCase().trim();
    const interval = (url.searchParams.get('interval') ?? '1h').trim();
    const limitStr = url.searchParams.get('limit') ?? '200';
    // Validation
    if (!symbol || !SYMBOL_REGEX.test(symbol)) {
        res.writeHead(400, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ error: 'Invalid or missing symbol parameter' }));
        return;
    }
    if (!ALLOWED_INTERVALS.has(interval)) {
        res.writeHead(400, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ error: `Invalid interval. Allowed: ${Array.from(ALLOWED_INTERVALS).join(', ')}` }));
        return;
    }
    let limit = 200;
    if (url.searchParams.has('limit')) {
        const parsed = parseInt(limitStr, 10);
        if (Number.isNaN(parsed) || parsed < 1 || parsed > 1000 || String(parsed) !== limitStr) {
            res.writeHead(400, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            });
            res.end(JSON.stringify({ error: 'Invalid limit parameter. Must be an integer between 1 and 1000.' }));
            return;
        }
        limit = parsed;
    }
    // Fetch from Binance
    try {
        const data = await fetchKlinesFromBinance(symbol, interval, limit);
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=5',
        });
        res.end(JSON.stringify(data));
    }
    catch (err) {
        console.warn(`[klinesProxy] Failed to fetch klines for ${symbol}: ${String(err)}`);
        const status = err.message.includes('429') ? 429 : 502;
        res.writeHead(status, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({
            error: status === 429 ? 'Upstream Binance rate limited (429)' : 'Failed to fetch klines from upstream Binance',
            details: String(err),
        }));
    }
}
/**
 * Fetch klines from Binance primary vision endpoint, falling back to secondary if needed.
 */
async function fetchKlinesFromBinance(symbol, interval, limit) {
    const query = `symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
    try {
        const res = await fetch(`${BINANCE_PRIMARY_REST}?${query}`, {
            signal: AbortSignal.timeout(8000),
            headers: { 'User-Agent': 'crypto-scanner-proxy/1.0' },
        });
        if (res.ok) {
            return (await res.json());
        }
        if (res.status === 429) {
            throw new Error('HTTP 429 Too Many Requests');
        }
    }
    catch (err) {
        if (err.message.includes('429'))
            throw err;
        // Primary failed, proceed to fallback
    }
    // Secondary fallback
    const fallbackRes = await fetch(`${BINANCE_SECONDARY_REST}?${query}`, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'crypto-scanner-proxy/1.0' },
    });
    if (!fallbackRes.ok) {
        throw new Error(`Upstream returned HTTP ${fallbackRes.status}`);
    }
    return (await fallbackRes.json());
}
