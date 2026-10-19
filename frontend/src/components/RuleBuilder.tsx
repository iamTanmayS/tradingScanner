/**
 * RuleBuilder — modal for creating and editing scanner rules.
 *
 * State is LOCAL to this component — never in the global market store.
 * This prevents 1Hz snapshots from disrupting user input mid-edit.
 *
 * Features:
 *   - Rule name, enabled toggle, Match ALL / Match ANY
 *   - Dynamic condition rows (max 6)
 *   - Field selector with plain-language labels
 *   - Operator selector (4 operators only: >, >=, <, <=)
 *   - Numeric threshold input
 *   - Live preview: how many coins currently match this rule
 *   - Preset loader
 *   - Save / Cancel / Delete
 */

import React, { useState, useCallback, useMemo } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { ScannerRule, RuleCondition, ComparisonOperator, RuleField } from '../../../shared/src/types.js';
import { useMarketStore } from '../state/marketStore.js';
import { useUserStore } from '../state/userStore.js';
import { evaluateRule } from '../scanner/evaluateCondition.js';
import { adaptCoin } from '../stream/marketAdapter.js';
import styles from './RuleBuilder.module.css';

interface RuleBuilderProps {
  /** null = create new rule, ScannerRule = edit existing */
  editingRule: ScannerRule | null;
  onClose: () => void;
}

// ── Field options ─────────────────────────────────────────────────────────────

const FIELD_OPTIONS: Array<{ value: RuleField; label: string }> = [
  { value: 'rsi14_1h',         label: 'RSI (1h)' },
  { value: 'volumeRatio20_1h', label: 'Volume Ratio (1h)' },
  { value: 'c24',              label: '24h Change %' },
  { value: 'v24',              label: '24h Volume (USDT)' },
  { value: 'p',                label: 'Price' },
  { value: 'sma20_1h',         label: 'SMA-20 (1h)' },
];

const OPERATOR_OPTIONS: Array<{ value: ComparisonOperator; label: string }> = [
  { value: '>',  label: 'is above' },
  { value: '>=', label: 'is at or above' },
  { value: '<',  label: 'is below' },
  { value: '<=', label: 'is at or below' },
];

// ── Preset templates ──────────────────────────────────────────────────────────

const PRESETS: Array<Pick<ScannerRule, 'name' | 'logic' | 'conditions'>> = [
  { name: 'Oversold Bounce', logic: 'AND', conditions: [{ field: 'rsi14_1h', operator: '<', value: 35 }] },
  { name: 'High Volume Day', logic: 'AND', conditions: [{ field: 'volumeRatio20_1h', operator: '>', value: 1.8 }, { field: 'c24', operator: '>', value: 3 }] },
  { name: 'Uptrend Pullback', logic: 'AND', conditions: [{ field: 'c24', operator: '>', value: 0 }, { field: 'rsi14_1h', operator: '<', value: 45 }] },
  { name: 'RSI Overbought', logic: 'AND', conditions: [{ field: 'rsi14_1h', operator: '>', value: 70 }] },
];

const MAX_CONDITIONS = 6;

function makeId(): string { return Math.random().toString(36).slice(2, 10); }

function blankCondition(): RuleCondition {
  return { field: 'rsi14_1h', operator: '<', value: 30 };
}

