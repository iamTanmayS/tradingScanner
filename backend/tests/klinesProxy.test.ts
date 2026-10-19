/**
 * klinesProxy.test.ts — Unit tests for the klines HTTP proxy endpoint.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { startBroadcaster, stopBroadcaster } from '../src/broadcaster.js';

describe('klines HTTP proxy endpoint', () => {
  let port: number;

  beforeEach(async () => {
    const server = startBroadcaster(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const addr = server.address() as { port: number };
    port = addr.port;
  });

  afterEach(async () => {
    await stopBroadcaster();
  });

  it('responds with CORS headers on OPTIONS', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/klines`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('returns 404 on unknown endpoint', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/unknown`);
    expect(res.status).toBe(404);
  });

  it('returns 400 if symbol is missing or invalid', async () => {
    const res1 = await fetch(`http://127.0.0.1:${port}/api/klines`);
    expect(res1.status).toBe(400);
    const body1 = await res1.json() as { error: string };
    expect(body1.error).toContain('symbol');

    const res2 = await fetch(`http://127.0.0.1:${port}/api/klines?symbol=$$$`);
    expect(res2.status).toBe(400);
  });

  it('returns 400 if interval is invalid', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/klines?symbol=BTCUSDT&interval=99m`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('interval');
  });

  it('returns 400 if limit is invalid or out of range', async () => {
    const res1 = await fetch(`http://127.0.0.1:${port}/api/klines?symbol=BTCUSDT&interval=1h&limit=0`);
    expect(res1.status).toBe(400);
    const body1 = await res1.json() as { error: string };
    expect(body1.error).toContain('limit');

    const res2 = await fetch(`http://127.0.0.1:${port}/api/klines?symbol=BTCUSDT&interval=1h&limit=5000`);
    expect(res2.status).toBe(400);

    const res3 = await fetch(`http://127.0.0.1:${port}/api/klines?symbol=BTCUSDT&interval=1h&limit=invalid`);
    expect(res3.status).toBe(400);
  });

  it('proxies valid klines request and returns array', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/klines?symbol=BTCUSDT&interval=1h&limit=5`);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(5);
    // Binance kline item is a 12-element array
    const first = data[0] as unknown[];
    expect(first.length).toBe(12);
  });

  it('allows concurrent WebSocket connections while HTTP requests are processed', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    expect(ws.readyState).toBe(WebSocket.OPEN);

    // Make an HTTP request while WS is open
    const res = await fetch(`http://127.0.0.1:${port}/api/klines?symbol=ETHUSDT&interval=1h&limit=2`);
    expect(res.status).toBe(200);

    ws.close();
  });
});

