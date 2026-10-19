/**
 * MarketTable — virtualized table of all live coins.
 *
 * Features:
 *   - Tabs: All / Starred / Matches
 *   - Rule-Specific Live Monitoring Tabs under Matches (All Rules + One Tab per Enabled Rule)
 *   - Independent coin membership per rule with live 1Hz evaluations
 *   - Aggregated "All Rules" overview displaying matched rule badges
 *   - Paused rules indicator area
 *   - Search by symbol (filters live — no re-subscribe)
 *   - Sortable columns including SMA Distance (dsma)
 *   - Star toggle per row
 *   - Amber row highlight for current scanner matches
 *   - @tanstack/react-virtual for rows (handles 500+ items smoothly)
 *   - Indicators shown as '—' when undefined (never 0 or fabricated)
 *   - Price flash animation via CSS class toggle
 */

import React, { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Star, ShieldAlert } from 'lucide-react';
import type { MarketCoinDTO, ScannerRule } from '../../../shared/src/types.js';
import { useMarketStore } from '../state/marketStore.js';
import { useUserStore } from '../state/userStore.js';
import { SegmentedControl } from './primitives.js';
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
import styles from './MarketTable.module.css';

type TabValue = 'all' | 'starred' | 'matches';

type SortKey =
  | 'symbol'
  | 'p'
  | 'c24'
  | 'v24'
  | 'rsi14_1h'
  | 'sma20_1h'
  | 'dsma'
  | 'volumeRatio20_1h';

type SortDir = 'asc' | 'desc';

interface MarketTableProps {
  onSelectSymbol?: ((symbol: string) => void) | undefined;
}

const ROW_HEIGHT = 38;

function getDisambiguatedRuleName(rule: ScannerRule, allRules: ScannerRule[]): string {
  const duplicates = allRules.filter(r => r.name === rule.name);
  if (duplicates.length <= 1) return rule.name;

  const condText = rule.conditions
    .map(c => `${c.field.replace('14_1h', '').replace('20_1h', '')} ${c.operator} ${c.value}`)
    .join(', ');
  return `${rule.name} (${condText})`;
}

