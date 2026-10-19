/**
 * TopBar — persistent application header.
 *
 * Displays:
 *   - Product name
 *   - Connection status (colored dot + label)
 *   - Data age (seconds since last received snapshot)
 *   - Universe size (coins with price > 0)
 *   - Active indicator count (coins with RSI seeded)
 *   - Breadth: advancers vs decliners count
 */

import React, { useEffect, useState } from 'react';
import { useMarketStore } from '../state/marketStore.js';
import { StatusDot } from './primitives.js';
import styles from './TopBar.module.css';

const STATUS_LABEL: Record<string, string> = {
  connecting:    'Connecting',
  connected:     'Live',
  reconnecting:  'Reconnecting',
  disconnected:  'Disconnected',
};

function useDataAge(lastReceived: number): string {
  const [age, setAge] = useState(0);

  useEffect(() => {
    if (lastReceived === 0) return;
    const tick = () => setAge(Math.floor((Date.now() - lastReceived) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastReceived]);

  if (lastReceived === 0) return '—';
  if (age < 2) return '< 1s ago';
  if (age < 60) return `${age}s ago`;
  return `${Math.floor(age / 60)}m ago`;
}

export function TopBar(): React.ReactElement {
  const connectionStatus = useMarketStore(s => s.connectionStatus);
  const lastReceived = useMarketStore(s => s.lastReceived);
  const coinsMap = useMarketStore(s => s.coinsMap);
  const dataAge = useDataAge(lastReceived);

  // Compute breadth stats from the map
  const coins = Array.from(coinsMap.values());
  const universeSize = coins.length;
  const withIndicators = coins.filter(c => c.rsi14_1h !== undefined).length;
  const advancers = coins.filter(c => c.c24 > 0).length;
  const decliners = coins.filter(c => c.c24 < 0).length;

  const isStale = lastReceived > 0 && (Date.now() - lastReceived) > 5000;

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.brandName}>CryptoScan</span>
        <span className={styles.brandSub}>Real-time USDT Pairs</span>
      </div>

      <div className={styles.stats}>
        {universeSize > 0 && (
          <>
            <StatItem label="Universe" value={`${universeSize}`} />
            <div className={styles.divider} />
            <StatItem label="Indicators" value={`${withIndicators}`} />
            <div className={styles.divider} />
            <span className={styles.breadth}>
              <span style={{ color: 'var(--gain)' }}>{advancers}↑</span>
              {' / '}
              <span style={{ color: 'var(--loss)' }}>{decliners}↓</span>
            </span>
            <div className={styles.divider} />
          </>
        )}
        <StatItem
          label="Data age"
          value={dataAge}
          className={isStale ? styles.stale : undefined}
        />
      </div>

      <div className={styles.connection}>
        <StatusDot status={connectionStatus} />
        <span className={`${styles.statusLabel} ${styles[`status--${connectionStatus}`]}`}>
          {STATUS_LABEL[connectionStatus] ?? connectionStatus}
        </span>
      </div>
    </header>
  );
}

interface StatItemProps {
  label: string;
  value: string;
  className?: string | undefined;
}

function StatItem({ label, value, className }: StatItemProps): React.ReactElement {
  return (
    <div className={`${styles.statItem} ${className ?? ''}`}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  );
}

