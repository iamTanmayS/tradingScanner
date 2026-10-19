/**
 * Scanner engine — pure condition evaluator.
 *
 * No React, no Zustand, no side effects.
 * All functions are deterministic given the same inputs.
 *
 * Field resolution rules:
 *   - A field resolving to undefined / NaN / non-finite → condition is false
 *   - dsma is computed inline from p and sma; returns false if either is invalid
 *   - Operators: >, >=, <, <=  (== and != are in shared types but excluded from UI)
 */

import type { RuleCondition, ScannerRule } from '../../../shared/src/types.js';
import type { CoinEvalFields } from '../stream/marketAdapter.js';

type RuleFieldKey = keyof CoinEvalFields;

/** Maps the RuleField string from shared types to CoinEvalFields keys. */
const FIELD_MAP: Record<string, RuleFieldKey> = {
  rsi14_1h:        'rsi',
  sma20_1h:        'sma',
  volumeRatio20_1h: 'vr',
  p:               'p',
  c24:             'c24',
  v24:             'v24',
  dsma:            'dsma',  // virtual field — computed in adapter
};

/**
 * Resolves the numeric value for a single condition field from the coin's
 * evaluated fields. Returns undefined for any unresolvable / invalid value.
 */
export function resolveField(
  fields: CoinEvalFields,
  field: string
): number | undefined {
  const key = FIELD_MAP[field];
  if (!key) return undefined;

  const value = fields[key];
  if (value === undefined || value === null) return undefined;
  if (!Number.isFinite(value) || Number.isNaN(value)) return undefined;
  return value;
}

/**
 * Evaluates a single RuleCondition against a coin's resolved fields.
 *
 * Returns false (never throws) when:
 *   - The field resolves to undefined / NaN / non-finite
 *   - The operator is not recognized
 */
export function evaluateCondition(
  condition: RuleCondition,
  fields: CoinEvalFields
): boolean {
  const value = resolveField(fields, condition.field);
  if (value === undefined) return false;

  const { operator, value: threshold } = condition;

  switch (operator) {
    case '>':  return value > threshold;
    case '>=': return value >= threshold;
    case '<':  return value < threshold;
    case '<=': return value <= threshold;
    case '==': return value === threshold;
    case '!=': return value !== threshold;
    default:   return false;
  }
}

/**
 * Evaluates a ScannerRule against a coin's resolved fields.
 *
 * - Rule with no conditions → false (a rule must declare what it matches)
 * - Disabled rule → false (caller should pre-filter, but safe here too)
 * - logic: 'AND' → all conditions must be true
 * - logic: 'OR'  → any condition must be true
 *
 * Returns false (never throws) for any invalid input.
 */
export function evaluateRule(
  rule: ScannerRule,
  fields: CoinEvalFields
): boolean {
  if (!rule.enabled) return false;
  if (rule.conditions.length === 0) return false;

  if (rule.logic === 'AND') {
    return rule.conditions.every(c => evaluateCondition(c, fields));
  }

  if (rule.logic === 'OR') {
    return rule.conditions.some(c => evaluateCondition(c, fields));
  }

  return false;
}

/**
 * Evaluates all enabled rules against a coin.
 *
 * Returns the set of rule IDs that match. An empty set means no matches.
 */
export function evaluateAllRules(
  rules: ScannerRule[],
  fields: CoinEvalFields
): Set<string> {
  const matched = new Set<string>();
  for (const rule of rules) {
    if (evaluateRule(rule, fields)) {
      matched.add(rule.id);
    }
  }
  return matched;
}

