/**
 * DetailDrawer — right-side symbol detail panel.
 *
 * Shows:
 *   - Symbol header: price, 24h stats, RSI, SMA, volume ratio
 *   - Rule condition breakdown: which conditions pass/fail
 *   - Lazy chart: Lightweight Charts v5 with candlestick + volume + RSI panes
 *
 * Chart:
 *   - Fetches 200 candles from Binance REST independently (not from backend)
 *   - Live updates via symbol kline WebSocket
 *   - Destroyed on close to free memory
 *
 * The drawer does NOT use a modal — it is a fixed right-side panel.
 */

import React, {
  useEffect, useRef, useCallback, useState, Suspense
} from 'react';
import { X, TrendingUp } from 'lucide-react';
import type { MarketCoinDTO } from '../../../shared/src/types.js';
import { useMarketStore } from '../state/marketStore.js';
import { useUserStore } from '../state/userStore.js';
import { adaptCoin } from '../stream/marketAdapter.js';
import {
  formatPrice, formatPct, formatRsi, formatRatio,
  formatVolume, computeDsma, pctClass, UNAVAILABLE,
} from '../design/format.js';
import { WhyThisCoin } from './WhyThisCoin.js';
import styles from './DetailDrawer.module.css';

// Lazy load chart to avoid blocking initial render
const ChartPanel = React.lazy(() => import('./ChartPanel.js'));

interface DetailDrawerProps {
  symbol: string | null;
  onClose: () => void;
}

export function DetailDrawer({ symbol, onClose }: DetailDrawerProps): React.ReactElement | null {
  const coinsMap = useMarketStore(s => s.coinsMap);
  const rules    = useUserStore(s => s.rules);

  const coin = symbol ? coinsMap.get(symbol) : undefined;

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!symbol) return null;

  const fields = coin ? adaptCoin(coin) : null;

  return (
    <div className={styles.drawer} role="complementary" aria-label="Symbol detail">
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <span className={styles.symbol}>{symbol.replace('USDT', '')}</span>
          <span className={styles.pair}>/ USDT</span>
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close drawer">
          <X size={16} />
        </button>
      </div>

      <div className={styles.content}>
        {/* Price header */}
        {coin ? (
          <div className={styles.priceSection}>
            <div className={styles.bigPrice}>{formatPrice(coin.p)}</div>
            <span className={`${styles.change} ${pctClass(coin.c24)}`}>
              {formatPct(coin.c24)} (24h)
            </span>
          </div>
        ) : (
          <div className={styles.priceSection}>
            <div className={styles.bigPrice}>{UNAVAILABLE}</div>
            <span className={styles.change} style={{ color: 'var(--text-3)' }}>Waiting for data…</span>
          </div>
        )}

        {/* Stats grid */}
        <div className={styles.statsGrid}>
          <Stat label="24h High"   value={formatPrice(coin?.h24)} />
          <Stat label="24h Low"    value={formatPrice(coin?.l24)} />
          <Stat label="24h Volume" value={formatVolume(coin?.v24)} />
          <Stat label="RSI (1h)"   value={coin?.rsi14_1h !== undefined ? formatRsi(coin.rsi14_1h) : UNAVAILABLE} />
          <Stat label="SMA-20 (1h)" value={formatPrice(coin?.sma20_1h)} />
          <Stat
            label="Vol Ratio (1h)"
            value={coin?.volumeRatio20_1h !== undefined ? formatRatio(coin.volumeRatio20_1h) : UNAVAILABLE}
            tooltip="Refreshed hourly at candle close"
          />
          {coin && (
            <Stat
              label="% vs SMA-20"
              value={
                (() => {
                  const d = computeDsma(coin.p, coin.sma20_1h);
                  return d !== undefined ? formatPct(d) : UNAVAILABLE;
                })()
              }
            />
          )}
        </div>

        {/* Why this coin? */}
        {fields && (
          <WhyThisCoin rules={rules} fields={fields} symbol={symbol} />
        )}

        {/* Chart */}
        {symbol && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <TrendingUp size={12} /> Chart
            </div>
            <Suspense fallback={<div className={styles.chartLoading}>Loading chart…</div>}>
              <ChartPanel symbol={symbol} height={380} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stat ─────────────────────────────────────────────────────────────────────

interface StatProps {
  label: string;
  value: string;
  tooltip?: string;
}

function Stat({ label, value, tooltip }: StatProps): React.ReactElement {
  return (
    <div className={styles.stat} title={tooltip}>
      <span className={styles.statLabel}>{label}</span>
      <span className={`${styles.statValue} ${value === UNAVAILABLE ? styles.unavailable : ''}`}>
        {value}
      </span>
    </div>
  );
}

