<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet" />
</svelte:head>

<script lang="ts">
	import { onDestroy } from 'svelte';
	import { walletStore } from '$lib/wallet/stores';
	import type { BacktestResult } from '$lib/backtesting/types';
	import BacktestChart from './BacktestChart.svelte';

	let {
		backtestResult,
		selectedMarkets,
		config,
		walletConnected,
		onSaveStrategy = undefined,
		readonly = false,
		strategyTitle = '',
		strategyDescription = '',
		postedAt = ''
	}: {
		backtestResult: BacktestResult;
		selectedMarkets: any[];
		config: any;
		walletConnected: boolean;
		onSaveStrategy?: () => void;
		readonly?: boolean;
		strategyTitle?: string;
		strategyDescription?: string;
		postedAt?: string;
	} = $props();

	/** Safe number: treats null/undefined/NaN as 0 */
	function n(v: any): number { return typeof v === 'number' && !isNaN(v) ? v : 0; }

	const m = $derived(backtestResult.metrics);
	const isProfitable = $derived((backtestResult.endingCapital ?? 0) >= (backtestResult.startingCapital ?? 0));

	// Tabs for bottom section
	let activeTab: 'overview' | 'trades' | 'analysis' = $state('overview');

	// Trade sorting
	let tradeSortKey: 'pnl' | 'pnlPct' | 'entry' | 'exit' | 'hold' = $state('entry');
	let tradeSortAsc = $state(false);

	const sortedTrades = $derived(() => {
		const trades = [...(backtestResult.trades || [])];
		trades.sort((a, b) => {
			let cmp = 0;
			if (tradeSortKey === 'pnl') cmp = n(a.pnl) - n(b.pnl);
			else if (tradeSortKey === 'pnlPct') cmp = n(a.pnlPercentage) - n(b.pnlPercentage);
			else if (tradeSortKey === 'entry') cmp = new Date(a.entryTime || 0).getTime() - new Date(b.entryTime || 0).getTime();
			else if (tradeSortKey === 'exit') cmp = (a.exitTime ? new Date(a.exitTime).getTime() : 0) - (b.exitTime ? new Date(b.exitTime).getTime() : 0);
			else if (tradeSortKey === 'hold') cmp = n(a.holdingDuration) - n(b.holdingDuration);
			return tradeSortAsc ? cmp : -cmp;
		});
		return trades;
	});

	function sortBy(key: typeof tradeSortKey) {
		if (tradeSortKey === key) tradeSortAsc = !tradeSortAsc;
		else { tradeSortKey = key; tradeSortAsc = false; }
	}

	// Formatting helpers
	function fmt$(val: number): string {
		const v = typeof val === 'number' && !isNaN(val) ? val : 0;
		return `${v >= 0 ? '+' : ''}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	}
	function fmtPct(val: number): string {
		const v = typeof val === 'number' && !isNaN(val) ? val : 0;
		return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
	}
	function fmtDate(d: Date | string): string {
		return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
	}
	function fmtHours(h: number): string {
		const v = typeof h === 'number' && !isNaN(h) ? h : 0;
		if (v < 1) return `${(v * 60).toFixed(0)}m`;
		if (v < 24) return `${v.toFixed(1)}h`;
		return `${(v / 24).toFixed(1)}d`;
	}

	// Safe sub-object accessors
	const er = $derived(m?.exitReasonDistribution ?? { resolution: 0, stopLoss: 0, takeProfit: 0, maxHoldTime: 0, trailingStop: 0, partialExits: 0 });
	const yp = $derived(m?.yesPerformance ?? { count: 0, winRate: 0, pnl: 0, avgWin: 0, avgLoss: 0 });
	const np = $derived(m?.noPerformance ?? { count: 0, winRate: 0, pnl: 0, avgWin: 0, avgLoss: 0 });
	const sc = $derived(backtestResult.strategyConfig ?? config?.strategyParams ?? {});

	// Exit reason bars
	const exitReasons = $derived(() => {
		const total = n(m?.totalTrades) || 1;
		return [
			{ name: 'Resolution', count: n(er.resolution), color: '#f97316' },
			{ name: 'Stop Loss', count: n(er.stopLoss), color: '#ef5350' },
			{ name: 'Take Profit', count: n(er.takeProfit), color: '#26a65b' },
			{ name: 'Max Hold', count: n(er.maxHoldTime), color: '#3b82f6' },
			{ name: 'Trailing', count: n(er.trailingStop), color: '#a855f7' },
			{ name: 'Partial', count: n(er.partialExits), color: '#06b6d4' },
		].filter(r => r.count > 0).map(r => ({ ...r, pct: (r.count / total) * 100 }));
	});

	// Top/worst trades
	const topTrades = $derived([...(backtestResult.trades || [])].sort((a, b) => n(b.pnl) - n(a.pnl)).slice(0, 5));
	const worstTrades = $derived([...(backtestResult.trades || [])].sort((a, b) => n(a.pnl) - n(b.pnl)).filter(t => n(t.pnl) < 0).slice(0, 5));

	// Save modal state
	let showSaveModal = $state(false);
	let showAuthModal = $state(false);
	let strategyName = $state('');
	let saveDescription = $state('');
	let savingStrategy = $state(false);
	let saveError = $state('');
	let currentUser: any = $state(null);
	let isAuthenticating = $state(false);
	let showSuccessNotification = $state(false);

	async function checkAuth() {
		try {
			const response = await fetch('/api/auth/user');
			const data = await response.json();
			currentUser = data.user;
		} catch { currentUser = null; }
	}

	function canSave(): boolean {
		return currentUser !== null || $walletStore.connected;
	}

	async function authenticateWallet() {
		isAuthenticating = true;
		saveError = '';
		try {
			const wallet = $walletStore;
			if (!wallet.adapter || !wallet.publicKey) throw new Error('Wallet not connected');
			if (typeof (wallet.adapter as any).signMessage !== 'function') throw new Error('Wallet does not support message signing');
			const publicKey = wallet.publicKey.toBase58();
			const message = `Sign this message to authenticate with Polymock.\n\nWallet: ${publicKey}\nTimestamp: ${Date.now()}`;
			const messageBytes = new TextEncoder().encode(message);
			const signature = await (wallet.adapter as any).signMessage(messageBytes);
			const response = await fetch('/api/auth/wallet', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ walletAddress: publicKey, signature: Array.from(signature), message })
			});
			const data = await response.json();
			if (response.ok && data.success) {
				currentUser = data.user;
				showAuthModal = false;
				showSaveModal = true;
				strategyName = '';
				saveError = '';
			} else throw new Error(data.error || 'Authentication failed');
		} catch (error: any) {
			saveError = error.message || 'Wallet authentication failed';
		} finally { isAuthenticating = false; }
	}

	async function showSaveStrategyModal() {
		// If not logged in and wallet not connected, show auth modal
		if (!currentUser && !$walletStore.connected) {
			showAuthModal = true; saveError = ''; return;
		}
		// If wallet connected but no session, auto-authenticate first
		if (!currentUser && $walletStore.connected) {
			await authenticateWallet();
			return; // authenticateWallet opens save modal on success
		}
		// Already authenticated, show save modal
		showSaveModal = true; strategyName = ''; saveDescription = ''; saveError = '';
	}

	async function saveStrategy() {
		if (!strategyName.trim()) { saveError = 'Please enter a strategy name'; return; }
		if (!backtestResult) { saveError = 'Missing backtest data'; return; }
		savingStrategy = true; saveError = '';
		try {
			const mt = backtestResult.metrics;
			const strategyData = {
				strategyName,
				strategyDescription: saveDescription.trim() || null,
				strategyType: config.strategyType || null,
				marketIds: selectedMarkets.map((m: any) => m.condition_id || m.conditionId || m.id),
				initialCapital: config.initialBankroll || backtestResult.startingCapital,
				entryType: config.entryType || 'BOTH',
				entryConfig: { entryTimeConstraints: config.entryTimeConstraints },
				positionSizingType: config.positionSizing?.type || 'FIXED',
				positionSizingValue: config.positionSizing?.type === 'PERCENTAGE'
					? config.positionSizing?.percentageOfBankroll
					: config.positionSizing?.fixedAmount,
				maxPositionSize: config.positionSizing?.maxExposurePercent ?? 0,
				stopLoss: config.exitRules?.stopLoss ?? 0,
				takeProfit: config.exitRules?.takeProfit ?? 0,
				timeBasedExit: config.exitRules?.maxHoldTime ?? 0,
				startDate: config.startDate?.toISOString?.() || new Date().toISOString(),
				endDate: config.endDate?.toISOString?.() || new Date().toISOString(),
				backtestResult: {
					initialCapital: backtestResult.startingCapital,
					finalCapital: backtestResult.endingCapital,
					totalReturnPercent: mt.roi,
					totalTrades: mt.totalTrades,
					winningTrades: mt.winningTrades,
					losingTrades: mt.losingTrades,
					winRate: mt.winRate,
					profitFactor: mt.profitFactor,
					sharpeRatio: mt.sharpeRatio,
					maxDrawdown: mt.maxDrawdown,
					maxDrawdownPercent: mt.maxDrawdownPercentage,
					avgWin: mt.avgWin,
					avgLoss: mt.avgLoss,
					bestTrade: mt.bestTrade,
					worstTrade: mt.worstTrade,
					avgHoldTime: mt.avgHoldTime,
					executionTime: backtestResult.executionTime,
					marketsAnalyzed: backtestResult.marketsAnalyzed,
					equityCurve: mt.equityCurve || [],
					exitReasons: mt.exitReasonDistribution || {},
					trades: backtestResult.trades || [],
					totalPnl: mt.totalPnl,
					netPnl: mt.netPnl,
					expectancy: mt.expectancy,
					medianWin: mt.medianWin,
					medianLoss: mt.medianLoss,
					volatility: mt.volatility,
					capitalUtilization: mt.capitalUtilization,
					longestWinStreak: mt.longestWinStreak,
					longestLossStreak: mt.longestLossStreak,
					yesPerformance: mt.yesPerformance,
					noPerformance: mt.noPerformance,
					strategyConfig: backtestResult.strategyConfig || sc || null,
				}
			};
			const response = await fetch('/api/strategies', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(strategyData)
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.message || data.error || 'Failed to post strategy');
			showSaveModal = false;
			showSuccessNotification = true;
			setTimeout(() => { showSuccessNotification = false; window.location.href = '/strategies'; }, 3000);
		} catch (error: any) {
			saveError = error.message || 'Failed to post strategy';
		} finally { savingStrategy = false; }
	}

	function exportJSON() {
		const data = {
			summary: {
				startingCapital: backtestResult.startingCapital,
				endingCapital: backtestResult.endingCapital,
				marketsAnalyzed: backtestResult.marketsAnalyzed,
				executionTime: backtestResult.executionTime,
			},
			metrics: backtestResult.metrics,
			trades: backtestResult.trades,
			equityCurve: backtestResult.metrics?.equityCurve || [],
			config: backtestResult.strategyConfig,
		};
		downloadFile(JSON.stringify(data, null, 2), `backtest_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
	}

	function exportCSV() {
		const headers = ['#', 'Market', 'Side', 'Entry Time', 'Exit Time', 'Entry Price', 'Exit Price', 'Amount', 'Shares', 'P&L', 'P&L %', 'Exit Reason', 'Duration (h)'];
		const rows = (backtestResult.trades || []).map((t, i) => [
			i + 1, `"${t.marketName || ''}"`, t.side || '',
			t.entryTime ? new Date(t.entryTime).toISOString() : '', t.exitTime ? new Date(t.exitTime).toISOString() : '',
			n(t.entryPrice).toFixed(4), n(t.exitPrice).toFixed(4), n(t.amountInvested).toFixed(2), n(t.shares).toFixed(4),
			n(t.pnl).toFixed(2), n(t.pnlPercentage).toFixed(2), t.exitReason || '', t.holdingDuration ? n(t.holdingDuration).toFixed(1) : '',
		]);
		downloadFile([headers.join(','), ...rows.map(r => r.join(','))].join('\n'), `backtest_trades_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
	}

	function downloadFile(content: string, filename: string, type: string) {
		const blob = new Blob([content], { type: `${type};charset=utf-8;` });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = filename;
		link.style.visibility = 'hidden';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	// ── Resizable charts/content split ──
	let chartsHeight = $state(300);
	let isDragging = $state(false);
	let dragStartY = 0;
	let dragStartHeight = 0;

	function onResizeStart(e: MouseEvent) {
		isDragging = true;
		dragStartY = e.clientY;
		dragStartHeight = chartsHeight;
		document.addEventListener('mousemove', onResizeMove);
		document.addEventListener('mouseup', onResizeEnd);
		document.body.style.cursor = 'row-resize';
		document.body.style.userSelect = 'none';
	}
	function onResizeMove(e: MouseEvent) {
		if (!isDragging) return;
		const delta = e.clientY - dragStartY;
		chartsHeight = Math.max(120, Math.min(600, dragStartHeight + delta));
	}
	function onResizeEnd() {
		isDragging = false;
		document.removeEventListener('mousemove', onResizeMove);
		document.removeEventListener('mouseup', onResizeEnd);
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
	}
	onDestroy(() => {
		document.removeEventListener('mousemove', onResizeMove);
		document.removeEventListener('mouseup', onResizeEnd);
	});

	checkAuth();
</script>

<div class="results-page">
	<!-- ═══ TOP: Hero Stats Bar ═══ -->
	<div class="hero-bar">
		{#if strategyTitle}
			<div class="hero-strategy-info">
				<div class="hero-strategy-left">
					<span class="hero-strategy-badge">STRATEGY</span>
					<h1 class="hero-strategy-name">{strategyTitle}</h1>
					{#if strategyDescription}
						<p class="hero-strategy-desc">{strategyDescription}</p>
					{/if}
				</div>
				{#if postedAt}
					<span class="hero-strategy-date">{postedAt}</span>
				{/if}
			</div>
		{/if}
		<div class="hero-main">
			<div class="hero-pnl" class:positive={isProfitable} class:negative={!isProfitable}>
				<span class="hero-label">NET P&L</span>
				<span class="hero-value">{fmt$(n(m.netPnl))}</span>
				<span class="hero-pct" class:positive={isProfitable} class:negative={!isProfitable}>{fmtPct(n(m.roi))}</span>
			</div>
			<div class="hero-divider"></div>
			<div class="hero-capital">
				<div class="cap-row">
					<span class="cap-label">Initial</span>
					<span class="cap-val">${n(backtestResult.startingCapital).toLocaleString()}</span>
				</div>
				<div class="cap-row">
					<span class="cap-label">Final</span>
					<span class="cap-val" class:positive={isProfitable} class:negative={!isProfitable}>${n(backtestResult.endingCapital).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
				</div>
			</div>
		</div>
		<div class="hero-stats">
			<div class="hs">
				<span class="hs-val">{n(m.totalTrades)}</span>
				<span class="hs-label">Trades</span>
			</div>
			<div class="hs">
				<span class="hs-val" class:positive={n(m.winRate) >= 50} class:negative={n(m.winRate) < 50}>{n(m.winRate).toFixed(1)}%</span>
				<span class="hs-label">Win Rate</span>
			</div>
			<div class="hs">
				<span class="hs-val">{n(m.profitFactor) === Infinity ? '---' : n(m.profitFactor).toFixed(2)}</span>
				<span class="hs-label">Profit Factor</span>
			</div>
			<div class="hs">
				<span class="hs-val">{n(m.sharpeRatio).toFixed(2)}</span>
				<span class="hs-label">Sharpe</span>
			</div>
			<div class="hs">
				<span class="hs-val negative">-{n(m.maxDrawdownPercentage).toFixed(1)}%</span>
				<span class="hs-label">Max DD</span>
			</div>
			<div class="hs">
				<span class="hs-val">{fmtHours(n(m.avgHoldTime))}</span>
				<span class="hs-label">Avg Hold</span>
			</div>
		</div>
		<div class="hero-actions">
			{#if !readonly}
				<button class="action-btn post-btn" onclick={showSaveStrategyModal}>Post</button>
			{/if}
			<button class="action-btn" onclick={exportJSON}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
				JSON
			</button>
			<button class="action-btn" onclick={exportCSV}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
				CSV
			</button>
		</div>
	</div>

	<!-- ═══ CHARTS: 3 separated panels (resizable) ═══ -->
	{#if n(m.totalTrades) > 0}
		<div class="charts-container" style="height: {chartsHeight}px">
			<BacktestChart {backtestResult} />
		</div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="resize-handle" class:active={isDragging} onmousedown={onResizeStart}>
			<div class="resize-grip"></div>
		</div>
	{:else}
		<div class="no-trades-banner">
			<span class="no-trades-icon">!</span>
			<span>No trades executed. Try wider price thresholds, different date ranges, or more markets.</span>
		</div>
	{/if}

	<!-- ═══ TAB BAR ═══ -->
	<div class="tab-bar">
		<button class="tab" class:active={activeTab === 'overview'} onclick={() => activeTab = 'overview'}>Overview</button>
		<button class="tab" class:active={activeTab === 'trades'} onclick={() => activeTab = 'trades'}>Trades ({n(m.totalTrades)})</button>
		<button class="tab" class:active={activeTab === 'analysis'} onclick={() => activeTab = 'analysis'}>Analysis</button>
	</div>

	<!-- ═══ TAB CONTENT ═══ -->
	<div class="tab-content">
		{#if activeTab === 'overview'}
			<div class="overview-grid">
				<!-- Performance -->
				<div class="panel">
					<h3 class="panel-title">Performance</h3>
					<div class="metric-rows">
						<div class="mrow"><span class="ml">Total Trades</span><span class="mv">{n(m.totalTrades)}</span></div>
						<div class="mrow"><span class="ml">Winning</span><span class="mv positive">{n(m.winningTrades)}</span></div>
						<div class="mrow"><span class="ml">Losing</span><span class="mv negative">{n(m.losingTrades)}</span></div>
						<div class="mrow"><span class="ml">Win Rate</span><span class="mv" class:positive={n(m.winRate) >= 50} class:negative={n(m.winRate) < 50}>{n(m.winRate).toFixed(1)}%</span></div>
						<div class="mrow"><span class="ml">Profit Factor</span><span class="mv">{n(m.profitFactor) === Infinity ? '---' : n(m.profitFactor).toFixed(2)}</span></div>
						<div class="mrow"><span class="ml">Expectancy</span><span class="mv" class:positive={n(m.expectancy) >= 0} class:negative={n(m.expectancy) < 0}>{fmt$(n(m.expectancy))}</span></div>
					</div>
				</div>

				<!-- Win / Loss -->
				<div class="panel">
					<h3 class="panel-title">Win / Loss</h3>
					<div class="metric-rows">
						<div class="mrow"><span class="ml">Average Win</span><span class="mv positive">{fmt$(n(m.avgWin))}</span></div>
						<div class="mrow"><span class="ml">Average Loss</span><span class="mv negative">{fmt$(Math.abs(n(m.avgLoss)))}</span></div>
						<div class="mrow"><span class="ml">Best Trade</span><span class="mv positive">{fmt$(n(m.bestTrade))}</span></div>
						<div class="mrow"><span class="ml">Worst Trade</span><span class="mv negative">{fmt$(n(m.worstTrade))}</span></div>
						<div class="mrow"><span class="ml">Median Win</span><span class="mv positive">{fmt$(n(m.medianWin))}</span></div>
						<div class="mrow"><span class="ml">Median Loss</span><span class="mv negative">{fmt$(Math.abs(n(m.medianLoss)))}</span></div>
					</div>
				</div>

				<!-- Risk -->
				<div class="panel">
					<h3 class="panel-title">Risk</h3>
					<div class="metric-rows">
						<div class="mrow"><span class="ml">Max Drawdown</span><span class="mv negative">${n(m.maxDrawdown).toFixed(2)}</span></div>
						<div class="mrow"><span class="ml">Max DD %</span><span class="mv negative">-{n(m.maxDrawdownPercentage).toFixed(2)}%</span></div>
						<div class="mrow"><span class="ml">Sharpe Ratio</span><span class="mv">{n(m.sharpeRatio).toFixed(2)}</span></div>
						<div class="mrow"><span class="ml">Volatility</span><span class="mv">{n(m.volatility).toFixed(4)}</span></div>
						<div class="mrow"><span class="ml">Capital Util.</span><span class="mv">{n(m.capitalUtilization).toFixed(1)}%</span></div>
						<div class="mrow"><span class="ml">Exec Time</span><span class="mv">{(n(backtestResult.executionTime) / 1000).toFixed(2)}s</span></div>
					</div>
				</div>

				<!-- Time -->
				<div class="panel">
					<h3 class="panel-title">Time & Streaks</h3>
					<div class="metric-rows">
						<div class="mrow"><span class="ml">Avg Hold</span><span class="mv">{fmtHours(n(m.avgHoldTime))}</span></div>
						<div class="mrow"><span class="ml">Median Hold</span><span class="mv">{fmtHours(n(m.medianHoldTime))}</span></div>
						<div class="mrow"><span class="ml">Win Streak</span><span class="mv positive">{n(m.longestWinStreak)}</span></div>
						<div class="mrow"><span class="ml">Loss Streak</span><span class="mv negative">{n(m.longestLossStreak)}</span></div>
						<div class="mrow"><span class="ml">Markets</span><span class="mv">{n(backtestResult.marketsAnalyzed)}</span></div>
					</div>
				</div>

				<!-- Strategy Parameters -->
				{#if sc && Object.keys(sc).length > 0}
					<div class="panel">
						<h3 class="panel-title">Strategy Config</h3>
						<div class="metric-rows">
							{#if sc.strategyType}<div class="mrow"><span class="ml">Strategy</span><span class="mv cfg-val">{sc.strategyType}</span></div>{/if}
							{#if sc.position}<div class="mrow"><span class="ml">Side</span><span class="mv cfg-val">{sc.position}</span></div>{/if}
							{#if sc.priceInf != null && sc.priceSup != null}<div class="mrow"><span class="ml">Price Range</span><span class="mv cfg-val">{sc.priceInf} — {sc.priceSup}</span></div>{/if}
							{#if sc.amount != null}<div class="mrow"><span class="ml">Amount</span><span class="mv cfg-val">${sc.amount}</span></div>{/if}
							{#if sc.threshold != null}<div class="mrow"><span class="ml">Threshold</span><span class="mv cfg-val">{sc.threshold}</span></div>{/if}
							{#if sc.stopLoss != null}<div class="mrow"><span class="ml">Stop Loss</span><span class="mv negative">{(n(sc.stopLoss) * 100).toFixed(0)}%</span></div>{/if}
							{#if sc.takeProfit != null}<div class="mrow"><span class="ml">Take Profit</span><span class="mv positive">{(n(sc.takeProfit) * 100).toFixed(0)}%</span></div>{/if}
							{#if sc.trailingStop != null}<div class="mrow"><span class="ml">Trailing Stop</span><span class="mv cfg-val">{(n(sc.trailingStop) * 100).toFixed(0)}%</span></div>{/if}
							{#if sc.maxHoldHours != null}<div class="mrow"><span class="ml">Max Hold</span><span class="mv cfg-val">{sc.maxHoldHours}h</span></div>{/if}
							{#if sc.cooldownHours != null}<div class="mrow"><span class="ml">Cooldown</span><span class="mv cfg-val">{sc.cooldownHours}h</span></div>{/if}
							{#if sc.initialCash != null}<div class="mrow"><span class="ml">Starting Cash</span><span class="mv cfg-val">${n(sc.initialCash).toLocaleString()}</span></div>{/if}
						</div>
					</div>
				{/if}

				<!-- Side Performance -->
				<div class="panel panel-wide">
					<h3 class="panel-title">Side Performance</h3>
					<div class="side-grid">
						<div class="side-card">
							<div class="side-header">
								<span class="side-badge yes">YES</span>
								<span class="side-count">{n(yp.count)} trades</span>
							</div>
							<div class="side-stats">
								<div class="ss"><span class="ssl">Win Rate</span><span class="ssv" class:positive={n(yp.winRate) >= 50} class:negative={n(yp.winRate) < 50}>{n(yp.winRate).toFixed(1)}%</span></div>
								<div class="ss"><span class="ssl">P&L</span><span class="ssv" class:positive={n(yp.pnl) >= 0} class:negative={n(yp.pnl) < 0}>{fmt$(n(yp.pnl))}</span></div>
								<div class="ss"><span class="ssl">Avg Win</span><span class="ssv positive">{fmt$(n(yp.avgWin))}</span></div>
								<div class="ss"><span class="ssl">Avg Loss</span><span class="ssv negative">{fmt$(Math.abs(n(yp.avgLoss)))}</span></div>
							</div>
						</div>
						<div class="side-card">
							<div class="side-header">
								<span class="side-badge no">NO</span>
								<span class="side-count">{n(np.count)} trades</span>
							</div>
							<div class="side-stats">
								<div class="ss"><span class="ssl">Win Rate</span><span class="ssv" class:positive={n(np.winRate) >= 50} class:negative={n(np.winRate) < 50}>{n(np.winRate).toFixed(1)}%</span></div>
								<div class="ss"><span class="ssl">P&L</span><span class="ssv" class:positive={n(np.pnl) >= 0} class:negative={n(np.pnl) < 0}>{fmt$(n(np.pnl))}</span></div>
								<div class="ss"><span class="ssl">Avg Win</span><span class="ssv positive">{fmt$(n(np.avgWin))}</span></div>
								<div class="ss"><span class="ssl">Avg Loss</span><span class="ssv negative">{fmt$(Math.abs(n(np.avgLoss)))}</span></div>
							</div>
						</div>
					</div>
				</div>

				<!-- Exit Reasons -->
				<div class="panel panel-wide">
					<h3 class="panel-title">Exit Reasons</h3>
					{#if exitReasons().length > 0}
						<div class="exit-bars">
							{#each exitReasons() as r}
								<div class="exit-row">
									<span class="exit-name">{r.name}</span>
									<div class="exit-track">
										<div class="exit-fill" style="width: {r.pct}%; background: {r.color}"></div>
									</div>
									<span class="exit-count">{r.count}</span>
									<span class="exit-pct">{r.pct.toFixed(1)}%</span>
								</div>
							{/each}
						</div>
					{:else}
						<p class="empty-text">No exit data available</p>
					{/if}
				</div>
			</div>

		{:else if activeTab === 'trades'}
			<div class="trades-table-wrapper">
				<table class="trades-table">
					<thead>
						<tr>
							<th class="th-num">#</th>
							<th class="th-side">Side</th>
							<th class="th-market">Market</th>
							<th class="th-sortable" onclick={() => sortBy('entry')}>
								Entry {tradeSortKey === 'entry' ? (tradeSortAsc ? '▲' : '▼') : ''}
							</th>
							<th class="th-sortable" onclick={() => sortBy('exit')}>
								Exit {tradeSortKey === 'exit' ? (tradeSortAsc ? '▲' : '▼') : ''}
							</th>
							<th>Entry $</th>
							<th>Exit $</th>
							<th class="th-sortable" onclick={() => sortBy('pnl')}>
								P&L {tradeSortKey === 'pnl' ? (tradeSortAsc ? '▲' : '▼') : ''}
							</th>
							<th class="th-sortable" onclick={() => sortBy('pnlPct')}>
								P&L % {tradeSortKey === 'pnlPct' ? (tradeSortAsc ? '▲' : '▼') : ''}
							</th>
							<th class="th-sortable" onclick={() => sortBy('hold')}>
								Hold {tradeSortKey === 'hold' ? (tradeSortAsc ? '▲' : '▼') : ''}
							</th>
							<th>Exit Reason</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedTrades() as trade, i}
							<tr class="trade-row" class:win={n(trade.pnl) > 0} class:loss={n(trade.pnl) < 0}>
								<td class="td-num">{i + 1}</td>
								<td><span class="side-pill" class:yes={trade.side === 'YES'} class:no={trade.side === 'NO'}>{trade.side || '---'}</span></td>
								<td class="td-market" title={trade.marketName || ''}>{(trade.marketName || '').slice(0, 40)}{(trade.marketName || '').length > 40 ? '...' : ''}</td>
								<td class="td-date">{trade.entryTime ? fmtDate(trade.entryTime) : '---'}</td>
								<td class="td-date">{trade.exitTime ? fmtDate(trade.exitTime) : '---'}</td>
								<td class="td-price">${n(trade.entryPrice).toFixed(3)}</td>
								<td class="td-price">${n(trade.exitPrice).toFixed(3)}</td>
								<td class="td-pnl" class:positive={n(trade.pnl) >= 0} class:negative={n(trade.pnl) < 0}>{fmt$(n(trade.pnl))}</td>
								<td class="td-pnl" class:positive={n(trade.pnlPercentage) >= 0} class:negative={n(trade.pnlPercentage) < 0}>{fmtPct(n(trade.pnlPercentage))}</td>
								<td class="td-hold">{trade.holdingDuration ? fmtHours(n(trade.holdingDuration)) : '---'}</td>
								<td class="td-reason">{trade.exitReason || '---'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

		{:else if activeTab === 'analysis'}
			<div class="analysis-grid">
				<!-- Top Trades -->
				<div class="panel">
					<h3 class="panel-title positive-title">Top 5 Trades</h3>
					{#each topTrades as t, i}
						<div class="top-trade-row">
							<span class="top-rank">#{i + 1}</span>
							<span class="top-side" class:yes={t.side === 'YES'} class:no={t.side === 'NO'}>{t.side || '---'}</span>
							<span class="top-name">{(t.marketName || '').slice(0, 35)}</span>
							<span class="top-pnl positive">{fmt$(n(t.pnl))}</span>
						</div>
					{/each}
					{#if topTrades.length === 0}
						<p class="empty-text">No trades</p>
					{/if}
				</div>

				<!-- Worst Trades -->
				<div class="panel">
					<h3 class="panel-title negative-title">Worst 5 Trades</h3>
					{#each worstTrades as t, i}
						<div class="top-trade-row">
							<span class="top-rank">#{i + 1}</span>
							<span class="top-side" class:yes={t.side === 'YES'} class:no={t.side === 'NO'}>{t.side || '---'}</span>
							<span class="top-name">{(t.marketName || '').slice(0, 35)}</span>
							<span class="top-pnl negative">{fmt$(n(t.pnl))}</span>
						</div>
					{/each}
					{#if worstTrades.length === 0}
						<p class="empty-text">No losing trades</p>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Success Notification -->
{#if showSuccessNotification}
	<div class="success-notification">
		<div class="success-content">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#10b981"/><path d="M8 12l3 3 5-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
			<div><h3>Strategy Posted!</h3><p>Redirecting to strategies page...</p></div>
			<button onclick={() => showSuccessNotification = false} class="close-notification">X</button>
		</div>
	</div>
{/if}

<!-- Auth Modal -->
{#if showAuthModal}
	<div class="modal-overlay" onclick={() => (showAuthModal = false)}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header"><h2>Connect to Post</h2><button class="modal-close" onclick={() => (showAuthModal = false)}>X</button></div>
			<div class="modal-body">
				<p>Connect your wallet to post your strategy and associate it with your profile.</p>
				<div class="auth-options">
					{#if $walletStore.connected}
						<button class="auth-btn" onclick={authenticateWallet} disabled={isAuthenticating}>
							{isAuthenticating ? 'Signing...' : 'Sign with Wallet'}
							<span class="auth-sub">{$walletStore.publicKey?.toBase58().slice(0, 8)}...{$walletStore.publicKey?.toBase58().slice(-8)}</span>
						</button>
					{:else}
						<p class="auth-hint">Use the wallet button in the top navigation to connect, then try again.</p>
					{/if}
					<a href="/api/auth/login" class="auth-btn">Sign in with Google</a>
				</div>
				{#if saveError}<div class="error-msg">{saveError}</div>{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Save Modal -->
{#if showSaveModal}
	<div class="modal-overlay" onclick={() => (showSaveModal = false)}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header"><h2>Post Strategy</h2><button class="modal-close" onclick={() => (showSaveModal = false)}>X</button></div>
			<div class="modal-body">
				<div class="form-group">
					<label for="strategy-name">Strategy Name</label>
					<input id="strategy-name" type="text" bind:value={strategyName} placeholder="Enter a name for your strategy" maxlength="100" disabled={savingStrategy} />
				</div>
				<div class="form-group">
					<label for="strategy-desc">Comment <span style="opacity:0.5">(optional)</span></label>
					<textarea id="strategy-desc" bind:value={saveDescription} placeholder="Add a comment about your strategy, what you tested, insights..." maxlength="500" rows="3" disabled={savingStrategy}></textarea>
				</div>
				{#if saveError}<div class="error-msg">{saveError}</div>{/if}
				<div class="modal-actions">
					<button class="btn-cancel" onclick={() => (showSaveModal = false)} disabled={savingStrategy}>Cancel</button>
					<button class="btn-confirm" onclick={saveStrategy} disabled={savingStrategy || !strategyName.trim()}>{savingStrategy ? 'Posting...' : 'Post Strategy'}</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.results-page {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: #0a0a0a;
	}

	/* ═══ HERO BAR ═══ */
	.hero-bar {
		flex-shrink: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 24px;
		padding: 16px 24px;
		background: #000;
		border-bottom: 1px solid #1a1a1a;
	}
	.hero-strategy-info {
		width: 100%;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding-bottom: 14px;
		margin-bottom: -8px;
		border-bottom: 1px solid #1a1a1a;
	}
	.hero-strategy-left { display: flex; flex-direction: column; gap: 6px; }
	.hero-strategy-badge {
		display: inline-block;
		width: fit-content;
		font-family: 'Share Tech Mono', monospace;
		font-size: 9px;
		letter-spacing: 2px;
		font-weight: 700;
		color: #f97316;
		background: rgba(249, 115, 22, 0.1);
		border: 1px solid rgba(249, 115, 22, 0.25);
		border-radius: 3px;
		padding: 2px 8px;
	}
	.hero-strategy-name {
		font-family: 'Share Tech Mono', monospace;
		font-size: 20px;
		font-weight: 700;
		color: #fff;
		margin: 0;
		line-height: 1.2;
	}
	.hero-strategy-desc {
		font-family: 'Share Tech Mono', monospace;
		font-size: 13px;
		color: #888;
		margin: 0;
		line-height: 1.4;
	}
	.hero-strategy-date {
		font-family: 'Share Tech Mono', monospace;
		font-size: 11px;
		color: #555;
		white-space: nowrap;
		flex-shrink: 0;
		padding-top: 4px;
	}
	.hero-main { display: flex; align-items: center; gap: 20px; }
	.hero-pnl { display: flex; flex-direction: column; gap: 2px; }
	.hero-label { font-family: 'Share Tech Mono', monospace; font-size: 10px; color: #aaa; letter-spacing: 1.5px; font-weight: 700; }
	.hero-value { font-family: 'Share Tech Mono', monospace; font-size: 28px; font-weight: 700; line-height: 1; }
	.hero-pct { font-family: 'Share Tech Mono', monospace; font-size: 13px; font-weight: 600; }
	.hero-divider { width: 1px; height: 48px; background: #333; }
	.hero-capital { display: flex; flex-direction: column; gap: 4px; }
	.cap-row { display: flex; align-items: center; gap: 8px; }
	.cap-label { font-family: 'Share Tech Mono', monospace; font-size: 10px; color: #aaa; width: 40px; letter-spacing: 0.5px; }
	.cap-val { font-family: 'Share Tech Mono', monospace; font-size: 13px; color: #ddd; font-weight: 600; }
	.hero-stats { display: flex; gap: 20px; margin-left: auto; }
	.hs { display: flex; flex-direction: column; align-items: center; gap: 2px; }
	.hs-val { font-family: 'Share Tech Mono', monospace; font-size: 14px; font-weight: 700; color: #eee; }
	.hs-label { font-family: 'Share Tech Mono', monospace; font-size: 9px; color: #999; letter-spacing: 0.5px; text-transform: uppercase; }
	.hero-actions { display: flex; gap: 6px; flex-shrink: 0; }
	.action-btn {
		display: flex; align-items: center; gap: 5px;
		background: transparent; border: 1px solid #f97316; color: #f97316;
		padding: 6px 12px; font-family: 'Share Tech Mono', monospace; font-size: 11px;
		cursor: pointer; border-radius: 4px; font-weight: 600; transition: all 0.15s;
	}
	.action-btn:hover { background: #f97316; color: #000; }
	.action-btn.post-btn { background: #f97316; color: #000; }
	.action-btn.post-btn:hover { background: #fb923c; }

	/* ═══ CHARTS CONTAINER (resizable) ═══ */
	.charts-container {
		flex-shrink: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.charts-container :global(.charts-row) {
		flex: 1;
		min-height: 0;
	}

	/* ═══ RESIZE HANDLE ═══ */
	.resize-handle {
		flex-shrink: 0;
		height: 8px;
		cursor: row-resize;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #0a0a0a;
		border-top: 1px solid #222;
		border-bottom: 1px solid #222;
		transition: background 0.15s;
	}
	.resize-handle:hover, .resize-handle.active {
		background: rgba(249, 115, 22, 0.1);
		border-color: #f97316;
	}
	.resize-grip {
		width: 40px;
		height: 3px;
		border-radius: 2px;
		background: #444;
		transition: background 0.15s;
	}
	.resize-handle:hover .resize-grip, .resize-handle.active .resize-grip {
		background: #f97316;
	}

	/* ═══ TAB BAR ═══ */
	.tab-bar {
		flex-shrink: 0;
		display: flex;
		gap: 0;
		background: #000;
		border-bottom: 1px solid #1a1a1a;
		padding: 0 24px;
	}
	.tab {
		padding: 10px 20px; font-family: 'Share Tech Mono', monospace; font-size: 12px; font-weight: 600;
		color: #aaa; background: none; border: none; border-bottom: 2px solid transparent;
		cursor: pointer; letter-spacing: 0.5px; transition: all 0.15s;
	}
	.tab:hover { color: #ddd; }
	.tab.active { color: #f97316; border-bottom-color: #f97316; }

	/* ═══ TAB CONTENT ═══ */
	.tab-content {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 20px 24px;
	}

	/* ═══ OVERVIEW GRID ═══ */
	.overview-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
	.panel { background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 8px; padding: 16px; }
	.panel-wide { grid-column: span 2; }
	.panel-title {
		font-family: 'Share Tech Mono', monospace; font-size: 11px; font-weight: 700;
		color: #f97316; letter-spacing: 1px; text-transform: uppercase;
		margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid #1a1a1a;
	}
	.positive-title { color: #26a65b; }
	.negative-title { color: #ef5350; }
	.metric-rows { display: flex; flex-direction: column; gap: 6px; }
	.mrow { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }
	.ml { font-family: 'Share Tech Mono', monospace; font-size: 11px; color: #bbb; }
	.mv { font-family: 'Share Tech Mono', monospace; font-size: 12px; color: #eee; font-weight: 600; }
	.mv.cfg-val { color: #f97316; }

	/* ═══ SIDE PERFORMANCE ═══ */
	.side-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.side-card { background: #0a0a0a; border: 1px solid #1a1a1a; border-radius: 6px; padding: 12px; }
	.side-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
	.side-badge { font-family: 'Share Tech Mono', monospace; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; letter-spacing: 0.5px; }
	.side-badge.yes { background: rgba(38, 166, 91, 0.15); color: #26a65b; border: 1px solid rgba(38, 166, 91, 0.3); }
	.side-badge.no { background: rgba(239, 83, 80, 0.15); color: #ef5350; border: 1px solid rgba(239, 83, 80, 0.3); }
	.side-count { font-family: 'Share Tech Mono', monospace; font-size: 10px; color: #999; }
	.side-stats { display: flex; flex-direction: column; gap: 4px; }
	.ss { display: flex; justify-content: space-between; align-items: center; }
	.ssl { font-family: 'Share Tech Mono', monospace; font-size: 10px; color: #999; }
	.ssv { font-family: 'Share Tech Mono', monospace; font-size: 11px; color: #ddd; font-weight: 600; }

	/* ═══ EXIT REASONS ═══ */
	.exit-bars { display: flex; flex-direction: column; gap: 8px; }
	.exit-row { display: flex; align-items: center; gap: 8px; }
	.exit-name { font-family: 'Share Tech Mono', monospace; font-size: 11px; color: #bbb; width: 90px; flex-shrink: 0; }
	.exit-track { flex: 1; height: 6px; background: #1a1a1a; border-radius: 3px; overflow: hidden; }
	.exit-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
	.exit-count { font-family: 'Share Tech Mono', monospace; font-size: 11px; color: #eee; width: 40px; text-align: right; }
	.exit-pct { font-family: 'Share Tech Mono', monospace; font-size: 10px; color: #999; width: 42px; text-align: right; }
	.empty-text { font-family: 'Share Tech Mono', monospace; font-size: 11px; color: #666; margin: 8px 0 0; }

	/* ═══ TRADES TABLE ═══ */
	.trades-table-wrapper { overflow-x: auto; border: 1px solid #1a1a1a; border-radius: 8px; background: #0f0f0f; }
	.trades-table { width: 100%; border-collapse: collapse; font-family: 'Share Tech Mono', monospace; font-size: 11px; }
	.trades-table thead { position: sticky; top: 0; z-index: 1; }
	.trades-table th {
		padding: 10px 8px; text-align: left; font-size: 10px; font-weight: 700;
		color: #999; letter-spacing: 0.5px; text-transform: uppercase;
		background: #111; border-bottom: 1px solid #1a1a1a; white-space: nowrap;
	}
	.th-sortable { cursor: pointer; user-select: none; }
	.th-sortable:hover { color: #f97316; }
	.trades-table td { padding: 8px; border-bottom: 1px solid #111; color: #ccc; white-space: nowrap; }
	.trade-row:hover { background: rgba(249, 115, 22, 0.03); }
	.trade-row.win { border-left: 2px solid rgba(38, 166, 91, 0.4); }
	.trade-row.loss { border-left: 2px solid rgba(239, 83, 80, 0.4); }
	.td-num { color: #666; font-size: 10px; }
	.td-market { max-width: 250px; overflow: hidden; text-overflow: ellipsis; color: #bbb; }
	.td-date { color: #aaa; }
	.td-price { color: #ccc; }
	.td-pnl { font-weight: 700; }
	.td-hold { color: #aaa; }
	.td-reason { color: #999; font-size: 10px; text-transform: lowercase; }
	.side-pill { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; }
	.side-pill.yes { background: rgba(38, 166, 91, 0.12); color: #26a65b; }
	.side-pill.no { background: rgba(239, 83, 80, 0.12); color: #ef5350; }

	/* ═══ ANALYSIS ═══ */
	.analysis-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.top-trade-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #1a1a1a; }
	.top-trade-row:last-child { border-bottom: none; }
	.top-rank { font-family: 'Share Tech Mono', monospace; font-size: 10px; color: #777; width: 20px; }
	.top-side { font-family: 'Share Tech Mono', monospace; font-size: 10px; font-weight: 700; padding: 2px 5px; border-radius: 3px; }
	.top-side.yes { background: rgba(38, 166, 91, 0.12); color: #26a65b; }
	.top-side.no { background: rgba(239, 83, 80, 0.12); color: #ef5350; }
	.top-name { font-family: 'Share Tech Mono', monospace; font-size: 11px; color: #bbb; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.top-pnl { font-family: 'Share Tech Mono', monospace; font-size: 12px; font-weight: 700; flex-shrink: 0; }

	/* ═══ COLORS ═══ */
	.positive { color: #26a65b !important; }
	.negative { color: #ef5350 !important; }

	/* ═══ NO TRADES ═══ */
	.no-trades-banner {
		display: flex; align-items: center; gap: 12px; padding: 16px 24px;
		background: rgba(239, 83, 80, 0.05); border: 1px solid rgba(239, 83, 80, 0.2);
		color: #ef5350; font-family: 'Share Tech Mono', monospace; font-size: 13px; flex-shrink: 0;
	}
	.no-trades-icon {
		font-size: 18px; font-weight: 700; width: 24px; height: 24px;
		display: flex; align-items: center; justify-content: center; border: 2px solid #ef5350; border-radius: 50%;
	}

	/* ═══ NOTIFICATIONS & MODALS ═══ */
	.success-notification { position: fixed; top: 20px; right: 20px; z-index: 1000; animation: slideIn 0.3s ease; }
	@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
	.success-content { display: flex; align-items: center; gap: 12px; background: #000; border: 1px solid #10b981; padding: 16px 20px; border-radius: 6px; color: #fff; font-family: 'Share Tech Mono', monospace; font-size: 13px; }
	.success-content h3 { margin: 0; color: #10b981; font-size: 14px; }
	.success-content p { margin: 4px 0 0; color: #aaa; font-size: 12px; }
	.close-notification { background: none; border: none; color: #aaa; cursor: pointer; font-size: 16px; }
	.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 100; }
	.modal-content { background: #0a0a0a; border: 1px solid #333; border-radius: 8px; width: 90%; max-width: 420px; overflow: hidden; }
	.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #222; }
	.modal-header h2 { margin: 0; font-family: 'Share Tech Mono', monospace; font-size: 16px; color: #f97316; }
	.modal-close { background: none; border: none; color: #888; cursor: pointer; font-size: 18px; font-family: monospace; }
	.modal-close:hover { color: #fff; }
	.modal-body { padding: 20px; }
	.modal-body p { color: #ccc; font-size: 14px; margin: 0 0 16px; }
	.form-group { margin-bottom: 16px; }
	.form-group label { display: block; margin-bottom: 6px; color: #ccc; font-size: 13px; font-family: 'Share Tech Mono', monospace; }
	.form-group input, .form-group textarea { width: 100%; padding: 10px 12px; background: #111; border: 1px solid #333; border-radius: 4px; color: #fff; font-size: 14px; font-family: 'Share Tech Mono', monospace; box-sizing: border-box; }
	.form-group input:focus, .form-group textarea:focus { outline: none; border-color: #f97316; }
	.form-group textarea { resize: vertical; min-height: 60px; }
	.modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
	.btn-cancel { padding: 8px 16px; background: transparent; border: 1px solid #f97316; color: #f97316; border-radius: 4px; cursor: pointer; font-family: 'Share Tech Mono', monospace; font-size: 13px; }
	.btn-confirm { padding: 8px 16px; background: #f97316; border: none; color: #000; border-radius: 4px; cursor: pointer; font-weight: 700; font-family: 'Share Tech Mono', monospace; font-size: 13px; }
	.btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
	.auth-options { display: flex; flex-direction: column; gap: 8px; }
	.auth-btn { display: block; padding: 12px 16px; background: #111; border: 1px solid #f97316; color: #f97316; border-radius: 4px; cursor: pointer; font-family: 'Share Tech Mono', monospace; font-size: 14px; text-align: center; text-decoration: none; transition: all 0.15s; }
	.auth-btn:hover { background: #f97316; color: #000; }
	.auth-btn.disabled { opacity: 0.4; cursor: not-allowed; }
	.auth-hint { color: #888; font-size: 13px; text-align: center; margin: 8px 0; }
	.auth-sub { display: block; font-size: 11px; color: #999; margin-top: 4px; }
	.error-msg { color: #ef5350; font-size: 13px; margin-top: 12px; padding: 8px 12px; background: rgba(239, 83, 80, 0.1); border-radius: 4px; }

	/* ═══ SCROLLBAR ═══ */
	.results-page::-webkit-scrollbar, .tab-content::-webkit-scrollbar, .trades-table-wrapper::-webkit-scrollbar { width: 6px; height: 6px; }
	.results-page::-webkit-scrollbar-track, .tab-content::-webkit-scrollbar-track, .trades-table-wrapper::-webkit-scrollbar-track { background: #0a0a0a; }
	.results-page::-webkit-scrollbar-thumb, .tab-content::-webkit-scrollbar-thumb, .trades-table-wrapper::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
	.results-page::-webkit-scrollbar-thumb:hover, .tab-content::-webkit-scrollbar-thumb:hover { background: #f97316; }

	/* ═══ RESPONSIVE ═══ */
	@media (max-width: 1200px) {
		.overview-grid { grid-template-columns: repeat(2, 1fr); }
		.panel-wide { grid-column: span 2; }
	}
	@media (max-width: 768px) {
		.hero-bar { flex-direction: column; align-items: flex-start; gap: 12px; padding: 12px 16px; }
		.hero-stats { flex-wrap: wrap; margin-left: 0; }
		.overview-grid { grid-template-columns: 1fr; }
		.panel-wide { grid-column: span 1; }
		.analysis-grid { grid-template-columns: 1fr; }
		.tab-content { padding: 16px; }
	}
</style>
