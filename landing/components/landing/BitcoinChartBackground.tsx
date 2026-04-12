"use client";

import { useEffect, useRef } from "react";
import type { UTCTimestamp } from "lightweight-charts";

/** Matches `globals.css` `--bg` */
const CHART_BG = "#0b0b0b";
const BINANCE_WS = "wss://stream.binance.com:9443/ws/btcusdt@kline_1m";
const BINANCE_KLINES =
  "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=400";

type Candle = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

type CoinbaseRow = [number, number, number, number, number, number];

function mapBinanceKlines(rows: unknown[]): Candle[] {
  const out: Candle[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const t = row[0];
    if (typeof t !== "number") continue;
    out.push({
      time: Math.floor(t / 1000) as UTCTimestamp,
      open: parseFloat(String(row[1])),
      high: parseFloat(String(row[2])),
      low: parseFloat(String(row[3])),
      close: parseFloat(String(row[4])),
    });
  }
  return out.sort((a, b) => a.time - b.time);
}

function mapCoinbaseCandles(rows: CoinbaseRow[]): Candle[] {
  const sorted = [...rows].sort((a, b) => a[0] - b[0]);
  return sorted.map((c) => ({
    time: c[0] as UTCTimestamp,
    open: c[3],
    high: c[2],
    low: c[1],
    close: c[4],
  }));
}

async function fetchInitialCandles(): Promise<Candle[]> {
  try {
    const res = await fetch(BINANCE_KLINES, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return mapBinanceKlines(data);
    }
  } catch {
    /* Binance REST may be blocked by CORS in some environments */
  }

  try {
    const res = await fetch(
      "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60",
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as CoinbaseRow[];
    if (!Array.isArray(data) || data.length === 0) return [];
    return mapCoinbaseCandles(data);
  } catch {
    return [];
  }
}

function connectBinanceKlineStream(
  series: import("lightweight-charts").ISeriesApi<"Candlestick">,
  getCancelled: () => boolean
) {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  const clearReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const open = () => {
    if (getCancelled()) return;
    clearReconnect();
    ws = new WebSocket(BINANCE_WS);

    ws.onmessage = (ev) => {
      if (getCancelled()) return;
      try {
        const msg = JSON.parse(ev.data as string) as { k?: Record<string, string | number | boolean> };
        const k = msg.k;
        if (!k || typeof k.t !== "number") return;
        const time = Math.floor(k.t / 1000) as UTCTimestamp;
        series.update({
          time,
          open: parseFloat(String(k.o)),
          high: parseFloat(String(k.h)),
          low: parseFloat(String(k.l)),
          close: parseFloat(String(k.c)),
        });
      } catch {
        /* malformed tick */
      }
    };

    ws.onopen = () => {
      attempt = 0;
    };

    const scheduleReconnect = () => {
      if (getCancelled()) return;
      const delay = Math.min(30_000, 800 * Math.pow(2, attempt));
      attempt += 1;
      reconnectTimer = setTimeout(open, delay);
    };

    ws.onclose = () => {
      ws = null;
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws?.close();
    };
  };

  open();

  return () => {
    clearReconnect();
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    if (ws && ws.readyState === WebSocket.CONNECTING) ws.close();
    ws = null;
  };
}

export default function BitcoinChartBackground() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    let cancelled = false;
    const getCancelled = () => cancelled;
    const chartBox = { current: null as import("lightweight-charts").IChartApi | null };
    let ro: ResizeObserver | null = null;
    let detachWindowResize: (() => void) | null = null;
    let disconnectWs: (() => void) | null = null;

    const resize = () => {
      const c = chartBox.current;
      if (!el || !c) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) c.resize(w, h);
    };

    import("lightweight-charts").then((lc) => {
      if (cancelled || !wrapRef.current) return;

      const chart = lc.createChart(el, {
        width: el.clientWidth,
        height: el.clientHeight,
        layout: {
          background: { type: lc.ColorType.Solid, color: CHART_BG },
          textColor: "transparent",
          attributionLogo: false,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false },
        },
        rightPriceScale: { visible: false },
        leftPriceScale: { visible: false },
        timeScale: {
          visible: false,
          borderVisible: false,
        },
        crosshair: {
          mode: lc.CrosshairMode.Hidden,
        },
        handleScroll: {
          mouseWheel: false,
          pressedMouseMove: false,
          horzTouchDrag: false,
          vertTouchDrag: false,
        },
        handleScale: {
          axisPressedMouseMove: false,
          mouseWheel: false,
          pinch: false,
        },
      });
      chartBox.current = chart;

      const series = chart.addSeries(lc.CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderVisible: false,
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });

      fetchInitialCandles().then((candles) => {
        if (cancelled || !chartBox.current) return;
        if (candles.length > 0) {
          series.setData(candles);
          chartBox.current.timeScale().fitContent();
        }
        if (getCancelled() || !chartBox.current) return;
        disconnectWs = connectBinanceKlineStream(series, getCancelled);
      });

      ro = new ResizeObserver(resize);
      ro.observe(el);
      window.addEventListener("resize", resize);
      detachWindowResize = () => window.removeEventListener("resize", resize);
    });

    return () => {
      cancelled = true;
      disconnectWs?.();
      ro?.disconnect();
      detachWindowResize?.();
      chartBox.current?.remove();
      chartBox.current = null;
    };
  }, []);

  return (
    <>
      <div ref={wrapRef} className="bitcoin-chart-bg" aria-hidden />
      <div
        className="bitcoin-chart-bg-label"
        role="note"
        aria-label="Live Bitcoin BTC versus US dollar, one minute candlesticks"
      >
        <span className="bitcoin-chart-bg-label-title">Bitcoin</span>
        <span className="bitcoin-chart-bg-label-meta">BTC / USD · 1m candles · live</span>
      </div>
    </>
  );
}
