/**
 * User store — Zustand with localStorage persistence.
 *
 * Holds user-created scanner rules and starred symbols.
 * Persisted under versioned keys to allow future migrations.
 *
 * Persistence keys:
 *   scanner:rules:v1       → ScannerRule[]
 *   scanner:starred:v1     → string[] (symbol list)
 *
 * On load: Zod validates stored data; malformed entries are silently discarded.
 * If no stored rules exist, preset rules are loaded.
 */

import { create } from 'zustand';
import { z } from 'zod';
import type { ScannerRule, RuleCondition, ComparisonOperator } from '../../../shared/src/types.js';

// ── Zod schemas ────────────────────────────────────────────────────────────────

const operatorSchema = z.enum(['>', '<', '>=', '<=', '==', '!=']) satisfies z.ZodType<ComparisonOperator>;

const conditionSchema = z.object({
  field: z.enum(['p', 'c24', 'v24', 'rsi14_1h', 'sma20_1h', 'volumeRatio20_1h']),
  operator: operatorSchema,
  value: z.number(),
}) satisfies z.ZodType<RuleCondition>;

const ruleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean(),
  logic: z.enum(['AND', 'OR']),
  conditions: z.array(conditionSchema).min(1).max(6),
}) satisfies z.ZodType<ScannerRule>;

const rulesSchema = z.array(ruleSchema);

// ── Persistence keys ───────────────────────────────────────────────────────────
const RULES_KEY = 'scanner:rules:v1';
const STARRED_KEY = 'scanner:starred:v1';

// ── Preset rules ───────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const PRESET_RULES: ScannerRule[] = [
  {
    id: generateId(),
    name: 'Oversold Bounce',
    enabled: true,
    logic: 'AND',
    conditions: [
      { field: 'rsi14_1h', operator: '<', value: 35 },
    ],
  },
  {
    id: generateId(),
    name: 'High Volume Day',
    enabled: false,
    logic: 'AND',
    conditions: [
      { field: 'volumeRatio20_1h', operator: '>', value: 1.8 },
      { field: 'c24', operator: '>', value: 3.0 },
    ],
  },
  {
    id: generateId(),
    name: 'Uptrend Pullback',
    enabled: false,
    logic: 'AND',
    conditions: [
      { field: 'c24', operator: '>', value: 0 },
      { field: 'rsi14_1h', operator: '<', value: 45 },
    ],
  },
];

// ── Load from localStorage ────────────────────────────────────────────────────

function loadRules(): ScannerRule[] {
  try {
    const raw = localStorage.getItem(RULES_KEY);
    if (!raw) return PRESET_RULES;
    const parsed = JSON.parse(raw);
    const result = rulesSchema.safeParse(parsed);
    if (!result.success) return PRESET_RULES;
    return result.data.length > 0 ? result.data : PRESET_RULES;
  } catch {
    return PRESET_RULES;
  }
}

function loadStarred(): Set<string> {
  try {
    const raw = localStorage.getItem(STARRED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((s): s is string => typeof s === 'string'));
  } catch {
    return new Set();
  }
}

// ── Persist helpers ──────────────────────────────────────────────────────────

function saveRules(rules: ScannerRule[]): void {
  try { localStorage.setItem(RULES_KEY, JSON.stringify(rules)); } catch { /* ignore */ }
}

function saveStarred(starred: Set<string>): void {
  try { localStorage.setItem(STARRED_KEY, JSON.stringify([...starred])); } catch { /* ignore */ }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export interface UserState {
  rules: ScannerRule[];
  starredSymbols: Set<string>;

  addRule: (rule: ScannerRule) => void;
  updateRule: (id: string, partial: Partial<Omit<ScannerRule, 'id'>>) => void;
  deleteRule: (id: string) => void;
  toggleRule: (id: string) => void;
  toggleStar: (symbol: string) => void;
  resetRules: () => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  rules: loadRules(),
  starredSymbols: loadStarred(),

  addRule(rule) {
    const rules = [...get().rules, rule];
    saveRules(rules);
    set({ rules });
  },

  updateRule(id, partial) {
    const rules = get().rules.map(r =>
      r.id === id ? { ...r, ...partial } : r
    );
    saveRules(rules);
    set({ rules });
  },

  deleteRule(id) {
    const rules = get().rules.filter(r => r.id !== id);
    saveRules(rules);
    set({ rules });
  },

  toggleRule(id) {
    const rules = get().rules.map(r =>
      r.id === id ? { ...r, enabled: !r.enabled } : r
    );
    saveRules(rules);
    set({ rules });
  },

  toggleStar(symbol) {
    const next = new Set(get().starredSymbols);
    if (next.has(symbol)) { next.delete(symbol); }
    else { next.add(symbol); }
    saveStarred(next);
    set({ starredSymbols: next });
  },

  resetRules() {
    const rules = PRESET_RULES.map(r => ({ ...r, id: generateId() }));
    saveRules(rules);
    set({ rules });
  },
}));

