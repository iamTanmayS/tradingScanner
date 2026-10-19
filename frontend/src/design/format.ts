/**
 * Formatting utilities for numeric display values.
 *
 * All functions return a string. When the input is unavailable (undefined, NaN,
 * non-finite, etc.) they return an em dash '—' — never '0' or a fabricated value.
 *
 * These are pure functions with no React dependency. They can be unit-tested
 * without rendering any component.
 */

/** Returned when a value is unavailable or cannot be displayed meaningfully. */
export const UNAVAILABLE = '—';

/**
 * Returns true when a number is safe to display: defined, finite, not NaN.
 */
function isValid(n: number | undefined | null): n is number {
  return n !== undefined && n !== null && Number.isFinite(n) && !Number.isNaN(n);
}

/**
 * Formats a price with dynamic decimal precision.
 *
 * - < 0.01    → 6 decimal places  (e.g. $0.000043)
 * - < 1       → 4 decimal places  (e.g. $0.7821)
 * - < 1000    → 2 decimal places  (e.g. $42.85)
 * - >= 1000   → 2 decimal places with thousands separator (e.g. $82,786.01)
 *
 * Returns '—' for unavailable values.
 */
export function formatPrice(price: number | undefined): string {
  if (!isValid(price)) return UNAVAILABLE;

  if (price < 0.01) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  }
  if (price < 1) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Formats a percentage change with sign prefix.
 *
 * Examples:  +3.45%   −1.20%   0.00%
 * Returns '—' for unavailable values.
 */
export function formatPct(pct: number | undefined): string {
  if (!isValid(pct)) return UNAVAILABLE;

  const formatted = Math.abs(pct).toFixed(2);
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${formatted}%`;
}

/**
 * Formats a 24-hour USDT volume in compact form.
 *
 * Scale:  B (billions), M (millions), K (thousands).
 * Always shows 2 significant decimals.
 *
 * Examples:  $1.23B   $456.78M   $12.34K   $987.00
 * Returns '—' for unavailable values.
 */
export function formatVolume(volume: number | undefined): string {
  if (!isValid(volume)) return UNAVAILABLE;

  const abs = Math.abs(volume);
  if (abs >= 1e9) return `$${(volume / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(volume / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(volume / 1e3).toFixed(2)}K`;
  return `$${volume.toFixed(2)}`;
}

/**
 * Formats a volume ratio (e.g. 2.50×).
 *
 * A value of 1.00 means exactly average; >1 means above average.
 * Returns '—' for unavailable values.
 */
export function formatRatio(ratio: number | undefined): string {
  if (!isValid(ratio)) return UNAVAILABLE;
  return `${ratio.toFixed(2)}×`;
}

/**
 * Formats an RSI value to 1 decimal place.
 *
 * Returns '—' for unavailable values.
 */
export function formatRsi(rsi: number | undefined): string {
  if (!isValid(rsi)) return UNAVAILABLE;
  return rsi.toFixed(1);
}

/**
 * Formats an SMA price level with the same logic as formatPrice.
 */
export function formatSma(sma: number | undefined): string {
  return formatPrice(sma);
}

/**
 * Returns the em dash placeholder for an unavailable indicator.
 * Use this to make call sites self-documenting.
 */
export function formatUnavailable(): string {
  return UNAVAILABLE;
}

/**
 * Computes "% distance from SMA" — how far the current price is above or
 * below the 20-period SMA.
 *
 * Formula: ((price / sma) - 1) * 100
 *
 * Returns undefined when price or sma are unavailable, or when sma is 0.
 * The consumer should call formatPct(computeDsma(...)) for display.
 */
export function computeDsma(
  price: number | undefined,
  sma: number | undefined
): number | undefined {
  if (!isValid(price) || !isValid(sma) || sma === 0 || price === 0) return undefined;
  return ((price / sma) - 1) * 100;
}

/**
 * Returns a CSS class name based on a percentage change value.
 *
 * Positive → 'gain'
 * Negative → 'loss'
 * Zero / unavailable → '' (no class)
 */
export function pctClass(pct: number | undefined): string {
  if (!isValid(pct)) return '';
  if (pct > 0) return 'gain';
  if (pct < 0) return 'loss';
  return '';
}

