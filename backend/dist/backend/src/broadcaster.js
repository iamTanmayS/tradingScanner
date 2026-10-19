/**
 * broadcaster.ts — Backend WebSocket server for frontend clients.
 *
 * Broadcasts a MarketBroadcastPayload once per second to all connected clients.
 *
 * Design decisions:
 *   - The snapshot is serialized ONCE per tick and reused for all clients.
 *     This avoids O(clients) JSON.stringify calls.
 *   - Broadcasting is skipped if the cache has no valid price data yet.
 *   - Client disconnects and send errors are handled without crashing the server.
 *   - No per-client backpressure — appropriate for a local/hosted demo.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { getCache, hasValidData } from './cache.js';
import { config } from './config.js';
const BROADCAST_INTERVAL_MS = 1_000;
let wss = null;
let broadcastTimer = null;
// ─── Snapshot assembly ────────────────────────────────────────────────────────
/**
 * Convert the current cache state into a MarketBroadcastPayload.
 *
 * Only includes coins that have a valid price (> 0).
 * Indicator fields are omitted (undefined) when not yet seeded —
 * the shared type allows them to be optional.
 */
function buildSnapshot() {
    const coins = [];
    for (const entry of getCache().values()) {
        if (entry.price <= 0)
            continue;
        const dto = {
            s: entry.symbol,
            p: entry.price,
            c24: Math.round(entry.change24h * 100) / 100, // round to 2dp
            h24: entry.high24h,
            l24: entry.low24h,
            v24: entry.v24,
        };
        // Only set indicator fields when they are available (not undefined)
        if (entry.rsi14_1h !== undefined)
            dto.rsi14_1h = entry.rsi14_1h;
        if (entry.sma20_1h !== undefined)
            dto.sma20_1h = entry.sma20_1h;
        if (entry.volumeRatio20_1h !== undefined)
            dto.volumeRatio20_1h = entry.volumeRatio20_1h;
        coins.push(dto);
    }
    return {
        type: 'market_snapshot',
        timestamp: Date.now(),
        coins,
    };
}
// ─── Broadcast loop ───────────────────────────────────────────────────────────
function broadcastTick() {
    if (!wss)
        return;
    if (!hasValidData())
        return; // no market data yet — skip tick
    const payload = buildSnapshot();
    const message = JSON.stringify(payload);
    for (const client of wss.clients) {
        if (client.readyState !== WebSocket.OPEN)
            continue;
        try {
            client.send(message);
        }
        catch (err) {
            // Client may have closed mid-send — log and move on
            console.warn(`[broadcaster] send error: ${String(err)}`);
        }
    }
}
import http from 'node:http';
import { handleKlinesProxy } from './klinesProxy.js';
let httpServer = null;
// ─── Server lifecycle ─────────────────────────────────────────────────────────
/**
 * Start the WebSocket broadcast server alongside an HTTP proxy server.
 * @param port - Optional port override (default: config.port). Pass 0 for OS-assigned port.
 * Returns the WebSocketServer instance.
 */
export function startBroadcaster(port) {
    const targetPort = port ?? config.port;
    httpServer = http.createServer(async (req, res) => {
        // Basic CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        try {
            const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);
            if (parsedUrl.pathname === '/api/klines' && req.method === 'GET') {
                await handleKlinesProxy(parsedUrl, req, res);
                return;
            }
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Endpoint not found' }));
        }
        catch (err) {
            console.error(`[broadcaster] HTTP server error: ${String(err)}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    });
    wss = new WebSocketServer({ server: httpServer });
    wss.on('connection', (client, req) => {
        const ip = req.socket.remoteAddress ?? 'unknown';
        console.log(`[broadcaster] Client connected from ${ip} (total: ${wss.clients.size})`);
        client.on('close', () => {
            const remaining = wss?.clients.size ?? 0;
            console.log(`[broadcaster] Client disconnected (remaining: ${remaining})`);
        });
        client.on('error', (err) => {
            console.warn(`[broadcaster] Client error: ${err.message}`);
        });
    });
    wss.on('error', (err) => {
        console.error(`[broadcaster] Server error: ${err.message}`);
    });
    httpServer.listen(targetPort, () => {
        console.log(`[broadcaster] HTTP & WebSocket server listening on port ${targetPort}`);
    });
    broadcastTimer = setInterval(broadcastTick, BROADCAST_INTERVAL_MS);
    return wss;
}
/**
 * Stop the broadcast server and cancel the broadcast loop.
 */
export function stopBroadcaster() {
    if (broadcastTimer) {
        clearInterval(broadcastTimer);
        broadcastTimer = null;
    }
    return new Promise((resolve) => {
        if (!wss && !httpServer) {
            resolve();
            return;
        }
        const closeHttp = () => {
            if (httpServer) {
                httpServer.close(() => {
                    httpServer = null;
                    resolve();
                });
            }
            else {
                resolve();
            }
        };
        if (wss) {
            wss.close(() => {
                wss = null;
                closeHttp();
            });
        }
        else {
            closeHttp();
        }
    });
}
/** Expose the server instance for testing */
export function getBroadcaster() {
    return wss;
}
/** Expose snapshot builder for testing */
export { buildSnapshot };
