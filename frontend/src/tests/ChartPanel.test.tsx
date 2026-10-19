/**
 * ChartPanel.test.tsx — Unit and integration tests for ChartPanel component.
 */

import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChartPanel from '../components/ChartPanel.js';
import * as chartData from '../chart/chartData.js';

// Mock lightweight-charts
vi.mock('lightweight-charts', () => {
  return {
    createChart: () => ({
      addSeries: vi.fn(() => ({
        setData: vi.fn(),
        update: vi.fn(),
        applyOptions: vi.fn(),
        createPriceLine: vi.fn(),
      })),
      panes: vi.fn(() => [
        { setHeight: vi.fn(), getHeight: () => 150, paneIndex: () => 0 },
        { setHeight: vi.fn(), getHeight: () => 150, paneIndex: () => 1 },
        { setHeight: vi.fn(), getHeight: () => 150, paneIndex: () => 2 },
      ]),
      priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
      timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
      applyOptions: vi.fn(),
      remove: vi.fn(),
    }),
    CandlestickSeries: {},
    HistogramSeries: {},
    LineSeries: {},
    LineStyle: { Dashed: 2, Dotted: 1, Solid: 0 },
    CrosshairMode: { Normal: 0 },
  };
});

describe('ChartPanel', () => {
  beforeEach(() => {
    // Default mock implementation of fetchKlinesWithFallback
    vi.spyOn(chartData, 'fetchKlinesWithFallback').mockResolvedValue({
      klines: [
        { time: 100 as any, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { time: 200 as any, open: 105, high: 115, low: 100, close: 110, volume: 1200 },
      ],
      source: 'binance-direct',
    });
  });

  it('renders timeframe interval buttons', async () => {
    await act(async () => {
      render(<ChartPanel symbol="BTCUSDT" />);
    });

    expect(screen.getByText('15m')).toBeInTheDocument();
    expect(screen.getByText('1h')).toBeInTheDocument();
    expect(screen.getByText('1d')).toBeInTheDocument();

    const btn1h = screen.getByText('1h');
    expect(btn1h.getAttribute('aria-pressed')).toBe('true');
  });

  it('switches interval when interval button is clicked', async () => {
    await act(async () => {
      render(<ChartPanel symbol="BTCUSDT" />);
    });

    const btn15m = screen.getByText('15m');
    await act(async () => {
      fireEvent.click(btn15m);
    });

    expect(btn15m.getAttribute('aria-pressed')).toBe('true');
    expect(chartData.fetchKlinesWithFallback).toHaveBeenCalledWith(
      'BTCUSDT',
      '15m',
      200,
      expect.any(AbortSignal),
    );
  });

  it('displays Live (Direct) data badge upon successful direct load', async () => {
    await act(async () => {
      render(<ChartPanel symbol="BTCUSDT" />);
    });

    await waitFor(() => {
      expect(screen.getByText('Live (Direct)')).toBeInTheDocument();
    });
  });

  it('displays Live (Proxy Fallback) when fallback source is reported', async () => {
    vi.spyOn(chartData, 'fetchKlinesWithFallback').mockResolvedValueOnce({
      klines: [
        { time: 100 as any, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
      ],
      source: 'backend-proxy',
    });

    await act(async () => {
      render(<ChartPanel symbol="ETHUSDT" />);
    });

    await waitFor(() => {
      expect(screen.getByText('Live (Proxy Fallback)')).toBeInTheDocument();
    });
  });

  it('displays error overlay with Retry button when candle load fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(chartData, 'fetchKlinesWithFallback').mockRejectedValueOnce(
      new Error('Network down'),
    );

    await act(async () => {
      render(<ChartPanel symbol="BTCUSDT" />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Failed to load chart candles/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });
});

