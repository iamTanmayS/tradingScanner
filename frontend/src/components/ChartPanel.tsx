/**
 * ChartPanel — TradingView Lightweight Charts v5 3-Pane Technical Chart.
 *
 * Architecture:
 *   - Pane 0: Candlestick series (historical OHLC candles, adaptive precision)
 *   - Pane 1: Volume histogram series (quote volume in USDT, bullish/bearish color coding)
 *   - Pane 2: Wilder RSI-14 line series (overbought 70 and oversold 30 reference levels)
 *
 * Data pipeline:
 *   - Fetches 200 candles from Binance REST with automatic backend proxy fallback.
 *   - Computes historical RSI series using canonical Wilder smoothing from shared package.
 *   - Connects to Binance live kline WebSocket for real-time forming candle updates.
 *   - Evaluates provisional RSI on every live tick.
 *   - Preserves TradingView Lightweight Charts attribution.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts';
import {
  fetchKlinesWithFallback,
  toCandlestickData,
  toVolumeData,
  computeHistoricalRsiSeries,
  getPricePrecision,
  calculateProvisionalRsi,
  commitCandle,
  type DataSource,
  type RsiState,
} from '../chart/chartData.js';
import styles from './ChartPanel.module.css';

type Interval = '15m' | '1h' | '1d';

const BINANCE_WS_BASE = 'wss://data-stream.binance.vision/ws';

interface ChartPanelProps {
  symbol: string;
  height?: number | undefined;
}

export default function ChartPanel({ symbol, height = 480 }: ChartPanelProps): React.ReactElement {
  const [interval, setInterval] = useState<Interval>('1h');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<DataSource | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const rsiStateRef = useRef<RsiState | null>(null);
  const lastBarTimeRef = useRef<number>(0);
  const lastCommittedTimeRef = useRef<number>(0);
  const currentSymbolRef = useRef<string>(symbol);
  const currentIntervalRef = useRef<Interval>(interval);

  currentSymbolRef.current = symbol;
  currentIntervalRef.current = interval;

  // ── Allocate pane heights ──────────────────────────────────────────────────
  const applyPaneHeights = useCallback(
    (chart: IChartApi, totalHeight: number) => {
      const panes = chart.panes();
      if (panes.length >= 3) {
        const availableHeight = Math.max(300, totalHeight - 32);
        const h0 = Math.floor(availableHeight * 0.58);
        const h1 = Math.floor(availableHeight * 0.20);
        const h2 = availableHeight - h0 - h1;
        panes[0]?.setHeight(h0);
        panes[1]?.setHeight(h1);
        panes[2]?.setHeight(h2);
      }
    },
    [],
  );

  // ── Initialize Lightweight Charts v5 ───────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { color: '#0f1214' },
        textColor: '#9aa6ab',
      },
      grid: {
        vertLines: { color: '#252d31' },
        horzLines: { color: '#252d31' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        borderColor: '#252d31',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#252d31',
      },
      width: el.offsetWidth || 600,
      height,
    });

    // Pane 0 — Candlesticks
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#34d3a0',
      downColor: '#f4687a',
      borderUpColor: '#34d3a0',
      borderDownColor: '#f4687a',
      wickUpColor: '#34d3a0',
      wickDownColor: '#f4687a',
    }, 0);

    // Pane 1 — Volume Histogram
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      title: 'Volume',
    }, 1);
    chart.priceScale('right', 1).applyOptions({
      scaleMargins: { top: 0.1, bottom: 0 },
    });

    // Pane 2 — RSI-14
    const rsiSeries = chart.addSeries(LineSeries, {
      color: '#f2b84b',
      lineWidth: 2,
      title: 'RSI (14)',
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => price.toFixed(1),
      },
    }, 2);

    rsiSeries.applyOptions({
      autoscaleInfoProvider: () => ({
        priceRange: { minValue: 0, maxValue: 100 },
      }),
    });
    chart.priceScale('right', 2).applyOptions({
      autoScale: false,
    });

    // RSI Overbought / Oversold reference lines
    rsiSeries.createPriceLine({
      price: 70,
      color: 'rgba(244, 104, 122, 0.75)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '70 OB',
    });
    rsiSeries.createPriceLine({
      price: 30,
      color: 'rgba(52, 211, 160, 0.75)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '30 OS',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volSeriesRef.current = volSeries;
    rsiSeriesRef.current = rsiSeries;

    applyPaneHeights(chart, height);

    const observer = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({ width: containerRef.current.offsetWidth, height });
      applyPaneHeights(chart, height);
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volSeriesRef.current = null;
      rsiSeriesRef.current = null;
    };
  }, [height, applyPaneHeights]);

  // ── Open live forming candle WebSocket ─────────────────────────────────────
  const openLiveStream = useCallback((sym: string, ivl: Interval) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const streamUrl = `${BINANCE_WS_BASE}/${sym.toLowerCase()}@kline_${ivl}`;
    const ws = new WebSocket(streamUrl);
    wsRef.current = ws;

    ws.onmessage = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data as string) as {
          k: {
            t: number;
            s: string;
            i: string;
            o: string;
            h: string;
            l: string;
            c: string;
            q: string;
            x: boolean;
          };
        };

        const k = payload.k;
        if (!k) return;

        // Verify symbol & interval match active view
        if (k.s.toUpperCase() !== currentSymbolRef.current || k.i !== currentIntervalRef.current) {
          return;
        }

        const timeSec = Math.floor(k.t / 1000) as Time;
        const timeNum = timeSec as number;

        // Discard out-of-order timestamps
        if (timeNum < lastBarTimeRef.current) return;

        const open = parseFloat(k.o);
        const high = parseFloat(k.h);
        const low = parseFloat(k.l);
        const close = parseFloat(k.c);
        const volume = parseFloat(k.q);

        if (!Number.isFinite(close)) return;

        // Update candlestick bar
        candleSeriesRef.current?.update({
          time: timeSec,
          open,
          high,
          low,
          close,
        });

        // Update volume bar
        volSeriesRef.current?.update({
          time: timeSec,
          value: volume,
          color: close >= open ? 'rgba(52, 211, 160, 0.55)' : 'rgba(244, 104, 122, 0.55)',
        });

        // Update provisional RSI on every tick
        if (rsiStateRef.current) {
          const provRsi = calculateProvisionalRsi(rsiStateRef.current, close);
          rsiSeriesRef.current?.update({
            time: timeSec,
            value: Math.round(provRsi * 100) / 100,
          });

          // If candle is closed, commit state idempotently (once per candle timestamp)
          if (k.x && lastCommittedTimeRef.current !== timeNum) {
            rsiStateRef.current = commitCandle(rsiStateRef.current, close);
            lastCommittedTimeRef.current = timeNum;
            lastBarTimeRef.current = timeNum;
          }
        }
      } catch {
        // Discard malformed payloads
      }
    };

    ws.onerror = () => {
      // Keep silent on transient connection glitches; direct socket will retry or reconnect
    };
  }, []);

  // ── Load historical candles ────────────────────────────────────────────────
  const loadChartData = useCallback(() => {
    setLoading(true);
    setError(null);
    rsiStateRef.current = null;
    lastBarTimeRef.current = 0;
    lastCommittedTimeRef.current = 0;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const controller = new AbortController();

    fetchKlinesWithFallback(symbol, interval, 200, controller.signal)
      .then(({ klines, source }) => {
        if (!chartRef.current || !candleSeriesRef.current) return;

        setDataSource(source);

        const candleData = toCandlestickData(klines);
        const volumeData = toVolumeData(klines);
        const { rsiData, state } = computeHistoricalRsiSeries(klines, 14);

        rsiStateRef.current = state;
        const lastCandle = klines[klines.length - 1];
        lastBarTimeRef.current = lastCandle ? (lastCandle.time as number) : 0;
        lastCommittedTimeRef.current = lastCandle ? (lastCandle.time as number) : 0;

        // Dynamic price formatting
        if (lastCandle) {
          const { precision, minMove } = getPricePrecision(lastCandle.close);
          candleSeriesRef.current.applyOptions({
            priceFormat: {
              type: 'price',
              precision,
              minMove,
            },
          });
        }

        candleSeriesRef.current.setData(candleData);
        volSeriesRef.current?.setData(volumeData);
        rsiSeriesRef.current?.setData(rsiData);

        chartRef.current.timeScale().fitContent();
        setLoading(false);

        // Open live WebSocket after historical baseline is set
        openLiveStream(symbol, interval);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        console.error('[ChartPanel] Candle load error:', err);
        candleSeriesRef.current?.setData([]);
        volSeriesRef.current?.setData([]);
        rsiSeriesRef.current?.setData([]);
        setDataSource(null);
        setError('Failed to load chart candles. Click Retry to reload.');
        setLoading(false);
      });

    return () => {
      controller.abort();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol, interval, openLiveStream]);

  useEffect(() => {
    const cleanup = loadChartData();
    return () => cleanup?.();
  }, [loadChartData]);

  return (
    <div className={styles.wrapper}>
      {/* Top Header Controls & Status */}
      <div className={styles.topBar}>
        <div className={styles.controls} role="group" aria-label="Timeframe intervals">
          {(['15m', '1h', '1d'] as Interval[]).map((ivl) => (
            <button
              key={ivl}
              className={`${styles.ivlBtn} ${interval === ivl ? styles.ivlActive : ''}`}
              onClick={() => setInterval(ivl)}
              aria-pressed={interval === ivl}
            >
              {ivl}
            </button>
          ))}
        </div>

        <div className={styles.statusGroup}>
          {dataSource && !error && (
            <div className={styles.sourceBadge} title={`Data feed source: ${dataSource}`}>
              <span
                className={`${styles.pulseDot} ${
                  dataSource === 'binance-direct' ? styles.direct : styles.proxy
                }`}
              />
              <span>
                {dataSource === 'binance-direct' ? 'Live (Direct)' : 'Live (Proxy Fallback)'}
              </span>
            </div>
          )}
          {error && (
            <div className={styles.sourceBadge}>
              <span className={`${styles.pulseDot} ${styles.error}`} />
              <span>Offline</span>
            </div>
          )}
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className={styles.container}>
        <div ref={containerRef} className={styles.chart} />

        {loading && <div className={styles.overlay}>Loading technical chart data…</div>}

        {error && (
          <div className={styles.overlay}>
            <span>{error}</span>
            <button className={styles.retryBtn} onClick={loadChartData}>
              Retry Connection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
