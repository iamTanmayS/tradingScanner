/**
 * WhyThisCoin — intuitive strategy explanation panel for a selected coin.
 *
 * Replaces the raw condition syntax list with:
 *   - Plain-language explanations of target criteria
 *   - "X of Y conditions met" clear result summaries
 *   - Actual live values displayed directly beside target thresholds
 *   - Visual status hierarchy (Matched, Partial, Waiting for data, Not met, Paused)
 *   - Honest data states when indicators are not yet seeded
 *   - Clear distinction for duplicate rule names
 *   - Compact by default with expandable condition drill-downs
 *   - Integrated visual RSI scale
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Check, X, Clock, HelpCircle } from 'lucide-react';
import type { ScannerRule } from '../../../shared/src/types.js';
import type { CoinEvalFields } from '../stream/marketAdapter.js';
import {
  analyzeAllStrategies,
  type StrategyAnalysis,
  type ConditionAnalysis,
  type StrategyStatus,
} from '../scanner/strategyAnalysis.js';
import { RsiScale } from './RsiScale.js';
import styles from './WhyThisCoin.module.css';

interface WhyThisCoinProps {
  rules: ScannerRule[];
  fields: CoinEvalFields;
  symbol: string;
}

export function WhyThisCoin({ rules, fields, symbol }: WhyThisCoinProps): React.ReactElement {
  const strategies = analyzeAllStrategies(rules, fields);
  const matchedCount = strategies.filter(s => s.status === 'matched').length;

  if (rules.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No Scanner Rules Configured</p>
        <p className={styles.emptyDesc}>Create a strategy rule above to scan and analyze this coin.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>Why this coin?</span>
          <span className={styles.symbolBadge}>{symbol.replace('USDT', '')}</span>
        </div>
        <div className={styles.headerRight}>
          <span className={`${styles.overallBadge} ${matchedCount > 0 ? styles.badgeMatched : styles.badgeNeutral}`}>
            {matchedCount > 0 ? `${matchedCount} matched` : 'No active matches'}
          </span>
        </div>
      </div>

      <div className={styles.list}>
        {strategies.map((strategy, idx) => (
          <StrategyCard
            key={strategy.id}
            strategy={strategy}
            defaultExpanded={idx === 0 || strategy.status === 'matched' || strategy.status === 'partial'}
          />
        ))}
      </div>
    </div>
  );
}

// ── StrategyCard ──────────────────────────────────────────────────────────────

interface StrategyCardProps {
  strategy: StrategyAnalysis;
  defaultExpanded?: boolean;
}

function StrategyCard({ strategy, defaultExpanded = false }: StrategyCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const statusClass = getStatusClass(strategy.status);

  return (
    <div className={`${styles.card} ${styles[`card--${strategy.status}`]}`}>
      <button
        type="button"
        className={styles.cardHeader}
        onClick={() => setExpanded(prev => !prev)}
        aria-expanded={expanded}
      >
        <div className={styles.cardMeta}>
          <div className={styles.cardTopRow}>
            <span className={`${styles.statusPill} ${statusClass}`}>
              {getStatusLabel(strategy.status)}
            </span>
            <span className={styles.strategyName}>{strategy.displayName}</span>
          </div>

          <div className={styles.summaryRow}>
            <span className={styles.summaryText}>{strategy.summaryText}</span>
            {strategy.logic === 'OR' && (
              <span className={styles.logicTag}>Match ANY</span>
            )}
          </div>
        </div>

        <span className={styles.expandIcon}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {expanded && (
        <div className={styles.conditionsList}>
          {strategy.conditions.map((cond, i) => (
            <ConditionDetail key={`${cond.field}-${i}`} condition={cond} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── ConditionDetail ───────────────────────────────────────────────────────────

interface ConditionDetailProps {
  condition: ConditionAnalysis;
}

function ConditionDetail({ condition }: ConditionDetailProps): React.ReactElement {
  return (
    <div className={styles.conditionItem}>
      <div className={styles.conditionRow}>
        <div className={styles.conditionIcon}>
          {condition.status === 'passed' && <Check size={14} className={styles.iconPass} />}
          {condition.status === 'failed' && <X size={14} className={styles.iconFail} />}
          {condition.status === 'waiting_data' && <Clock size={14} className={styles.iconWait} />}
        </div>

        <div className={styles.conditionText}>
          <span className={styles.explanation}>{condition.explanation}</span>
        </div>

        <div className={styles.valuesBox}>
          <span className={styles.valTarget}>
            Target: <strong>{condition.formattedTarget}</strong>
          </span>
          <span className={`${styles.valCurrent} ${condition.status === 'waiting_data' ? styles.valWaiting : ''}`}>
            Current: <strong>{condition.formattedCurrent}</strong>
          </span>
        </div>
      </div>

      {/* RSI Gauge when applicable */}
      {condition.isRsi && (
        <div className={styles.gaugeContainer}>
          <RsiScale
            currentRsi={condition.currentValue}
            targetThreshold={condition.targetValue}
            operator={condition.operator}
          />
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStatusClass(status: StrategyStatus): string {
  switch (status) {
    case 'matched':      return styles.statusMatched ?? '';
    case 'partial':      return styles.statusPartial ?? '';
    case 'waiting_data': return styles.statusWaiting ?? '';
    case 'not_met':      return styles.statusNotMet ?? '';
    case 'paused':       return styles.statusPaused ?? '';
  }
}

function getStatusLabel(status: StrategyStatus): string {
  switch (status) {
    case 'matched':      return 'Matched';
    case 'partial':      return 'Partially Met';
    case 'waiting_data': return 'Waiting for Data';
    case 'not_met':      return 'Not Met';
    case 'paused':       return 'Paused';
  }
}
