<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	export let markets: Array<{ tokenId: string; label: string; color?: string }> = [];

	type Interval = '1h' | '6h' | '1d' | '1w' | '1m';

	const INTERVALS: { value: Interval; label: string }[] = [
		{ value: '1h', label: '1H' },
		{ value: '6h', label: '6H' },
		{ value: '1d', label: '1D' },
		{ value: '1w', label: '1W' },
		{ value: '1m', label: '1M' },
	];

	const COLORS = [
		'#F97316', '#10b981', '#3b82f6', '#a855f7',
		'#f59e0b', '#ef4444', '#06b6d4', '#84cc16',
		'#ec4899', '#14b8a6', '#8b5cf6', '#f43f5e',
	];

	let chartEl: HTMLDivElement;
	let chart: any = null;
	// seriesMap: tokenId → { series, label, color }
	let seriesMap: Map<string, { series: any; label: string; color: string }> = new Map();
	let selectedInterval: Interval = '1m';
	let loading = false;
	let error = '';

	const cache: Map<string, any[]> = new Map();

	// ── Tooltip state ────────────────────────────────────────────────────────────
	let tooltipVisible = false;
	let tooltipX = 0;
	let tooltipY = 0;
	let tooltipDate = '';
	let tooltipItems: { color: string; label: string; value: string }[] = [];

	async function fetchOHLC(tokenId: string, interval: Interval): Promise<any[]> {
		const key = `${tokenId}:${interval}`;
		if (cache.has(key)) return cache.get(key)!;

		const res = await fetch(`/api/pricehistory/${tokenId}?interval=${interval}`);
		const data = await res.json();
		if (!data.success) throw new Error(data.error ?? 'Failed');

		const ohlc: any[] = (data.response?.ohlc ?? [])
			.map((c: any) => ({
				time: c.time as number,
				close: Math.round(c.close * 10000) / 10000,
			}))
			.sort((a: any, b: any) => a.time - b.time);

		const seen = new Set<number>();
		const deduped = ohlc.filter(c => {
			if (seen.has(c.time)) return false;
			seen.add(c.time);
			return true;
		});

		cache.set(key, deduped);
		return deduped;
	}

	async function initChart() {
		if (!browser || !chartEl) return;
		const lc = await import('lightweight-charts');

		chart = lc.createChart(chartEl, {
			layout: {
				background: { color: '#000' },
				textColor: '#555',
			},
			grid: {
				vertLines: { color: '#0d0d0d' },
				horzLines: { color: '#0d0d0d' },
			},
			crosshair: {
				mode: 1,
				vertLine: { color: '#333', width: 1, style: 1 },
				horzLine: { color: '#333', width: 1, style: 1 },
			},
			rightPriceScale: {
				borderColor: '#1a1a1a',
				scaleMargins: { top: 0.08, bottom: 0.08 },
				ticksVisible: true,
			},
			timeScale: {
				borderColor: '#1a1a1a',
				timeVisible: true,
				secondsVisible: false,
				barSpacing: 6,
				fixLeftEdge: true,
				fixRightEdge: true,
			},
			handleScroll: true,
			handleScale: true,
			width: chartEl.clientWidth,
			height: chartEl.clientHeight || 360,
		});

		const ro = new ResizeObserver(() => {
			if (chart && chartEl) {
				chart.applyOptions({
					width: chartEl.clientWidth,
					height: chartEl.clientHeight || 360,
				});
			}
		});
		ro.observe(chartEl);

		// ── Crosshair tooltip ─────────────────────────────────────────────────────
		chart.subscribeCrosshairMove((param: any) => {
			if (
				!param.point ||
				param.point.x === undefined ||
				param.point.y === undefined ||
				!param.time ||
				param.point.x < 0 ||
				param.point.y < 0
			) {
				tooltipVisible = false;
				return;
			}

			// Format date
			const d = new Date(param.time * 1000);
			tooltipDate = d.toLocaleDateString('en-US', {
				month: 'short', day: 'numeric', year: 'numeric',
			});

			// Collect all series values at this crosshair time
			const items: typeof tooltipItems = [];
			for (const [, entry] of seriesMap) {
				const raw = param.seriesData?.get(entry.series);
				if (raw == null) continue;
				const val = typeof raw === 'object' && 'value' in raw
					? (raw as any).value
					: typeof raw === 'number' ? raw : null;
				if (val == null) continue;
				items.push({
					color: entry.color,
					label: entry.label,
					value: (val * 100).toFixed(1) + '%',
				});
			}

			// Sort descending by value
			items.sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
			tooltipItems = items;

			if (items.length === 0) { tooltipVisible = false; return; }

			// Position: right of cursor unless too close to right edge
			const cw = chartEl.clientWidth;
			const ttWidth = 210;
			tooltipX = param.point.x + 18 + ttWidth > cw
				? param.point.x - ttWidth - 8
				: param.point.x + 18;
			tooltipY = Math.max(param.point.y - 20, 4);
			tooltipVisible = true;
		});

		await createSeries();
	}

	// Create series once — never remove them, only swap data
	async function createSeries() {
		if (!chart || !markets.length) return;
		loading = true;
		error = '';
		tooltipVisible = false;

		try {
			const lc = await import('lightweight-charts');

			// Remove stale series if markets prop changed
			for (const entry of seriesMap.values()) {
				try { chart.removeSeries(entry.series); } catch {}
			}
			seriesMap.clear();

			// Create one persistent line series per market
			for (let i = 0; i < markets.length; i++) {
				const m = markets[i];
				const color = m.color ?? COLORS[i % COLORS.length];

				const series = chart.addSeries(lc.LineSeries, {
					color,
					lineWidth: 2,
					priceLineVisible: false,
					lastValueVisible: false,
					crosshairMarkerVisible: true,
					crosshairMarkerRadius: 4,
					crosshairMarkerBorderColor: '#000',
					crosshairMarkerBackgroundColor: color,
					priceFormat: {
						type: 'custom',
						formatter: (v: number) => (v * 100).toFixed(1) + '%',
						minMove: 0.001,
					},
				});

				seriesMap.set(m.tokenId, { series, label: m.label, color });
			}

			await updateData();
		} catch (e: any) {
			error = e.message;
			loading = false;
		}
	}

	// Only swap data — series stay alive → lightweight-charts animates transition
	async function updateData() {
		if (!chart || !seriesMap.size) return;
		loading = true;
		tooltipVisible = false;

		try {
			// Fetch all markets in parallel
			const results = await Promise.all(
				markets.map(m => fetchOHLC(m.tokenId, selectedInterval))
			);

			for (let i = 0; i < markets.length; i++) {
				const m = markets[i];
				const entry = seriesMap.get(m.tokenId);
				if (!entry) continue;
				const chartData = results[i].map(c => ({ time: c.time, value: c.close }));
				if (chartData.length) entry.series.setData(chartData);
			}

			chart.timeScale().fitContent();
		} catch (e: any) {
			error = e.message;
		} finally {
			loading = false;
		}
	}

	async function changeInterval(interval: Interval) {
		selectedInterval = interval;
		await updateData();
	}

	$: if (chart && markets) createSeries();

	onMount(() => { if (browser) initChart(); });
	onDestroy(() => { chart?.remove(); chart = null; });
