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
/** Callback invoked after each successfully merged ticker batch */
type OnBatchCallback = (updatedCount: number) => void;
export declare function setOnBatchCallback(cb: OnBatchCallback): void;
/**
 * Start the Binance WebSocket ingestion.
 * Returns the WebSocket instance (useful for testing).
 */
export declare function startBinanceStream(): WebSocket;
/** Gracefully stop the ingestion and cancel any pending reconnects. */
export declare function stopBinanceStream(): void;
export {};
