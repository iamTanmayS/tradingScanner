/**
 * broadcaster.test.ts — Unit tests for snapshot assembly and WebSocket broadcast.
 *
 * Tests:
 *   - buildSnapshot produces the correct MarketBroadcastPayload shape.
 *   - Only coins with valid prices are included.
 *   - Indicator fields are omitted (not null) when not set.
 *   - A real WebSocket client can connect and receive a snapshot.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { buildSnapshot, startBroadcaster, stopBroadcaster } from '../src/broadcaster.js';
import { initCacheEntry, applyTickerUpdate } from '../src/cache.js';
// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeTicker(symbol, c, o = '100') {
    return {
        s: symbol, E: Date.now(),
        o, c, h: '110', l: '90', v: '1000', q: '100000',
    };
}
// ─── buildSnapshot ────────────────────────────────────────────────────────────
describe('buildSnapshot', () => {
    beforeEach(() => {
        initCacheEntry('SNPBTC');
        initCacheEntry('SNPETH');
        applyTickerUpdate(makeTicker('SNPBTC', '80000'));
        // SNPETH has no valid price — should be excluded
    });
    it('returns a payload with type "market_snapshot"', () => {
        const payload = buildSnapshot();
        expect(payload.type).toBe('market_snapshot');
    });
    it('includes a millisecond timestamp', () => {
        const before = Date.now();
        const payload = buildSnapshot();
        expect(payload.timestamp).toBeGreaterThanOrEqual(before);
        expect(payload.timestamp).toBeLessThanOrEqual(Date.now() + 10);
    });
    it('includes only coins with price > 0', () => {
        const payload = buildSnapshot();
        const symbols = payload.coins.map((c) => c.s);
        expect(symbols).toContain('SNPBTC');
        expect(symbols).not.toContain('SNPETH'); // price is 0
    });
    it('coin DTO has required fields s, p, c24, h24, l24, v24', () => {
        const payload = buildSnapshot();
        const coin = payload.coins.find((c) => c.s === 'SNPBTC');
        expect(coin).toBeDefined();
        expect(typeof coin.s).toBe('string');
        expect(typeof coin.p).toBe('number');
        expect(typeof coin.c24).toBe('number');
        expect(typeof coin.h24).toBe('number');
        expect(typeof coin.l24).toBe('number');
        expect(typeof coin.v24).toBe('number');
    });
    it('indicator fields are omitted (undefined) when not seeded', () => {
        const payload = buildSnapshot();
        const coin = payload.coins.find((c) => c.s === 'SNPBTC');
        expect(coin.rsi14_1h).toBeUndefined();
        expect(coin.sma20_1h).toBeUndefined();
        expect(coin.volumeRatio20_1h).toBeUndefined();
    });
});
// ─── WebSocket integration: client receives snapshot ─────────────────────────
describe('broadcaster WebSocket integration', () => {
    afterEach(async () => {
        await stopBroadcaster();
    });
    it('a WebSocket client can connect and the server accepts it', async () => {
        const server = startBroadcaster(0); // OS assigns a free port
        await new Promise((resolve) => server.once('listening', resolve));
        // Read the actual bound port (avoids env-var timing issues)
        const addr = server.address();
        const port = addr.port;
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        await new Promise((resolve, reject) => {
            ws.once('open', resolve);
            ws.once('error', reject);
        });
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
    });
    it('a client receives a market_snapshot message within 2 seconds', async () => {
        // Seed a valid price so the broadcaster has data to send
        initCacheEntry('INTEGBTC');
        applyTickerUpdate(makeTicker('INTEGBTC', '81000'));
        const server = startBroadcaster(0); // OS assigns a free port
        await new Promise((resolve) => server.once('listening', resolve));
        const addr = server.address();
        const port = addr.port;
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        const payload = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('timeout: no message received')), 2500);
            ws.once('open', () => {
                ws.once('message', (data) => {
                    clearTimeout(timeout);
                    resolve(JSON.parse(data.toString()));
                });
            });
            ws.once('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
        expect(payload.type).toBe('market_snapshot');
        expect(Array.isArray(payload.coins)).toBe(true);
        ws.close();
    });
});
