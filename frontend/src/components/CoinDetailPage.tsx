/**
 * CoinDetailPage — dedicated, full-screen view for deep analysis of a selected coin.
 *
 * Provides:
 *   - Navigation header with "Back to Scanner" (supports Esc key)
 *   - Live real-time hero banner with large price and key indicators
 *   - Full-width multi-pane chart (Lightweight Charts v5) with 480px height
 *   - Interactive 24-hour range visualizer
 *   - Spacious "Why this coin?" strategy analysis panel
 *   - Star / Watchlist toggle
 */

import React, { useEffect, Suspense } from 'react';
import { ArrowLeft, Star, ExternalLink, TrendingUp, BarChart2 } from 'lucide-react';
import { useMarketStore } from '../state/marketStore.js';
import { useUserStore } from '../state/userStore.js';
import { adaptCoin } from '../stream/marketAdapter.js';
import {
  formatPrice,
  formatPct,
  formatVolume,
  formatRsi,
  formatRatio,
  computeDsma,
  pctClass,
  UNAVAILABLE,
} from '../design/format.js';
import { WhyThisCoin } from './WhyThisCoin.js';
import styles from './CoinDetailPage.module.css';

const ChartPanel = React.lazy(() => import('./ChartPanel.js'));

interface CoinDetailPageProps {
  symbol: string;
  onBack: () => void;
}

