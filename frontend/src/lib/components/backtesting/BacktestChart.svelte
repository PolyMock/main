<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { BacktestResult } from '$lib/backtesting/types';

	let { backtestResult }: { backtestResult: BacktestResult } = $props();

	let equityEl: HTMLDivElement;
	let drawdownEl: HTMLDivElement;
	let tradesEl: HTMLDivElement;

	let equityChart: any = null;
	let drawdownChart: any = null;
	let tradesChart: any = null;

	// ── Data builders ──────────────────────────────────────────────────────

	function buildEquityData() {
		const curve = backtestResult.metrics.equityCurve;
		if (curve && curve.length > 0) {
			const seen = new Set<string>();
			const data: { time: string; value: number }[] = [];
			for (const point of curve) {
				const t = fmtDay(point.timestamp);
				if (seen.has(t)) {
					data[data.length - 1].value = point.equity;
				} else {
					seen.add(t);
					data.push({ time: t, value: point.equity });
				}
			}
			return data;
		}
		// Fallback: build from trades
		const trades = [...backtestResult.trades]
			.filter((t) => t.entryTime)
			.sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());
		let equity = backtestResult.startingCapital;
		const data: { time: string; value: number }[] = [
			{ time: fmtDay(backtestResult.strategyConfig.startDate), value: equity },
		];
		for (const trade of trades) {
			equity -= trade.amountInvested || 0;
			const t = fmtDay(trade.entryTime);
			if (data.length > 0 && data[data.length - 1].time === t) {
				data[data.length - 1].value = equity;
			} else {
				data.push({ time: t, value: equity });
			}
		}
		return data;
	}

	function buildDrawdownData() {
		const equityData = buildEquityData();
		let peak = equityData[0]?.value ?? backtestResult.startingCapital;
		return equityData.map((d) => {
			if (d.value > peak) peak = d.value;
			const dd = peak > 0 ? -((peak - d.value) / peak) * 100 : 0;
			return { time: d.time, value: dd };
		});
	}

	function buildTradeVolumeData() {
		// Cumulative trade count per day + cost histogram
		const trades = [...backtestResult.trades]
			.filter((t) => t.entryTime)
			.sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

		const dailyMap = new Map<string, { count: number; cost: number }>();
		for (const t of trades) {
			const day = fmtDay(t.entryTime);
			const entry = dailyMap.get(day) || { count: 0, cost: 0 };
			entry.count++;
			entry.cost += t.amountInvested || 0;
			dailyMap.set(day, entry);
		}

		let cumulative = 0;
		const lineData: { time: string; value: number }[] = [];
		const barData: { time: string; value: number; color: string }[] = [];
		for (const [day, info] of dailyMap) {
			cumulative += info.count;
			lineData.push({ time: day, value: cumulative });
			barData.push({
				time: day,
				value: info.cost,
				color: 'rgba(249, 115, 22, 0.5)',
			});
		}
		return { lineData, barData };
	}

	function fmtDay(d: Date | string): string {
		const date = new Date(d);
		const y = date.getUTCFullYear();
		const m = String(date.getUTCMonth() + 1).padStart(2, '0');
		const day = String(date.getUTCDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	}

	// ── Chart theme ────────────────────────────────────────────────────────

	function chartOpts(lc: any, el: HTMLElement, height: number) {
		return {
			width: el.clientWidth,
			height,
			layout: {
				background: { type: lc.ColorType.Solid, color: '#0a0a0a' },
				textColor: '#ccc',
				fontFamily: "'Share Tech Mono', monospace",
				fontSize: 10,
			},
			grid: {
				vertLines: { color: 'rgba(255,255,255,0.06)' },
				horzLines: { color: 'rgba(255,255,255,0.06)' },
			},
			crosshair: {
				mode: lc.CrosshairMode.Normal,
				vertLine: { color: 'rgba(249,115,22,0.3)', width: 1, style: lc.LineStyle.Dashed, labelBackgroundColor: '#f97316' },
				horzLine: { color: 'rgba(249,115,22,0.3)', width: 1, style: lc.LineStyle.Dashed, labelBackgroundColor: '#f97316' },
			},
			rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)', scaleMargins: { top: 0.08, bottom: 0.08 } },
			timeScale: { borderColor: 'rgba(255,255,255,0.1)', timeVisible: false, rightOffset: 3 },
			handleScroll: { vertTouchDrag: false },
		};
	}

	// ── Init ───────────────────────────────────────────────────────────────

	async function initCharts() {
		if (!browser || !equityEl || !drawdownEl || !tradesEl) return;

		const lc = await import('lightweight-charts');
		const equityData = buildEquityData();
		if (equityData.length < 2) return;

		const drawdownData = buildDrawdownData();
		const tradeVol = buildTradeVolumeData();
		const isProfitable = backtestResult.endingCapital >= backtestResult.startingCapital;

		// ── Chart 1: Equity Curve ────────────────────────────────────────
		equityChart = lc.createChart(equityEl, chartOpts(lc, equityEl, equityEl.clientHeight || 200));

		const eqSeries = equityChart.addSeries(lc.AreaSeries, {
			lineColor: isProfitable ? '#26a65b' : '#ef5350',
			topColor: isProfitable ? 'rgba(38,166,91,0.18)' : 'rgba(239,83,80,0.18)',
			bottomColor: 'rgba(0,0,0,0)',
			lineWidth: 2,
			crosshairMarkerVisible: true,
			crosshairMarkerRadius: 3,
			crosshairMarkerBorderColor: '#f97316',
			crosshairMarkerBackgroundColor: '#000',
			priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
		});
		eqSeries.setData(equityData);

		// Baseline at initial capital
		const blSeries = equityChart.addSeries(lc.LineSeries, {
			color: 'rgba(249,115,22,0.25)',
			lineWidth: 1,
			lineStyle: lc.LineStyle.Dashed,
			priceLineVisible: false,
			lastValueVisible: false,
			crosshairMarkerVisible: false,
		});
		blSeries.setData(equityData.map((d) => ({ time: d.time, value: backtestResult.startingCapital })));

		equityChart.timeScale().fitContent();

		// ── Chart 2: Drawdown ────────────────────────────────────────────
		drawdownChart = lc.createChart(drawdownEl, chartOpts(lc, drawdownEl, drawdownEl.clientHeight || 200));

		const ddSeries = drawdownChart.addSeries(lc.AreaSeries, {
			lineColor: '#ef5350',
			topColor: 'rgba(239,83,80,0.02)',
			bottomColor: 'rgba(239,83,80,0.25)',
			lineWidth: 1.5,
			priceFormat: { type: 'percent' },
			crosshairMarkerVisible: true,
			crosshairMarkerRadius: 3,
			crosshairMarkerBorderColor: '#ef5350',
			crosshairMarkerBackgroundColor: '#000',
		});
		ddSeries.setData(drawdownData);

		drawdownChart.timeScale().fitContent();

		// ── Chart 3: Trade Activity ──────────────────────────────────────
		tradesChart = lc.createChart(tradesEl, chartOpts(lc, tradesEl, tradesEl.clientHeight || 200));

		// Cost histogram
		if (tradeVol.barData.length > 0) {
			const histSeries = tradesChart.addSeries(lc.HistogramSeries, {
				priceFormat: { type: 'price', precision: 0, minMove: 1 },
				priceScaleId: 'cost',
			});
			histSeries.setData(tradeVol.barData);
			tradesChart.priceScale('cost').applyOptions({
				scaleMargins: { top: 0.4, bottom: 0 },
				borderVisible: false,
			});
		}

		// Cumulative trade count line
		if (tradeVol.lineData.length > 0) {
			const lineSeries = tradesChart.addSeries(lc.LineSeries, {
				color: '#f97316',
				lineWidth: 2,
				priceFormat: { type: 'price', precision: 0, minMove: 1 },
				crosshairMarkerVisible: true,
				crosshairMarkerRadius: 3,
				crosshairMarkerBorderColor: '#f97316',
				crosshairMarkerBackgroundColor: '#000',
			});
			lineSeries.setData(tradeVol.lineData);
		}

		tradesChart.timeScale().fitContent();

		// ── Resize observer ──────────────────────────────────────────────
		const ro = new ResizeObserver(() => {
			if (equityEl && equityChart) equityChart.applyOptions({ width: equityEl.clientWidth, height: equityEl.clientHeight });
			if (drawdownEl && drawdownChart) drawdownChart.applyOptions({ width: drawdownEl.clientWidth, height: drawdownEl.clientHeight });
			if (tradesEl && tradesChart) tradesChart.applyOptions({ width: tradesEl.clientWidth, height: tradesEl.clientHeight });
		});
		ro.observe(equityEl);
		ro.observe(drawdownEl);
		ro.observe(tradesEl);
	}

	onMount(() => {
		if (browser) setTimeout(() => initCharts(), 100);
	});

	onDestroy(() => {
		equityChart?.remove();
		drawdownChart?.remove();
		tradesChart?.remove();
		equityChart = null;
		drawdownChart = null;
		tradesChart = null;
	});

	const m = $derived(backtestResult.metrics);
	const isProfitable = $derived(backtestResult.endingCapital >= backtestResult.startingCapital);
