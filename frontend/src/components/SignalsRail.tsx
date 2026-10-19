/**
 * SignalsRail — shows scanner matches with per-rule monitoring tabs
 * and recent transition events.
 *
 * Layout:
 *   - "Matching Now" section: tabbed by enabled rule (All + individual rules)
 *   - "Recent Events" section: log of transition entries (first match), bounded 50
 *
 * Rules:
 *   - Does NOT log per-tick events (only transitions: enter state, not "still matching")
 *   - New events appear at the top of the log
 */

import React, { useState, useMemo } from 'react';
import { useMarketStore } from '../state/marketStore.js';
import { useUserStore } from '../state/userStore.js';
import type { TransitionEvent } from '../scanner/transitions.js';
import { Panel, EmptyState } from './primitives.js';
import { formatPrice, formatPct, pctClass } from '../design/format.js';
import styles from './SignalsRail.module.css';

interface SignalsRailProps {
  onSelectSymbol?: ((symbol: string) => void) | undefined;
}

export function SignalsRail({ onSelectSymbol }: SignalsRailProps): React.ReactElement {
  const coinsMap      = useMarketStore(s => s.coinsMap);
  const scannerState  = useMarketStore(s => s.scannerState);
  const rules         = useUserStore(s => s.rules);
  const [activeRuleId, setActiveRuleId] = useState<string>('all');

  const enabledRules = useMemo(() => rules.filter(r => r.enabled), [rules]);

  // If active rule was disabled, fallback to 'all'
  const currentRuleId = enabledRules.some(r => r.id === activeRuleId) ? activeRuleId : 'all';

  const matchingSymbols = useMemo(() => {
    if (currentRuleId === 'all') {
      return Array.from(scannerState.matchingNow);
    }
    const specificSet = scannerState.ruleMatches.get(currentRuleId);
    return specificSet ? Array.from(specificSet) : [];
  }, [currentRuleId, scannerState.matchingNow, scannerState.ruleMatches]);

  const activeRule = enabledRules.find(r => r.id === currentRuleId);

  return (
    <div className={styles.rail}>
      {/* Matching Now with Rule Tabs */}
      <Panel title={`Matching Now (${scannerState.matchingNow.size})`}>
        {enabledRules.length > 0 && (
          <div className={styles.ruleTabs}>
            <button
              className={`${styles.tabChip} ${currentRuleId === 'all' ? styles.tabChipActive : ''}`}
              onClick={() => setActiveRuleId('all')}
            >
              All ({scannerState.matchingNow.size})
            </button>
            {enabledRules.map(rule => {
              const count = scannerState.ruleMatches.get(rule.id)?.size ?? 0;
              return (
                <button
                  key={rule.id}
                  className={`${styles.tabChip} ${currentRuleId === rule.id ? styles.tabChipActive : ''}`}
                  onClick={() => setActiveRuleId(rule.id)}
                  title={rule.name}
                >
                  <span className={styles.chipName}>{rule.name}</span>
                  <span className={styles.chipCount}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {enabledRules.length === 0 ? (
          <EmptyState message="No active rules" hint="Enable a rule to see matches." />
        ) : matchingSymbols.length === 0 ? (
          <EmptyState
            message={currentRuleId === 'all' ? 'No matches' : `No matches for ${activeRule?.name}`}
            hint="Live evaluation in progress…"
          />
        ) : (
          <ul className={styles.list} role="list">
            {matchingSymbols.map(sym => {
              const coin = coinsMap.get(sym);
              if (!coin) return null;
              return (
                <li
                  key={sym}
                  className={styles.matchRow}
                  onClick={() => onSelectSymbol?.(sym)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && onSelectSymbol?.(sym)}
                >
                  <span className={styles.matchSymbol}>{sym.replace('USDT', '')}</span>
                  <span className={styles.matchPrice}>{formatPrice(coin.p)}</span>
                  <span className={`${styles.matchChange} ${pctClass(coin.c24)}`}>
                    {formatPct(coin.c24)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* Recent Events */}
      <Panel title="Recent Events">
        {scannerState.recentEvents.length === 0 ? (
          <EmptyState message="No events yet" hint="Fires when a rule is first matched." />
        ) : (
          <ul className={styles.list} role="list" aria-live="polite" aria-label="Recent scanner events">
            {scannerState.recentEvents.map((event, i) => (
              <EventRow
                key={`${event.symbol}-${event.timestamp}-${i}`}
                event={event}
                onSelect={onSelectSymbol}
              />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ── EventRow ──────────────────────────────────────────────────────────────────

interface EventRowProps {
  event: TransitionEvent;
  onSelect?: ((symbol: string) => void) | undefined;
}

function EventRow({ event, onSelect }: EventRowProps): React.ReactElement {
  const age = formatAge(event.timestamp);

  return (
    <li
      className={styles.eventRow}
      onClick={() => onSelect?.(event.symbol)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect?.(event.symbol)}
    >
      <div className={styles.eventTop}>
        <span className={styles.eventSymbol}>{event.symbol.replace('USDT', '')}</span>
        <span className={styles.eventAge}>{age}</span>
      </div>
      <div className={styles.eventBottom}>
        <span className={styles.eventRule}>{event.ruleName}</span>
        <span className={`${pctClass(event.c24)} ${styles.eventChange}`}>{formatPct(event.c24)}</span>
      </div>
    </li>
  );
}

function formatAge(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}
