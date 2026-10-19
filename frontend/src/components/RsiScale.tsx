/**
 * RsiScale — clean, objective visual indicator for RSI readings.
 *
 * Visualizes the 0-100 range with 30 (oversold) and 70 (overbought) reference
 * zones, highlighting the target threshold and current reading without implying
 * that a low or high value guarantees a price reversal.
 */

import React from 'react';
import styles from './RsiScale.module.css';

interface RsiScaleProps {
  currentRsi: number | undefined;
  targetThreshold?: number | undefined;
  operator?: string | undefined;
}

export function RsiScale({ currentRsi, targetThreshold, operator }: RsiScaleProps): React.ReactElement {
  if (currentRsi === undefined || Number.isNaN(currentRsi)) {
    return <div className={styles.noData}>RSI data waiting for candle history</div>;
  }

  // Constrain between 0 and 100
  const clampedCurrent = Math.max(0, Math.min(100, currentRsi));
  const clampedTarget = targetThreshold !== undefined
    ? Math.max(0, Math.min(100, targetThreshold))
    : undefined;

  return (
    <div className={styles.wrapper} aria-label={`RSI is ${currentRsi.toFixed(1)} on a 0-100 scale`}>
      <div className={styles.labels}>
        <span className={styles.zoneLabel}>0</span>
        <span className={styles.zoneMarker}>30 (OS)</span>
        <span className={styles.zoneMarker}>70 (OB)</span>
        <span className={styles.zoneLabel}>100</span>
      </div>

      <div className={styles.track}>
        {/* Oversold zone shading (0-30) */}
        <div className={styles.oversoldZone} style={{ left: '0%', width: '30%' }} />

        {/* Neutral zone (30-70) */}
        <div className={styles.neutralZone} style={{ left: '30%', width: '40%' }} />

        {/* Overbought zone shading (70-100) */}
        <div className={styles.overboughtZone} style={{ left: '70%', width: '30%' }} />

        {/* Target threshold indicator */}
        {clampedTarget !== undefined && (
          <div
            className={styles.targetMarker}
            style={{ left: `${clampedTarget}%` }}
            title={`Strategy target: ${operator ?? ''} ${targetThreshold}`}
          />
        )}

        {/* Current reading pointer */}
        <div
          className={styles.currentPointer}
          style={{ left: `${clampedCurrent}%` }}
          title={`Current RSI: ${currentRsi.toFixed(1)}`}
        />
      </div>

      <div className={styles.footer}>
        <span className={styles.currentText}>
          Current: <strong>{currentRsi.toFixed(1)}</strong>
        </span>
        {clampedTarget !== undefined && (
          <span className={styles.targetText}>
            Target: <strong>{operator} {targetThreshold}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