</script>

<div class="charts-row">
	<!-- Chart 1: Equity -->
	<div class="chart-card">
		<div class="chart-head">
			<span class="chart-label">EQUITY CURVE</span>
			<span class="chart-val" class:positive={isProfitable} class:negative={!isProfitable}>
				${backtestResult.endingCapital.toLocaleString(undefined, { maximumFractionDigits: 2 })}
			</span>
		</div>
		<div class="chart-body" bind:this={equityEl}></div>
		<div class="chart-foot">
			<span>Initial <b>${backtestResult.startingCapital.toLocaleString()}</b></span>
			<span class:positive={isProfitable} class:negative={!isProfitable}>
				ROI <b>{m.roi >= 0 ? '+' : ''}{m.roi.toFixed(2)}%</b>
			</span>
		</div>
	</div>

	<div class="chart-separator"></div>

	<!-- Chart 2: Drawdown -->
	<div class="chart-card">
		<div class="chart-head">
			<span class="chart-label">DRAWDOWN</span>
			<span class="chart-val negative">
				-{m.maxDrawdownPercentage.toFixed(2)}%
			</span>
		</div>
		<div class="chart-body" bind:this={drawdownEl}></div>
		<div class="chart-foot">
			<span>Max DD <b class="negative">${m.maxDrawdown.toFixed(2)}</b></span>
			<span>Sharpe <b>{m.sharpeRatio.toFixed(2)}</b></span>
		</div>
	</div>

	<div class="chart-separator"></div>

	<!-- Chart 3: Trade Activity -->
	<div class="chart-card">
		<div class="chart-head">
			<span class="chart-label">TRADE ACTIVITY</span>
			<span class="chart-val">{m.totalTrades} trades</span>
		</div>
		<div class="chart-body" bind:this={tradesEl}></div>
		<div class="chart-foot">
			<span>Win Rate <b class:positive={m.winRate >= 50} class:negative={m.winRate < 50}>{m.winRate.toFixed(1)}%</b></span>
			<span>Exec <b>{(backtestResult.executionTime / 1000).toFixed(2)}s</b></span>
		</div>
	</div>
