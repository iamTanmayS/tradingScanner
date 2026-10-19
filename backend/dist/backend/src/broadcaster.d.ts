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
import type { MarketBroadcastPayload } from '../../shared/src/types.js';
/**
 * Convert the current cache state into a MarketBroadcastPayload.
 *
 * Only includes coins that have a valid price (> 0).
 * Indicator fields are omitted (undefined) when not yet seeded —
 * the shared type allows them to be optional.
 */
declare function buildSnapshot(): MarketBroadcastPayload;
export type ClientLifecycleListener = (count: number, client?: WebSocket) => void;
export declare function setClientLifecycleListeners(onConnect: ClientLifecycleListener, onDisconnect: ClientLifecycleListener): void;
export declare function startBroadcastLoop(): void;
export declare function stopBroadcastLoop(): void;
export declare function getConnectedClientCount(): number;
export declare function sendSnapshotToClient(client: WebSocket): void;
/**
 * Start the WebSocket broadcast server alongside an HTTP proxy server.
 * @param port - Optional port override (default: config.port). Pass 0 for OS-assigned port.
 * Returns the WebSocketServer instance.
 */
export declare function startBroadcaster(port?: number): WebSocketServer;
/**
 * Stop the broadcast server and cancel the broadcast loop.
 */
export declare function stopBroadcaster(): Promise<void>;
/** Expose the server instance for testing */
export declare function getBroadcaster(): WebSocketServer | null;
/** Expose snapshot builder for testing */
export { buildSnapshot };
