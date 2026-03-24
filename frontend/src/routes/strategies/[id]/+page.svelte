<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet" />
</svelte:head>

<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import BacktestResults from '$lib/components/backtesting/BacktestResults.svelte';

	let loading = $state(true);
	let error = $state('');
	let strategyName = $state('');
	let strategyDescription = $state('');
	let postedAt = $state('');
	let backtestResult: any = $state(null);

	onMount(async () => {
		const strategyId = $page.params.id;

		try {
			const res = await fetch(`/api/strategies/${strategyId}`);
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to load strategy');
			}

			const s = data.strategy;
			strategyName = s.strategy_name || '';
			strategyDescription = s.description || s.backtest_data?.description || '';
			postedAt = s.created_at ? formatDate(s.created_at) : '';

			const bd = s.backtest_data || {};
			const m = bd.metrics || {};
			const pnl = (s.final_capital || 0) - (s.initial_capital || 0);
			const ddPct = s.max_drawdown_percent || s.max_drawdown || 0;

			backtestResult = {
				trades: bd.trades || s.trades_data || [],
				metrics: {
					totalTrades: s.total_trades || 0,
					winningTrades: s.winning_trades || 0,
					losingTrades: s.losing_trades || 0,
					winRate: s.win_rate || 0,
					profitFactor: s.profit_factor || 0,
					sharpeRatio: s.sharpe_ratio || 0,
					maxDrawdown: s.max_drawdown || 0,
					maxDrawdownPercent: ddPct,
					maxDrawdownPercentage: ddPct,
					avgWin: s.avg_win || 0,
					avgLoss: s.avg_loss || 0,
					bestTrade: m.bestTrade || s.best_trade || 0,
					worstTrade: m.worstTrade || s.worst_trade || 0,
					avgHoldTime: m.avgHoldTime || s.avg_hold_time || 0,
					roi: s.total_return_percent || 0,
					totalPnl: m.totalPnl ?? pnl,
					netPnl: m.netPnl ?? pnl,
					expectancy: m.expectancy || 0,
					medianWin: m.medianWin || 0,
					medianLoss: m.medianLoss || 0,
					volatility: m.volatility || 0,
					capitalUtilization: m.capitalUtilization || 0,
					longestWinStreak: m.longestWinStreak || 0,
					longestLossStreak: m.longestLossStreak || 0,
					yesPerformance: m.yesPerformance || {},
					noPerformance: m.noPerformance || {},
					exitReasonDistribution: m.exitReasonDistribution || s.exit_reasons || {},
					equityCurve: s.equity_curve || [],
				},
				startingCapital: s.initial_capital || bd.startingCapital || 0,
				endingCapital: s.final_capital || bd.endingCapital || 0,
				marketsAnalyzed: s.markets_analyzed || bd.marketsAnalyzed || 0,
				executionTime: s.execution_time || bd.executionTime || 0,
				strategyConfig: bd.strategyConfig || null,
			};
		} catch (err: any) {
			error = err.message;
		} finally {
			loading = false;
		}
	});

	function formatDate(dateStr: string) {
		if (!dateStr) return '';
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
		});
	}
</script>

<div class="strategy-page">
	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>Loading strategy...</p>
		</div>
	{:else if error}
		<div class="error-state">
			<p>{error}</p>
			<a href="/strategies" class="btn-back">Back to Posts</a>
		</div>
	{:else if backtestResult}
		<div class="back-bar">
			<a href="/strategies" class="back-link">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
				<span>Back to Posts</span>
			</a>
		</div>
		<BacktestResults
			{backtestResult}
			selectedMarkets={[]}
			config={{}}
			walletConnected={false}
			readonly={true}
			strategyTitle={strategyName}
			strategyDescription={strategyDescription}
			{postedAt}
		/>
	{/if}
</div>

<style>
	.strategy-page {
		min-height: 100vh;
		background: #000;
		font-family: 'Share Tech Mono', monospace;
	}

	.loading-state, .error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		color: #888;
		gap: 16px;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 2px solid #333;
		border-top-color: #f97316;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	.btn-back {
		padding: 10px 20px;
		background: #f97316;
		color: #fff;
		text-decoration: none;
		border-radius: 6px;
		font-size: 14px;
	}

	.back-bar {
		padding: 16px 24px 0;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		color: #888;
		text-decoration: none;
		font-size: 13px;
		padding: 8px 14px;
		border-radius: 6px;
		border: 1px solid #1a1a1a;
		background: #0a0a0a;
		transition: all 0.2s;
	}

	.back-link:hover {
		color: #f97316;
		border-color: rgba(249, 115, 22, 0.3);
		background: rgba(249, 115, 22, 0.05);
	}

	.back-link svg {
		transition: transform 0.2s;
	}

	.back-link:hover svg {
		transform: translateX(-2px);
	}
</style>