export function RuleBuilder({ editingRule, onClose }: RuleBuilderProps): React.ReactElement {
  const addRule    = useUserStore(s => s.addRule);
  const updateRule = useUserStore(s => s.updateRule);
  const deleteRule = useUserStore(s => s.deleteRule);
  const coinsMap   = useMarketStore(s => s.coinsMap);

  // ── Local form state ────────────────────────────────────────────────────────
  const [name, setName]           = useState(editingRule?.name ?? '');
  const [enabled, setEnabled]     = useState(editingRule?.enabled ?? true);
  const [logic, setLogic]         = useState<'AND' | 'OR'>(editingRule?.logic ?? 'AND');
  const [conditions, setConditions] = useState<RuleCondition[]>(
    editingRule?.conditions ?? [blankCondition()]
  );
  const [nameError, setNameError] = useState('');

  // ── Live preview ─────────────────────────────────────────────────────────────
  const previewRule: ScannerRule = useMemo(() => ({
    id: editingRule?.id ?? '__preview__',
    name,
    enabled: true,
    logic,
    conditions,
  }), [editingRule?.id, name, logic, conditions]);

  const matchCount = useMemo(() => {
    if (conditions.length === 0) return 0;
    let count = 0;
    for (const coin of coinsMap.values()) {
      if (coin.p > 0 && evaluateRule(previewRule, adaptCoin(coin))) count++;
    }
    return count;
  }, [previewRule, coinsMap]);

  // ── Condition operations ──────────────────────────────────────────────────
  const addCondition = useCallback(() => {
    if (conditions.length >= MAX_CONDITIONS) return;
    setConditions(prev => [...prev, blankCondition()]);
  }, [conditions.length]);

  const removeCondition = useCallback((i: number) => {
    setConditions(prev => prev.filter((_, idx) => idx !== i));
  }, []);

  const updateCondition = useCallback(<K extends keyof RuleCondition>(
    i: number, key: K, value: RuleCondition[K]
  ) => {
    setConditions(prev => prev.map((c, idx) => idx === i ? { ...c, [key]: value } : c));
  }, []);

  // ── Load preset ───────────────────────────────────────────────────────────
  const loadPreset = useCallback((preset: typeof PRESETS[number]) => {
    setName(preset.name);
    setLogic(preset.logic);
    setConditions(preset.conditions);
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) { setNameError('Name is required'); return; }
    if (conditions.length === 0) return;

    const rule: ScannerRule = {
      id: editingRule?.id ?? makeId(),
      name: trimmed,
      enabled,
      logic,
      conditions,
    };

    if (editingRule) {
      updateRule(rule.id, { name: rule.name, enabled: rule.enabled, logic: rule.logic, conditions: rule.conditions });
    } else {
      addRule(rule);
    }
    onClose();
  }, [name, enabled, logic, conditions, editingRule, addRule, updateRule, onClose]);

  const handleDelete = useCallback(() => {
    if (editingRule) deleteRule(editingRule.id);
    onClose();
  }, [editingRule, deleteRule, onClose]);

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Scanner Rule Builder">

        {/* Header */}
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            {editingRule ? 'Edit Rule' : 'New Scanner Rule'}
          </h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className={styles.body}>
          {/* Rule name */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="rule-name">Rule Name</label>
            <input
              id="rule-name"
              className={`${styles.input} ${nameError ? styles.inputError : ''}`}
              value={name}
              onChange={e => { setName(e.target.value); setNameError(''); }}
              placeholder="e.g. RSI Oversold + Volume Spike"
            />
            {nameError && <span className={styles.error}>{nameError}</span>}
          </div>

          {/* Enabled + Logic */}
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Status</label>
              <button
                className={`${styles.toggle} ${enabled ? styles.toggleOn : ''}`}
                onClick={() => setEnabled(v => !v)}
                type="button"
              >
                {enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Match logic</label>
              <div className={styles.logicToggle}>
                {(['AND', 'OR'] as const).map(opt => (
                  <button
                    key={opt}
                    className={`${styles.logicBtn} ${logic === opt ? styles.logicBtnActive : ''}`}
                    onClick={() => setLogic(opt)}
                    type="button"
                  >
                    {opt === 'AND' ? 'Match ALL' : 'Match ANY'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Conditions */}
          <div className={styles.conditionsSection}>
            <div className={styles.conditionsHeader}>
              <span className={styles.label}>Conditions</span>
              <span className={styles.condCount}>{conditions.length} / {MAX_CONDITIONS}</span>
            </div>
            {conditions.map((cond, i) => (
              <ConditionRow
                key={i}
                condition={cond}
                onUpdate={(key, val) => updateCondition(i, key, val)}
                onRemove={() => removeCondition(i)}
                canRemove={conditions.length > 1}
              />
            ))}
            {conditions.length < MAX_CONDITIONS && (
              <button className={styles.addCondBtn} onClick={addCondition} type="button">
                <Plus size={13} /> Add condition
              </button>
            )}
          </div>

          {/* Presets */}
          <div className={styles.presets}>
            <span className={styles.label}>Load preset</span>
            <div className={styles.presetBtns}>
              {PRESETS.map(p => (
                <button
                  key={p.name}
                  className={styles.presetBtn}
                  onClick={() => loadPreset(p)}
                  type="button"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Live preview */}
          <div className={styles.preview}>
            <span className={styles.previewLabel}>Live preview:</span>
            <span className={styles.previewCount}>
              {coinsMap.size === 0
                ? 'Waiting for data…'
                : `${matchCount} of ${coinsMap.size} coins match`}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {editingRule && (
            <button className={styles.deleteBtn} onClick={handleDelete} type="button">
              <Trash2 size={14} /> Delete
            </button>
          )}
          <button className={styles.cancelBtn} onClick={onClose} type="button">Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} type="button">
            {editingRule ? 'Save changes' : 'Create rule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ConditionRow ──────────────────────────────────────────────────────────────

interface ConditionRowProps {
  condition: RuleCondition;
  onUpdate: <K extends keyof RuleCondition>(key: K, value: RuleCondition[K]) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function ConditionRow({ condition, onUpdate, onRemove, canRemove }: ConditionRowProps): React.ReactElement {
  const fieldLabel = FIELD_OPTIONS.find(f => f.value === condition.field)?.label ?? condition.field;
  const opLabel    = OPERATOR_OPTIONS.find(o => o.value === condition.operator)?.label ?? condition.operator;

  return (
    <div className={styles.condRow}>
      {/* Field */}
      <select
        className={styles.select}
        value={condition.field}
        onChange={e => onUpdate('field', e.target.value as RuleField)}
        aria-label="Condition field"
        title={fieldLabel}
      >
        {FIELD_OPTIONS.map(f => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      {/* Operator */}
      <select
        className={styles.select}
        value={condition.operator}
        onChange={e => onUpdate('operator', e.target.value as ComparisonOperator)}
        aria-label="Comparison operator"
        title={opLabel}
      >
        {OPERATOR_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Value */}
      <input
        type="number"
        className={styles.numInput}
        value={condition.value}
        step="any"
        onChange={e => onUpdate('value', parseFloat(e.target.value) || 0)}
        aria-label="Threshold value"
      />

      {/* Remove */}
      <button
        className={styles.removeBtn}
        onClick={onRemove}
        disabled={!canRemove}
        aria-label="Remove condition"
        type="button"
      >
        <X size={13} />
      </button>
    </div>
  );
}