</script>

<div class="mpc-wrap">
	<!-- Toolbar: intervals + spinner -->
	<div class="mpc-toolbar">
		<div class="mpc-intervals">
			{#each INTERVALS as iv}
				<button
					class="mpc-iv"
					class:active={selectedInterval === iv.value}
					on:click={() => changeInterval(iv.value)}
				>{iv.label}</button>
			{/each}
		</div>
		{#if loading}
			<div class="mpc-spinner"></div>
		{/if}
	</div>

	<!-- Legend -->
	{#if markets.length > 1 && !loading}
		<div class="mpc-legend">
			{#each markets as m, i}
				<span class="mpc-leg-item">
					<span class="mpc-leg-dot" style="background:{m.color ?? COLORS[i % COLORS.length]}"></span>
					{m.label}
				</span>
			{/each}
		</div>
	{/if}

	{#if error}
		<div class="mpc-error">{error}</div>
	{/if}

	<!-- Chart container (position:relative for tooltip overlay) -->
	<div class="mpc-canvas-wrap">
		<div class="mpc-chart" bind:this={chartEl}></div>

		<!-- Hover tooltip -->
		{#if tooltipVisible}
			<div
				class="mpc-tooltip"
				style="left:{tooltipX}px; top:{tooltipY}px"
			>
				<div class="mpc-tt-date">{tooltipDate}</div>
				{#each tooltipItems as item}
					<div class="mpc-tt-row">
						<span class="mpc-tt-dot" style="background:{item.color}"></span>
						<span class="mpc-tt-label">{item.label}</span>
						<span class="mpc-tt-val">{item.value}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.mpc-wrap {
		display: flex; flex-direction: column; gap: 0;
		height: 100%; min-height: 320px;
	}

	/* ── Toolbar ── */
	.mpc-toolbar {
		display: flex; align-items: center; gap: 10px;
		padding: 0 0 8px 0; flex-shrink: 0;
	}
	.mpc-intervals { display: flex; gap: 3px; }
	.mpc-iv {
		background: transparent; border: 1px solid #1a1a1a;
		color: #444; font-size: 11px; font-weight: 700;
		padding: 4px 9px; border-radius: 5px; cursor: pointer;
		transition: all 0.12s; letter-spacing: 0.03em;
	}
	.mpc-iv:hover { border-color: #333; color: #888; }
	.mpc-iv.active { border-color: #F97316; color: #F97316; background: rgba(249,115,22,0.08); }

	.mpc-spinner {
		width: 13px; height: 13px; margin-left: auto;
		border: 2px solid #1a1a1a; border-top-color: #F97316;
		border-radius: 50%; animation: spin 0.7s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	/* ── Legend ── */
	.mpc-legend {
		display: flex; gap: 8px; flex-wrap: wrap;
		padding-bottom: 8px; flex-shrink: 0;
	}
	.mpc-leg-item {
		display: flex; align-items: center; gap: 5px;
		font-size: 11px; color: #555;
	}
	.mpc-leg-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

	.mpc-error { font-size: 12px; color: #ef4444; padding: 6px 0; }

	/* ── Chart canvas area ── */
	.mpc-canvas-wrap {
		flex: 1; position: relative; min-height: 0;
	}
	.mpc-chart {
		width: 100%; height: 100%; min-height: 260px;
		border-radius: 6px; overflow: hidden;
	}

	/* ── Hover tooltip ── */
	.mpc-tooltip {
		position: absolute;
		pointer-events: none;
		z-index: 10;
		background: rgba(10, 10, 10, 0.92);
		border: 1px solid #222;
		border-radius: 8px;
		padding: 10px 14px;
		min-width: 190px;
		max-width: 240px;
		backdrop-filter: blur(6px);
		box-shadow: 0 4px 24px rgba(0,0,0,0.6);
	}
	.mpc-tt-date {
		font-size: 11px; color: #888;
		margin-bottom: 8px; font-weight: 600;
		letter-spacing: 0.02em;
	}
	.mpc-tt-row {
		display: flex; align-items: center; gap: 7px;
		padding: 3px 0;
	}
	.mpc-tt-dot {
		width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
	}
	.mpc-tt-label {
		flex: 1; font-size: 11px; color: #aaa;
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
	}
	.mpc-tt-val {
		font-size: 12px; font-weight: 700; color: #e8e8e8;
		font-variant-numeric: tabular-nums; flex-shrink: 0;
	}
</style>
