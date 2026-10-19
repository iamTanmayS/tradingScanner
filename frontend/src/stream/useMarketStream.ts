/**
 * useMarketStream — WebSocket hook.
 *
 * Connects to the backend at ws://localhost:4000, parses market_snapshot
 * payloads, and feeds them into the market store.
 *
 * Connection lifecycle:
 *   - connecting → connected on first message
 *   - disconnected → reconnecting → connected on next reconnect
 *   - Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
 *   - Cleans up on component unmount (no duplicate subscriptions)
 *
 * Scanner rules are passed in so the store can evaluate them on each snapshot.
 * Reconnect resets the scanner baseline (no false alert storm).
 */

import { useEffect, useRef, useCallback } from 'react';
import type { MarketBroadcastPayload, ScannerRule } from '../../../shared/src/types.js';
import { useMarketStore } from '../state/marketStore.js';

const DEFAULT_WS_URL =
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
    : 'ws://localhost:4000';

const WS_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WS_URL)
    ? import.meta.env.VITE_WS_URL
    : DEFAULT_WS_URL;

const MIN_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

export function useMarketStream(rules: ScannerRule[]): void {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(MIN_RECONNECT_MS);
  const unmountedRef = useRef(false);
  const rulesRef = useRef(rules);

  // Keep rules ref current without re-triggering the connect effect
  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);

  const { setSnapshot, setConnectionStatus, resetBaseline } = useMarketStore.getState();

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    setConnectionStatus('connecting');

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return; }
      reconnectDelayRef.current = MIN_RECONNECT_MS;
      // Status will be set to 'connected' on first message receipt
    };

    ws.onmessage = (event: MessageEvent) => {
      if (unmountedRef.current) return;

      let payload: MarketBroadcastPayload;
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const parsed = JSON.parse(event.data as string);
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          (parsed as { type?: unknown }).type !== 'market_snapshot'
        ) {
          return;
        }
        payload = parsed as MarketBroadcastPayload;
      } catch {
        return;
      }

      setConnectionStatus('connected');
      setSnapshot(payload, rulesRef.current);
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;

      setConnectionStatus('reconnecting');
      resetBaseline();

      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_MS);

      reconnectTimeoutRef.current = setTimeout(() => {
        if (!unmountedRef.current) connect();
      }, delay);
    };

    ws.onerror = () => {
      // onerror is always followed by onclose — handle reconnect there
      ws.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        const ws = wsRef.current;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;

        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        } else if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => {
            ws.close();
          };
        }
        wsRef.current = null;
      }
    };
  }, [connect]);
}