export function CoinDetailPage({ symbol, onBack }: CoinDetailPageProps): React.ReactElement {
  const coinsMap       = useMarketStore(s => s.coinsMap);
  const rules          = useUserStore(s => s.rules);
  const starredSymbols = useUserStore(s => s.starredSymbols);
  const toggleStar     = useUserStore(s => s.toggleStar);

  const coin = coinsMap.get(symbol);
  const isStarred = starredSymbols.has(symbol);

  // Keyboard shortcut: Escape to go back
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  const fields = coin ? adaptCoin(coin) : null;
  const dsma = coin ? computeDsma(coin.p, coin.sma20_1h) : undefined;
  const baseAsset = symbol.replace('USDT', '');

  // 24h range percentage
  const rangePct = coin && coin.h24 > coin.l24
    ? Math.max(0, Math.min(100, ((coin.p - coin.l24) / (coin.h24 - coin.l24)) * 100))
    : 50;

  return (
    <div className={styles.page}>
      {/* Top Navigation Bar */}
      <nav className={styles.navBar} aria-label="Page navigation">
        <div className={styles.navLeft}>
          <button className={styles.backBtn} onClick={onBack} aria-label="Back to Scanner">
            <ArrowLeft size={16} />
            <span>Back to Scanner</span>
            <kbd className={styles.kbd}>Esc</kbd>
          </button>
          <div className={styles.breadcrumbs}>
            <span>Markets</span>
            <span className={styles.breadcrumbSlash}>/</span>
            <span>USDT</span>
            <span className={styles.breadcrumbSlash}>/</span>
            <span className={styles.breadcrumbActive}>{symbol}</span>
          </div>
        </div>

        <div className={styles.navRight}>
          <button
            className={`${styles.starBtn} ${isStarred ? styles.starred : ''}`}
            onClick={() => toggleStar(symbol)}
            aria-label={isStarred ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
          >
            <Star size={14} fill={isStarred ? 'currentColor' : 'none'} />
            <span>{isStarred ? 'Starred' : 'Add to Watchlist'}</span>
          </button>
          <a
            href={`https://www.binance.com/en/trade/${baseAsset}_USDT`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.binanceLink}
            title="Open on Binance Spot"
          >
            <span>Binance</span>
            <ExternalLink size={12} />
          </a>
        </div>
      </nav>

      <div className={styles.scrollArea}>
        {/* Hero Coin Header Banner */}
        <section className={styles.heroSection}>
          <div className={styles.heroMain}>
            <div className={styles.titleGroup}>
              <div className={styles.symbolTag}>
                <h1 className={styles.baseSymbol}>{baseAsset}</h1>
                <span className={styles.quoteSymbol}>/ USDT</span>
              </div>
              <span className={styles.spotBadge}>Spot Market</span>
            </div>

            <div className={styles.priceGroup}>
              <div className={styles.mainPrice}>{formatPrice(coin?.p)}</div>
              <span className={`${styles.changeBadge} ${pctClass(coin?.c24)}`}>
                {formatPct(coin?.c24)}
              </span>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className={styles.metricsBar}>
            <MetricItem label="24h High" value={formatPrice(coin?.h24)} />
            <MetricItem label="24h Low" value={formatPrice(coin?.l24)} />
            <MetricItem label="24h Volume (USDT)" value={formatVolume(coin?.v24)} />
            <MetricItem
              label="1h RSI"
              value={coin?.rsi14_1h !== undefined ? formatRsi(coin.rsi14_1h) : UNAVAILABLE}
              hint="Wilder 14-period"
            />
            <MetricItem label="1h SMA-20" value={formatPrice(coin?.sma20_1h)} />
            <MetricItem
              label="% vs SMA-20"
              value={dsma !== undefined ? formatPct(dsma) : UNAVAILABLE}
              className={pctClass(dsma)}
            />
            <MetricItem
              label="1h Volume Ratio"
              value={coin?.volumeRatio20_1h !== undefined ? formatRatio(coin.volumeRatio20_1h) : UNAVAILABLE}
              hint="Refreshed hourly at candle close"
            />
          </div>
        </section>

        {/* 2-Column Analytical Workspace */}
        <div className={styles.workspace}>
          {/* Main Column: Chart and Market Range */}
          <div className={styles.mainColumn}>
            {/* Chart Container */}
            <div className={styles.chartCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderTitle}>
                  <TrendingUp size={14} />
                  <span>Technical Candlestick Chart (200 Candles + Volume + RSI)</span>
                </div>
              </div>
              <div className={styles.chartWrapper}>
                <Suspense fallback={<div className={styles.chartLoading}>Loading chart data…</div>}>
                  <ChartPanel symbol={symbol} height={480} />
                </Suspense>
              </div>
            </div>

            {/* 24h High/Low Range Visualizer */}
            {coin && coin.h24 > coin.l24 && (
              <div className={styles.rangeCard}>
                <div className={styles.rangeHeader}>
                  <span className={styles.rangeTitle}>24h Price Range</span>
                  <span className={styles.rangePctText}>
                    Price is at <strong>{rangePct.toFixed(0)}%</strong> of 24h range
                  </span>
                </div>
                <div className={styles.rangeTrack}>
                  <div className={styles.rangeBar} style={{ width: `${rangePct}%` }} />
                  <div className={styles.rangeThumb} style={{ left: `${rangePct}%` }} />
                </div>
                <div className={styles.rangeFooter}>
                  <span>Low: {formatPrice(coin.l24)}</span>
                  <span>High: {formatPrice(coin.h24)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Side Column: "Why this coin?" Strategy Analysis */}
          <aside className={styles.sideColumn}>
            <div className={styles.strategyContainer}>
              {fields ? (
                <WhyThisCoin rules={rules} fields={fields} symbol={symbol} />
              ) : (
                <div className={styles.waitingContainer}>
                  <BarChart2 size={24} className={styles.waitingIcon} />
                  <p>Connecting to market stream…</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── MetricItem ───────────────────────────────────────────────────────────────

interface MetricItemProps {
  label: string;
  value: string;
  hint?: string | undefined;
  className?: string | undefined;
}

function MetricItem({ label, value, hint, className }: MetricItemProps): React.ReactElement {
  return (
    <div className={styles.metricItem} title={hint}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={`${styles.metricValue} ${className ?? ''} ${value === UNAVAILABLE ? styles.unavailable : ''}`}>
        {value}
      </span>
    </div>
  );
}

