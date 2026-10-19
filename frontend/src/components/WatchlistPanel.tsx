/**
 * WatchlistPanel — displays one auto-watchlist (gainers, losers, volume, RSI).
 *
 * Reads symbols from the market store and looks up live coin data.
 * Does NOT accept a coins array prop — reads directly from store to stay
 * decoupled from parent re-renders.
 */

import React from 'react';
import { useMarketStore, type RsiExtreme } from '../state/marketStore.js';
import { Panel, EmptyState } from './primitives.js';
import {
  formatPrice,
  formatPct,
  formatVolume,
  formatRsi,
  pctClass,
} from '../design/format.js';
import styles from './WatchlistPanel.module.css';

export type WatchlistType = 'gainers' | 'losers' | 'volume' | 'rsi';

interface WatchlistPanelProps {
  type: WatchlistType;
  onSelectSymbol?: ((symbol: string) => void) | undefined;
}

const TITLES: Record<WatchlistType, string> = {
  gainers: 'Top Gainers',
  losers:  'Top Losers',
  volume:  'Highest Volume',
  rsi:     'RSI Extremes',
};

export function WatchlistPanel({ type, onSelectSymbol }: WatchlistPanelProps): React.ReactElement {
  const coinsMap     = useMarketStore(s => s.coinsMap);
  const topGainers   = useMarketStore(s => s.topGainers);
  const topLosers    = useMarketStore(s => s.topLosers);
  const highestVolume = useMarketStore(s => s.highestVolume);
  const rsiExtremes  = useMarketStore(s => s.rsiExtremes);

  return (
    <Panel title={TITLES[type]}>
      {type === 'rsi'
        ? <RsiList items={rsiExtremes} coinsMap={coinsMap} onSelect={onSelectSymbol} />
        : <SymbolList
            symbols={type === 'gainers' ? topGainers : type === 'losers' ? topLosers : highestVolume}
            type={type}
            coinsMap={coinsMap}
            onSelect={onSelectSymbol}
          />
      }
    </Panel>
  );
}

// ── SymbolList (gainers / losers / volume) ────────────────────────────────────

interface SymbolListProps {
  symbols: string[];
  type: 'gainers' | 'losers' | 'volume';
  coinsMap: Map<string, import('../../../shared/src/types.js').MarketCoinDTO>;
  onSelect?: ((symbol: string) => void) | undefined;
}

function SymbolList({ symbols, type, coinsMap, onSelect }: SymbolListProps): React.ReactElement {
  if (symbols.length === 0) {
    return <EmptyState message="Waiting for data…" />;
  }

  return (
    <ul className={styles.list} role="list">
      {symbols.map((sym, i) => {
        const coin = coinsMap.get(sym);
        if (!coin) return null;

        const secondary = type === 'volume'
          ? formatVolume(coin.v24)
          : formatPct(coin.c24);

        const secondaryClass = type === 'volume'
          ? styles.neutral
          : pctClass(coin.c24);

        return (
          <li
            key={sym}
            className={styles.row}
            onClick={() => onSelect?.(sym)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onSelect?.(sym)}
          >
            <span className={styles.rank}>{i + 1}</span>
            <span className={styles.symbol}>{sym.replace('USDT', '')}</span>
            <span className={styles.price}>{formatPrice(coin.p)}</span>
            <span className={`${styles.secondary} ${secondaryClass}`}>{secondary}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ── RsiList ──────────────────────────────────────────────────────────────────

interface RsiListProps {
  items: RsiExtreme[];
  coinsMap: Map<string, import('../../../shared/src/types.js').MarketCoinDTO>;
  onSelect?: ((symbol: string) => void) | undefined;
}

function RsiList({ items, coinsMap, onSelect }: RsiListProps): React.ReactElement {
  if (items.length === 0) {
    return <EmptyState message="No RSI extremes" hint="Appears when RSI < 35 or > 65" />;
  }

  return (
    <ul className={styles.list} role="list">
      {items.map(item => {
        const coin = coinsMap.get(item.symbol);
        if (!coin) return null;

        return (
          <li
            key={item.symbol}
            className={styles.row}
            onClick={() => onSelect?.(item.symbol)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onSelect?.(item.symbol)}
          >
            <span
              className={styles.rsiZone}
              style={{ color: item.zone === 'oversold' ? 'var(--gain)' : 'var(--loss)' }}
            >
              {item.zone === 'oversold' ? 'OS' : 'OB'}
            </span>
            <span className={styles.symbol}>{item.symbol.replace('USDT', '')}</span>
            <span className={styles.price}>{formatPrice(coin.p)}</span>
            <span
              className={styles.secondary}
              style={{ color: item.zone === 'oversold' ? 'var(--gain)' : 'var(--loss)' }}
            >
              {formatRsi(item.rsi)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