</div>

<style>
	.charts-row {
		display: flex;
		gap: 0;
		background: #000;
		flex-shrink: 0;
		border-bottom: 1px solid #1a1a1a;
		padding: 12px 16px;
	}

	.chart-card {
		flex: 1;
		min-width: 0;
		background: #0f0f0f;
		display: flex;
		flex-direction: column;
		border: 1px solid #1a1a1a;
		border-radius: 8px;
		overflow: hidden;
	}

	.chart-separator {
		width: 12px;
		flex-shrink: 0;
	}

	.chart-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 14px;
		border-bottom: 1px solid #1a1a1a;
		background: #0a0a0a;
	}

	.chart-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 10px;
		font-weight: 700;
		color: #f97316;
		letter-spacing: 1.5px;
	}

	.chart-val {
		font-family: 'Share Tech Mono', monospace;
		font-size: 12px;
		color: #ddd;
		font-weight: 600;
	}

	.chart-body {
		width: 100%;
		flex: 1;
		min-height: 0;
	}

	.chart-foot {
		display: flex;
		justify-content: space-between;
		padding: 8px 14px;
		font-family: 'Share Tech Mono', monospace;
		font-size: 10px;
		color: #aaa;
		border-top: 1px solid #1a1a1a;
		background: #0a0a0a;
	}

	.chart-foot b {
		color: #ddd;
		font-weight: 600;
	}

	.positive { color: #26a65b !important; }
	.negative { color: #ef5350 !important; }

	@media (max-width: 900px) {
		.charts-row {
			flex-direction: column;
			gap: 8px;
		}
		.chart-separator { display: none; }
	}
</style>
