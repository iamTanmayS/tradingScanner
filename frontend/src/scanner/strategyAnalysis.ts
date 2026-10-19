/**
 * Strategy analysis module.
 *
 * Produces user-friendly, plain-language breakdown of scanner strategies
 * for a specific coin.
 *
 * Provides:
 *   - Plain-language explanations of target criteria
 *   - Current actual value vs target threshold
 *   - Honest data states ("Waiting for indicator data" instead of false failures)
 *   - Match/partial/not_met/paused status hierarchy
 *   - Disambiguation for duplicate rule names
 */

import type { RuleCondition, ScannerRule, ComparisonOperator } from '../../../shared/src/types.js';
import type { CoinEvalFields } from '../stream/marketAdapter.js';
import { evaluateCondition, resolveField } from './evaluateCondition.js';
import {
  formatPrice,
  formatPct,
  formatVolume,
  formatRatio,
  formatRsi,
  UNAVAILABLE,
} from '../design/format.js';

export type ConditionStatus = 'passed' | 'failed' | 'waiting_data';

export type StrategyStatus = 'matched' | 'partial' | 'not_met' | 'paused' | 'waiting_data';

export interface ConditionAnalysis {
  field: string;
  fieldLabel: string;
  operator: ComparisonOperator;
  operatorText: string;
  targetValue: number;
  formattedTarget: string;
  currentValue: number | undefined;
  formattedCurrent: string;
  status: ConditionStatus;
  statusLabel: string;
  explanation: string;
  isRsi: boolean;
}

export interface StrategyAnalysis {
  id: string;
  name: string;
  displayName: string;
  enabled: boolean;
  logic: 'AND' | 'OR';
  status: StrategyStatus;
  matchedConditions: number;
  totalConditions: number;
  summaryText: string;
  conditions: ConditionAnalysis[];
}

const FIELD_LABELS: Record<string, string> = {
  rsi14_1h:         'RSI (1h)',
  volumeRatio20_1h: 'Volume Ratio (1h)',
  c24:              '24h Price Change',
  v24:              '24h Volume',
  p:                'Market Price',
  sma20_1h:         'SMA-20 (1h)',
  dsma:             '% vs SMA-20',
};

const OPERATOR_TEXT: Record<ComparisonOperator, string> = {
  '>':  'above',
  '>=': 'at or above',
  '<':  'below',
  '<=': 'at or below',
  '==': 'equal to',
  '!=': 'different from',
};

const OPERATOR_SYMBOLS: Record<ComparisonOperator, string> = {
  '>':  '>',
  '>=': '≥',
  '<':  '<',
  '<=': '≤',
  '==': '=',
  '!=': '≠',
};

function formatFieldValue(field: string, val: number | undefined): string {
  if (val === undefined || Number.isNaN(val) || !Number.isFinite(val)) {
    return UNAVAILABLE;
  }
  switch (field) {
    case 'rsi14_1h':
      return formatRsi(val);
    case 'volumeRatio20_1h':
      return formatRatio(val);
    case 'c24':
    case 'dsma':
      return formatPct(val);
    case 'v24':
      return formatVolume(val);
    case 'p':
    case 'sma20_1h':
      return formatPrice(val);
    default:
      return `${val}`;
  }
}

/**
 * Analyzes a single condition against current coin fields.
 */
export function analyzeCondition(
  condition: RuleCondition,
  fields: CoinEvalFields
): ConditionAnalysis {
  const currentValue = resolveField(fields, condition.field);
  const fieldLabel = FIELD_LABELS[condition.field] ?? condition.field;
  const opText = OPERATOR_TEXT[condition.operator] ?? condition.operator;
  const opSym = OPERATOR_SYMBOLS[condition.operator] ?? condition.operator;

  const formattedTarget = `${opSym} ${formatFieldValue(condition.field, condition.value)}`;
  const formattedCurrent = formatFieldValue(condition.field, currentValue);

  let status: ConditionStatus;
  let statusLabel: string;

  if (currentValue === undefined) {
    status = 'waiting_data';
    statusLabel = 'Waiting for data';
  } else {
    const passed = evaluateCondition(condition, fields);
    status = passed ? 'passed' : 'failed';
    statusLabel = passed ? 'Met' : 'Not met';
  }

  const isRsi = condition.field === 'rsi14_1h';

  let explanation: string;
  if (status === 'waiting_data') {
    explanation = `${fieldLabel} is waiting for indicator data`;
  } else {
    explanation = `${fieldLabel} is ${formattedCurrent} (target is ${opText} ${formatFieldValue(condition.field, condition.value)})`;
  }

  return {
    field: condition.field,
    fieldLabel,
    operator: condition.operator,
    operatorText: opText,
    targetValue: condition.value,
    formattedTarget,
    currentValue,
    formattedCurrent,
    status,
    statusLabel,
    explanation,
    isRsi,
  };
}

