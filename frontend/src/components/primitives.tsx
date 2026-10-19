/**
 * Primitive UI components.
 *
 * These are building blocks — no business logic, no store access.
 * All accept className for extension.
 */

import React from 'react';
import styles from './primitives.module.css';

// ── StatusDot ─────────────────────────────────────────────────────────────────

interface StatusDotProps {
  status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
}

export function StatusDot({ status }: StatusDotProps): React.ReactElement {
  return <span className={`${styles.dot} ${styles[`dot--${status}`]}`} aria-hidden="true" />;
}

// ── Chip ─────────────────────────────────────────────────────────────────────

interface ChipProps {
  children: React.ReactNode;
  variant?: 'neutral' | 'gain' | 'loss' | 'signal';
}

export function Chip({ children, variant = 'neutral' }: ChipProps): React.ReactElement {
  return <span className={`${styles.chip} ${styles[`chip--${variant}`]}`}>{children}</span>;
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface PanelProps {
  title: string;
  className?: string;
  children: React.ReactNode;
}

export function Panel({ title, className, children }: PanelProps): React.ReactElement {
  return (
    <div className={`${styles.panel} ${className ?? ''}`}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>{title}</span>
      </div>
      <div className={styles.panelBody}>{children}</div>
    </div>
  );
}

// ── SegmentedControl ──────────────────────────────────────────────────────────

interface SegmentOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
}

export function SegmentedControl({ options, value, onChange }: SegmentedControlProps): React.ReactElement {
  return (
    <div className={styles.segmented} role="tablist">
      {options.map(opt => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={opt.value === value}
          className={`${styles.segmentedBtn} ${opt.value === value ? styles['segmentedBtn--active'] : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

export function Spinner(): React.ReactElement {
  return <span className={styles.spinner} aria-label="Loading" />;
}

// ── EmptyState ────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  message: string;
  hint?: string;
}

export function EmptyState({ message, hint }: EmptyStateProps): React.ReactElement {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyMessage}>{message}</p>
      {hint && <p className={styles.emptyHint}>{hint}</p>}
    </div>
  );
}