export function MarketTable({ onSelectSymbol }: MarketTableProps): React.ReactElement {
  const [tab, setTab] = useState<TabValue>('all');
  const [activeRuleId, setActiveRuleId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('v24');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const coinsMap       = useMarketStore(s => s.coinsMap);
  const matchingNow    = useMarketStore(s => s.scannerState.matchingNow);
  const ruleMatches    = useMarketStore(s => s.scannerState.ruleMatches);
  const symbolRules    = useMarketStore(s => s.scannerState.symbolRules);
  const rules          = useUserStore(s => s.rules);
  const starredSymbols = useUserStore(s => s.starredSymbols);
  const toggleStar     = useUserStore(s => s.toggleStar);

  const enabledRules = useMemo(() => rules.filter(r => r.enabled), [rules]);
  const pausedRules  = useMemo(() => rules.filter(r => !r.enabled), [rules]);

  // If active rule was disabled, fallback to 'all'
  useEffect(() => {
    if (activeRuleId !== 'all' && !enabledRules.some(r => r.id === activeRuleId)) {
      setActiveRuleId('all');
    }
  }, [activeRuleId, enabledRules]);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return key; }
      setSortDir('desc');
      return key;
    });
  }, []);

  const tabOptions = useMemo(() => [
    { value: 'all',     label: 'All Pairs' },
    { value: 'starred', label: `Starred (${starredSymbols.size})` },
    { value: 'matches', label: `Matches (${matchingNow.size})` },
  ], [starredSymbols.size, matchingNow.size]);

  // Lookup map for rule names by ID
  const ruleMap = useMemo(() => {
    const map = new Map<string, ScannerRule>();
    for (const r of rules) map.set(r.id, r);
    return map;
  }, [rules]);

  const coins = useMemo(() => {
    let list = Array.from(coinsMap.values()).filter(c => c.p > 0);

    // Tab filter
    if (tab === 'starred') {
      list = list.filter(c => starredSymbols.has(c.s));
    } else if (tab === 'matches') {
      if (activeRuleId === 'all') {
        list = list.filter(c => matchingNow.has(c.s));
      } else {
        const specificMatches = ruleMatches.get(activeRuleId);
        list = list.filter(c => specificMatches?.has(c.s));
      }
    }

    // Search filter
    const q = search.trim().toUpperCase();
    if (q) list = list.filter(c => c.s.includes(q));

    // Sort
    list.sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      if (sortKey === 'symbol') {
        aVal = a.s; bVal = b.s;
      } else if (sortKey === 'dsma') {
        aVal = computeDsma(a.p, a.sma20_1h) ?? -Infinity;
        bVal = computeDsma(b.p, b.sma20_1h) ?? -Infinity;
      } else {
        aVal = (a[sortKey] as number | undefined) ?? -Infinity;
        bVal = (b[sortKey] as number | undefined) ?? -Infinity;
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [coinsMap, tab, activeRuleId, search, sortKey, sortDir, starredSymbols, matchingNow, ruleMatches]);

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: coins.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const activeRule = enabledRules.find(r => r.id === activeRuleId);

  return (
    <div className={styles.wrapper}>
      {/* Controls Bar */}
      <div className={styles.controls}>
        <SegmentedControl
          options={tabOptions}
          value={tab}
          onChange={v => setTab(v as TabValue)}
        />
        <input
          type="search"
          placeholder="Search symbol…"
          className={styles.search}
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search market symbols"
        />
        <span className={styles.count}>{coins.length} pairs</span>
      </div>

      {/* Rule-Specific Live Monitoring Tabs (when Matches tab is selected) */}
      {tab === 'matches' && (
        <div className={styles.ruleTabsBar} role="tablist" aria-label="Rule-specific live monitoring tabs">
          {/* All Rules Overview Tab */}
          <button
            role="tab"
            aria-selected={activeRuleId === 'all'}
            className={`${styles.ruleTabBtn} ${activeRuleId === 'all' ? styles.ruleTabBtnActive : ''}`}
            onClick={() => setActiveRuleId('all')}
          >
            <span>All Rules</span>
            <span className={styles.tabBadge}>{matchingNow.size}</span>
          </button>

          {/* Individual Rule Tabs */}
          {enabledRules.map(rule => {
            const count = ruleMatches.get(rule.id)?.size ?? 0;
            const displayName = getDisambiguatedRuleName(rule, enabledRules);
            return (
              <button
                key={rule.id}
                role="tab"
                aria-selected={activeRuleId === rule.id}
                className={`${styles.ruleTabBtn} ${activeRuleId === rule.id ? styles.ruleTabBtnActive : ''}`}
                onClick={() => setActiveRuleId(rule.id)}
              >
                <span className={styles.ruleTabName}>{displayName}</span>
                <span className={`${styles.tabBadge} ${count > 0 ? styles.tabBadgeActive : ''}`}>
                  {count}
                </span>
              </button>
            );
          })}

          {/* Paused Rules Indicator */}
          {pausedRules.length > 0 && (
            <div
              className={styles.pausedIndicator}
              title={`Paused rules (${pausedRules.length}): ${pausedRules.map(r => r.name).join(', ')}`}
            >
              <ShieldAlert size={12} />
              <span>{pausedRules.length} paused</span>
            </div>
          )}
        </div>
      )}

      {/* Table Header */}
      <div className={styles.header}>
        <SortHeader label="Symbol"   sortKey="symbol"          current={sortKey} dir={sortDir} onSort={handleSort} align="left" />
        <SortHeader label="Price"    sortKey="p"               current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
        <SortHeader label="24h %"    sortKey="c24"             current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
        <SortHeader label="Volume"   sortKey="v24"             current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
        <SortHeader label="RSI 1h"   sortKey="rsi14_1h"        current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
        <SortHeader label="SMA 1h"   sortKey="sma20_1h"        current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
        <SortHeader label="SMA Dist" sortKey="dsma"            current={sortKey} dir={sortDir} onSort={handleSort} align="right" tooltip="% distance from 20-period SMA" />
        <SortHeader label="Vol×"     sortKey="volumeRatio20_1h" current={sortKey} dir={sortDir} onSort={handleSort} align="right" tooltip="Refreshed hourly at candle close" />
        <div className={styles.starCol} />
      </div>

      {/* Virtualized Body */}
      <div
        ref={parentRef}
        className={styles.body}
        style={{ overflow: 'auto', flex: 1 }}
      >
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map(virtualRow => {
            const coin = coins[virtualRow.index];
            if (!coin) return null;

            // Get names of matching rules for this coin if on "All Rules" tab
            const matchedRuleIds = symbolRules.get(coin.s);
            const matchedRuleNames = matchedRuleIds
              ? Array.from(matchedRuleIds).map(id => ruleMap.get(id)?.name).filter((n): n is string => Boolean(n))
              : undefined;

            return (
              <CoinRow
                key={coin.s}
                coin={coin}
                isMatch={matchingNow.has(coin.s)}
                matchedRuleNames={tab === 'matches' && activeRuleId === 'all' ? matchedRuleNames : undefined}
                isStarred={starredSymbols.has(coin.s)}
                onToggleStar={toggleStar}
                onSelect={onSelectSymbol}
                style={{
                  position: 'absolute',
                  top: virtualRow.start,
                  left: 0,
                  width: '100%',
                  height: ROW_HEIGHT,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Empty States */}
      {coins.length === 0 && (
        <div className={styles.emptyOverlay}>
          {tab === 'starred' && 'No starred symbols. Click the star icon on any coin to add it to your watchlist.'}
          {tab === 'matches' && enabledRules.length === 0 && 'No active scanner rules. Enable a rule to monitor live matches.'}
          {tab === 'matches' && enabledRules.length > 0 && activeRuleId === 'all' && 'No coins currently match any active scanner rule.'}
          {tab === 'matches' && enabledRules.length > 0 && activeRuleId !== 'all' && `No coins currently match "${activeRule?.name ?? 'this rule'}".`}
          {tab === 'all' && search && 'No symbols match your search.'}
          {tab === 'all' && !search && 'Waiting for market data…'}
        </div>
      )}
    </div>
  );
}

// ── SortHeader ────────────────────────────────────────────────────────────────

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
  tooltip?: string;
}

function SortHeader({ label, sortKey, current, dir, onSort, align = 'right', tooltip }: SortHeaderProps): React.ReactElement {
  const isActive = current === sortKey;
  const arrow = isActive ? (dir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <button
      className={`${styles.headerCell} ${align === 'left' ? styles.left : ''} ${isActive ? styles.active : ''}`}
      onClick={() => onSort(sortKey)}
      title={tooltip}
    >
      {label}{arrow}
    </button>
  );
}

// ── CoinRow ───────────────────────────────────────────────────────────────────

interface CoinRowProps {
  coin: MarketCoinDTO;
  isMatch: boolean;
  matchedRuleNames?: string[] | undefined;
  isStarred: boolean;
  onToggleStar: (symbol: string) => void;
  onSelect?: ((symbol: string) => void) | undefined;
  style: React.CSSProperties;
}

const CoinRow = React.memo(function CoinRow({
  coin, isMatch, matchedRuleNames, isStarred, onToggleStar, onSelect, style
}: CoinRowProps): React.ReactElement {
  const prevPriceRef = useRef(coin.p);
  const cellRef = useRef<HTMLDivElement>(null);

  // Price flash via ref mutation — NOT Zustand state
  useEffect(() => {
    if (coin.p === prevPriceRef.current) return;
    const el = cellRef.current;
    if (!el) return;
    const cls = coin.p > prevPriceRef.current ? 'price-flash-gain' : 'price-flash-loss';
    el.classList.remove('price-flash-gain', 'price-flash-loss');
    void el.offsetWidth;
    el.classList.add(cls);
    prevPriceRef.current = coin.p;
  }, [coin.p]);

  const displaySym = coin.s.replace('USDT', '');
  const dsma = computeDsma(coin.p, coin.sma20_1h);

  return (
    <div
      className={`${styles.row} ${isMatch ? styles.rowMatch : ''}`}
      style={style}
      onClick={() => onSelect?.(coin.s)}
      role="row"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect?.(coin.s)}
      aria-selected={isMatch}
    >
      <div className={`${styles.cell} ${styles.left}`}>
        <div className={styles.symColumn}>
          <div className={styles.symLine}>
            <span className={styles.symbolText}>{displaySym}</span>
            <span className={styles.quoteCurrency}>USDT</span>
          </div>
          {matchedRuleNames && matchedRuleNames.length > 0 && (
            <div className={styles.ruleBadges}>
              {matchedRuleNames.map(name => (
                <span key={name} className={styles.ruleBadge}>{name}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div ref={cellRef} className={`${styles.cell} ${styles.mono}`}>
        {formatPrice(coin.p)}
      </div>

      <div className={`${styles.cell} ${styles.mono} ${pctClass(coin.c24)}`}>
        {formatPct(coin.c24)}
      </div>

      <div className={`${styles.cell} ${styles.mono}`}>
        {formatVolume(coin.v24)}
      </div>

      <div className={`${styles.cell} ${styles.mono} ${getRsiClass(coin.rsi14_1h)}`}>
        {coin.rsi14_1h !== undefined ? formatRsi(coin.rsi14_1h) : UNAVAILABLE}
      </div>

      <div className={`${styles.cell} ${styles.mono}`}>
        {coin.sma20_1h !== undefined ? formatPrice(coin.sma20_1h) : UNAVAILABLE}
      </div>

      <div className={`${styles.cell} ${styles.mono} ${pctClass(dsma)}`} title="Distance from SMA-20">
        {dsma !== undefined ? formatPct(dsma) : UNAVAILABLE}
      </div>

      <div className={`${styles.cell} ${styles.mono}`} title="Refreshed hourly at candle close">
        {coin.volumeRatio20_1h !== undefined ? formatRatio(coin.volumeRatio20_1h) : UNAVAILABLE}
      </div>

      <button
        className={`${styles.starBtn} ${isStarred ? styles.starred : ''}`}
        onClick={e => { e.stopPropagation(); onToggleStar(coin.s); }}
        aria-label={isStarred ? `Unstar ${displaySym}` : `Star ${displaySym}`}
        tabIndex={-1}
      >
        <Star size={13} fill={isStarred ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
});

function getRsiClass(rsi: number | undefined): string {
  if (rsi === undefined) return '';
  if (rsi <= 30) return 'gain';
  if (rsi >= 70) return 'loss';
  return '';
}
