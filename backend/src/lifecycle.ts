/**
 * lifecycle.ts — Demand-driven market pipeline lifecycle manager.
 *
 * Coordinates:
 *   - Upstream Binance WebSocket ingestion (start/stop)
 *   - Background indicator seeding (triggered on first client connection)
 *   - Hourly candle maintenance (start/stop)
 *   - Broadcast tick loop (start/stop)
 *
 * When the frontend is not in use:
 *   After the last client disconnects, a grace period timer starts (default 60s).
 *   If no client reconnects, all upstream network sockets and timers are shut down.
 *   This allows Railway Serverless App-Sleeping to scale down to 0 replicas,
 *   preserving free tier credits ($0/month while idle).
 *
 * When a user opens the frontend:
 *   The WebSocket connection wakes Railway and triggers `handleClientConnect`,
 *   which immediately resumes the Binance stream and sends live data.
 */

import { config } from './config.js';
import { startBinanceStream, stopBinanceStream } from './binanceWs.js';
import { startHourlySync, stopHourlySync } from './hourlySync.js';
import { seedIndicators } from './indicators.js';
import {
  startBroadcastLoop,
  stopBroadcastLoop,
  sendSnapshotToClient,
  setClientLifecycleListeners,
  getConnectedClientCount,
} from './broadcaster.js';
import type WebSocket from 'ws';

let pipelineActive = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let topSymbolsToSeed: string[] = [];
let seedingStarted = false;

/**
 * Initialize the demand-driven lifecycle with the top symbols to seed.
 * Hooks into broadcaster connection events.
 */
export function initLifecycle(topSymbols: string[]): void {
  topSymbolsToSeed = topSymbols;
  setClientLifecycleListeners(handleClientConnect, handleClientDisconnect);
}

/** Check if the market pipeline is currently running. */
export function isPipelineActive(): boolean {
  return pipelineActive;
}

/**
 * Start all upstream ingestion and periodic tasks.
 */
export function startPipeline(): void {
  if (pipelineActive) return;
  pipelineActive = true;
  console.log('[lifecycle] Activating market data pipeline (Binance stream + broadcast loop + hourly sync)');

  // 1. Connect to Binance live miniTicker stream
  startBinanceStream();

  // 2. Start broadcast tick timer
  startBroadcastLoop();

  // 3. Start hourly candle roll maintenance
  startHourlySync();

  // 4. Seed indicators in background (once per container lifecycle)
  if (!seedingStarted && topSymbolsToSeed.length > 0) {
    seedingStarted = true;
    console.log(`[lifecycle] Triggering background indicator seeding for ${topSymbolsToSeed.length} coins`);
    seedIndicators(topSymbolsToSeed).catch((err: unknown) => {
      console.error(`[lifecycle] Indicator seeding error: ${String(err)}`);
    });
  }
}

/**
 * Stop all upstream ingestion and timers so Node.js can idle completely.
 */
export function stopPipeline(): void {
  if (!pipelineActive) return;
  pipelineActive = false;
  console.log('[lifecycle] Stopping market data pipeline (Binance stream + broadcast loop + hourly sync)');

  // 1. Close upstream Binance WebSocket
  stopBinanceStream();

  // 2. Clear broadcast timer
  stopBroadcastLoop();

  // 3. Clear hourly sync timer
  stopHourlySync();

  console.log('[lifecycle] All upstream connections and timers stopped. Server is completely idle.');
}

function handleClientConnect(totalClients: number, client?: WebSocket): void {
  // Cancel pending idle shutdown timer if a client reconnects
  if (idleTimer) {
    console.log('[lifecycle] Client connected during grace period — cancelling idle shutdown timer');
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  // Activate pipeline on first client
  if (!pipelineActive) {
    console.log(`[lifecycle] First client connected (${totalClients} total) — starting market pipeline`);
    startPipeline();
  }

  // Send an immediate snapshot to the newly connected client
  if (client) {
    sendSnapshotToClient(client);
  }
}

function handleClientDisconnect(remainingClients: number): void {
  if (remainingClients > 0) return;

  if (!config.onDemand) {
    console.log('[lifecycle] Client disconnected. ON_DEMAND=false — keeping pipeline running 24/7.');
    return;
  }

  console.log(
    `[lifecycle] All clients disconnected. Starting idle countdown (${config.idleGraceSeconds}s grace period)...`
  );

  if (idleTimer) clearTimeout(idleTimer);

  idleTimer = setTimeout(() => {
    idleTimer = null;
    const currentClients = getConnectedClientCount();
    if (currentClients === 0) {
      console.log(`[lifecycle] Grace period (${config.idleGraceSeconds}s) expired with 0 clients.`);
      stopPipeline();
    } else {
      console.log(`[lifecycle] Reconnection detected (${currentClients} active) — aborting shutdown.`);
    }
  }, config.idleGraceSeconds * 1000);
}