/**
 * Analyzes a full strategy rule against current coin fields.
 */
export function analyzeStrategy(
  rule: ScannerRule,
  fields: CoinEvalFields,
  occurrenceIndex?: number,
  totalOccurrences: number = 1
): StrategyAnalysis {
  const conditions = rule.conditions.map(c => analyzeCondition(c, fields));
  const totalConditions = conditions.length;
  const matchedConditions = conditions.filter(c => c.status === 'passed').length;
  const hasMissingData = conditions.some(c => c.status === 'waiting_data');

  let status: StrategyStatus;
  let summaryText: string;

  if (!rule.enabled) {
    status = 'paused';
    summaryText = 'Strategy paused';
  } else if (hasMissingData && matchedConditions === 0) {
    status = 'waiting_data';
    summaryText = 'Waiting for indicator data';
  } else if (rule.logic === 'AND') {
    if (matchedConditions === totalConditions && totalConditions > 0) {
      status = 'matched';
      summaryText = `${matchedConditions} of ${totalConditions} conditions met`;
    } else if (matchedConditions > 0) {
      status = 'partial';
      summaryText = `${matchedConditions} of ${totalConditions} conditions met`;
    } else {
      status = hasMissingData ? 'waiting_data' : 'not_met';
      summaryText = hasMissingData ? 'Waiting for indicator data' : `0 of ${totalConditions} conditions met`;
    }
  } else {
    // logic: 'OR'
    if (matchedConditions > 0) {
      status = 'matched';
      summaryText = `${matchedConditions} of ${totalConditions} conditions met (Any)`;
    } else if (hasMissingData) {
      status = 'waiting_data';
      summaryText = 'Waiting for indicator data';
    } else {
      status = 'not_met';
      summaryText = `0 of ${totalConditions} conditions met`;
    }
  }

  // Disambiguate duplicate rule names
  let displayName = rule.name;
  if (totalOccurrences > 1 && occurrenceIndex !== undefined) {
    const condSummary = rule.conditions
      .map(c => `${FIELD_LABELS[c.field] ?? c.field} ${c.operator} ${c.value}`)
      .join(', ');
    displayName = `${rule.name} (${condSummary})`;
  }

  return {
    id: rule.id,
    name: rule.name,
    displayName,
    enabled: rule.enabled,
    logic: rule.logic,
    status,
    matchedConditions,
    totalConditions,
    summaryText,
    conditions,
  };
}

/**
 * Analyzes all rules for a given coin, disambiguating identical rule names
 * and sorting with matched strategies first, then partial, then not_met/paused.
 */
export function analyzeAllStrategies(
  rules: ScannerRule[],
  fields: CoinEvalFields
): StrategyAnalysis[] {
  // Count rule names for duplicate detection
  const nameCounts = new Map<string, number>();
  for (const r of rules) {
    nameCounts.set(r.name, (nameCounts.get(r.name) ?? 0) + 1);
  }

  const nameSeen = new Map<string, number>();
  const analyzed: StrategyAnalysis[] = [];

  for (const rule of rules) {
    const totalOccurrences = nameCounts.get(rule.name) ?? 1;
    const occurrenceIndex = (nameSeen.get(rule.name) ?? 0) + 1;
    nameSeen.set(rule.name, occurrenceIndex);

    analyzed.push(analyzeStrategy(rule, fields, occurrenceIndex, totalOccurrences));
  }

  // Sort: matched first, partial second, waiting_data third, not_met fourth, paused last
  const priority: Record<StrategyStatus, number> = {
    matched:      0,
    partial:      1,
    waiting_data: 2,
    not_met:      3,
    paused:       4,
  };

  return analyzed.sort((a, b) => priority[a.status] - priority[b.status]);
}

