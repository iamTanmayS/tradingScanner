/**
 * App — root layout and WebSocket bootstrap.
 *
 * Layout (desktop, 1280px+):
 *   ┌─────────────────────────────────────────────┐
 *   │  TopBar                                      │
 *   ├─────────────────────────────────────────────┤
 *   │  RulesBar                                    │
 *   ├──────────────────────────────┬──────────────┤
 *   │  Watchlists (4 panels)       │ SignalsRail   │
 *   ├──────────────────────────────┤              │
 *   │  MarketTable                 │              │
 *   └──────────────────────────────┴──────────────┘
 *
 *   DetailDrawer overlays from the right on symbol selection.
 *
 * The stream hook is initialized here — one WS connection for the app.
 * Rules are passed to the store via the stream hook so each snapshot is
 * evaluated with the current rule set.
 */

import React, { useCallback, useEffect, useState } from 'react';

import { CoinDetailPage } from './components/CoinDetailPage.js';
import { MarketTable } from './components/MarketTable.js';
import { RulesBar } from './components/RulesBar.js';
import { SignalsRail } from './components/SignalsRail.js';
import { TopBar } from './components/TopBar.js';
import { WatchlistPanel } from './components/WatchlistPanel.js';
import styles from './App.module.css';
import { useMarketStream } from './stream/useMarketStream.js';
import { useUserStore } from './state/userStore.js';

export function App(): React.ReactElement {
  const rules = useUserStore(s => s.rules);
  useMarketStream(rules);

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  // Sync with URL hash for browser history / direct link support (#BTCUSDT)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').toUpperCase();
      if (hash && hash.endsWith('USDT')) {
        setSelectedSymbol(hash);
      } else {
        setSelectedSymbol(null);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSelectSymbol = useCallback((sym: string) => {
    window.location.hash = sym;
  }, []);

  const handleBackToScanner = useCallback(() => {
    window.location.hash = '';
  }, []);

  return (
    <div className={styles.layout}>
      {/* Top bar — persistent across all views */}
      <div className={styles.topBar}>
        <TopBar />
      </div>

      {selectedSymbol ? (
        <CoinDetailPage
          symbol={selectedSymbol}
          onBack={handleBackToScanner}
        />
      ) : (
        <>
          {/* Rules bar — full width */}
          <div className={styles.rulesBar}>
            <RulesBar />
          </div>

          {/* Main scanner view */}
          <div className={styles.main}>
            {/* Left column: watchlists + table */}
            <div className={styles.left}>
              {/* 4 Watchlist panels */}
              <div className={styles.watchlists}>
                <WatchlistPanel type="gainers" onSelectSymbol={handleSelectSymbol} />
                <WatchlistPanel type="losers" onSelectSymbol={handleSelectSymbol} />
                <WatchlistPanel type="volume" onSelectSymbol={handleSelectSymbol} />
                <WatchlistPanel type="rsi" onSelectSymbol={handleSelectSymbol} />
              </div>

              {/* Market table — fills remaining height */}
              <div className={styles.tableWrapper}>
                <MarketTable onSelectSymbol={handleSelectSymbol} />
              </div>
            </div>

            {/* Right column: signals rail */}
            <div className={styles.right}>
              <SignalsRail onSelectSymbol={handleSelectSymbol} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

