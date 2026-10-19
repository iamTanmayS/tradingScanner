/**
 * RulesBar — compact panel listing all user rules with enable/disable toggles.
 * Has a "New Rule" button that opens the RuleBuilder modal.
 */

import React, { useState } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import type { ScannerRule } from '../../../shared/src/types.js';
import { useUserStore } from '../state/userStore.js';
import { RuleBuilder } from './RuleBuilder.js';
import styles from './RulesBar.module.css';

export function RulesBar(): React.ReactElement {
  const rules      = useUserStore(s => s.rules);
  const toggleRule = useUserStore(s => s.toggleRule);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ScannerRule | null>(null);

  const openNew  = () => { setEditingRule(null); setBuilderOpen(true); };
  const openEdit = (rule: ScannerRule) => { setEditingRule(rule); setBuilderOpen(true); };
  const closeBuilder = () => setBuilderOpen(false);

  return (
    <>
      <div className={styles.bar}>
        <span className={styles.label}>Scanner Rules</span>
        <div className={styles.chips}>
          {rules.map(rule => (
            <div key={rule.id} className={styles.ruleChip}>
              <button
                className={`${styles.toggleBtn} ${rule.enabled ? styles.on : styles.off}`}
                onClick={() => toggleRule(rule.id)}
                title={rule.enabled ? 'Disable rule' : 'Enable rule'}
              >
                <span className={styles.toggleDot} />
              </button>
              <span
                className={`${styles.ruleName} ${!rule.enabled ? styles.ruleNameOff : ''}`}
                onClick={() => openEdit(rule)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && openEdit(rule)}
                title="Click to edit"
              >
                {rule.name}
              </span>
              <button
                className={styles.editBtn}
                onClick={() => openEdit(rule)}
                aria-label={`Edit ${rule.name}`}
              >
                <Settings2 size={11} />
              </button>
            </div>
          ))}
        </div>
        <button className={styles.newBtn} onClick={openNew} aria-label="New scanner rule">
          <Plus size={13} /> New Rule
        </button>
      </div>

      {builderOpen && (
        <RuleBuilder editingRule={editingRule} onClose={closeBuilder} />
      )}
    </>
  );
}

