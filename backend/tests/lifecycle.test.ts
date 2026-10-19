/**
 * lifecycle.test.ts — Unit tests for demand-driven lifecycle management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initLifecycle,
  isPipelineActive,
  startPipeline,
  stopPipeline,
} from '../src/lifecycle.js';
import * as binanceWs from '../src/binanceWs.js';
import * as hourlySync from '../src/hourlySync.js';
import * as broadcaster from '../src/broadcaster.js';

describe('demand-driven lifecycle manager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(binanceWs, 'startBinanceStream').mockImplementation(() => ({} as any));
    vi.spyOn(binanceWs, 'stopBinanceStream').mockImplementation(() => {});
    vi.spyOn(hourlySync, 'startHourlySync').mockImplementation(() => {});
    vi.spyOn(hourlySync, 'stopHourlySync').mockImplementation(() => {});
    vi.spyOn(broadcaster, 'startBroadcastLoop').mockImplementation(() => {});
    vi.spyOn(broadcaster, 'stopBroadcastLoop').mockImplementation(() => {});
    stopPipeline();
  });

  afterEach(() => {
    stopPipeline();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts pipeline and marks it active', () => {
    expect(isPipelineActive()).toBe(false);
    startPipeline();
    expect(isPipelineActive()).toBe(true);
    expect(binanceWs.startBinanceStream).toHaveBeenCalledOnce();
    expect(broadcaster.startBroadcastLoop).toHaveBeenCalledOnce();
    expect(hourlySync.startHourlySync).toHaveBeenCalledOnce();
  });

  it('stops pipeline and marks it inactive', () => {
    startPipeline();
    expect(isPipelineActive()).toBe(true);
    stopPipeline();
    expect(isPipelineActive()).toBe(false);
    expect(binanceWs.stopBinanceStream).toHaveBeenCalledOnce();
    expect(broadcaster.stopBroadcastLoop).toHaveBeenCalledOnce();
    expect(hourlySync.stopHourlySync).toHaveBeenCalledOnce();
  });

  it('hooks into broadcaster and activates when first client connects', () => {
    let connectCb: ((count: number, client?: any) => void) | undefined;
    let disconnectCb: ((remaining: number) => void) | undefined;

    vi.spyOn(broadcaster, 'setClientLifecycleListeners').mockImplementation((onConn, onDisc) => {
      connectCb = onConn;
      disconnectCb = onDisc;
    });

    initLifecycle(['BTCUSDT', 'ETHUSDT']);
    expect(connectCb).toBeDefined();
    expect(disconnectCb).toBeDefined();

    expect(isPipelineActive()).toBe(false);

    // Client connects
    connectCb!(1);
    expect(isPipelineActive()).toBe(true);
    expect(binanceWs.startBinanceStream).toHaveBeenCalledOnce();

    // Client disconnects -> idle grace countdown begins
    vi.spyOn(broadcaster, 'getConnectedClientCount').mockReturnValue(0);
    disconnectCb!(0);

    // Pipeline should still be active during grace period
    expect(isPipelineActive()).toBe(true);

    // Advance timers past 60s grace period
    vi.advanceTimersByTime(61_000);

    // Pipeline should now be shut down
    expect(isPipelineActive()).toBe(false);
    expect(binanceWs.stopBinanceStream).toHaveBeenCalledOnce();
  });

  it('cancels idle shutdown if client reconnects within grace period', () => {
    let connectCb: ((count: number, client?: any) => void) | undefined;
    let disconnectCb: ((remaining: number) => void) | undefined;

    vi.spyOn(broadcaster, 'setClientLifecycleListeners').mockImplementation((onConn, onDisc) => {
      connectCb = onConn;
      disconnectCb = onDisc;
    });

    initLifecycle(['BTCUSDT']);
    connectCb!(1);
    expect(isPipelineActive()).toBe(true);

    // Disconnect
    disconnectCb!(0);
    vi.advanceTimersByTime(30_000); // 30s into grace period

    // Reconnect
    connectCb!(1);

    // Advance another 40s (70s total from disconnect, but cancelled at 30s)
    vi.advanceTimersByTime(40_000);

    // Pipeline should remain active!
    expect(isPipelineActive()).toBe(true);
    expect(binanceWs.stopBinanceStream).not.toHaveBeenCalled();
  });
});

