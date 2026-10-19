/**
 * binanceWs.ts — Binance !miniTicker@arr WebSocket ingestion client.
 *
 * Connects to Binance's all-symbol mini-ticker stream, parses the
 * partial-update batches, and merges them into the market cache.
 *
 * Connection lifecycle:
 *   - Reconnects automatically after unexpected disconnects.
 *   - Waits RECONNECT_DELAY_MS before retrying to avoid tight loops.
 *   - Logs status changes; does not log every ticker message.
 *
 * Architecture note:
 *   !miniTicker@arr sends only changed symbols each second (partial updates).
 *   The cache must MERGE each batch — never replace the full map.
 */

import WebSocket from 'ws';
import { applyTickerBatch, type MiniTickerRaw } from './cache.js';
import { applyAllLiveTicks } from './indicators.js';
import { config } from './config.js';

const RECONNECT_DELAY_MS = 5_000;

let activeSocket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

/** Callback invoked after each successfully merged ticker batch */
type OnBatchCallback = (updatedCount: number) => void;

let onBatchCb: OnBatchCallback | undefined;

export function setOnBatchCallback(cb: OnBatchCallback): void {
  onBatchCb = cb;
}

/**
 * Start the Binance WebSocket ingestion.
 * Returns the WebSocket instance (useful for testing).
 */
export function startBinanceStream(): WebSocket {
  stopped = false;
  return connect();
}

/** Gracefully stop the ingestion and cancel any pending reconnects. */
export function stopBinanceStream(): void {
  stopped = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (activeSocket) {
    activeSocket.close(1000, 'server shutdown');
    activeSocket = null;
  }
}

function connect(): WebSocket {
  const url = config.binanceWsUrl;
  console.log(`[binanceWs] Connecting to ${url}`);

  const ws = new WebSocket(url);
  activeSocket = ws;

  ws.on('open', () => {
    console.log('[binanceWs] Connected — receiving !miniTicker@arr stream');
  });

  ws.on('message', (data: WebSocket.RawData) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      return; // unparseable frame — ignore
    }

    if (!Array.isArray(parsed)) return;

    // Cast to the known raw shape; validation happens inside applyTickerUpdate
    const batch = parsed as MiniTickerRaw[];
    const updated = applyTickerBatch(batch);

    // Apply O(1) provisional RSI updates across all seeded symbols
    applyAllLiveTicks();

    onBatchCb?.(updated);
  });

  ws.on('error', (err: Error) => {
    console.error(`[binanceWs] Stream error: ${err.message}`);
  });

  ws.on('close', (code: number, reason: Buffer) => {
    activeSocket = null;
    if (stopped) return;

    const reasonStr = reason.toString() || 'no reason given';
    console.warn(
      `[binanceWs] Disconnected (code=${code}, reason="${reasonStr}") — ` +
      `reconnecting in ${RECONNECT_DELAY_MS / 1000}s`,
    );
    scheduleReconnect();
  });

  return ws;
}

function scheduleReconnect(): void {
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!stopped) connect();
  }, RECONNECT_DELAY_MS);
}

