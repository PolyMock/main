<script lang="ts">
	import { walletStore } from '$lib/wallet/stores';
	import type { BacktestResult } from '$lib/backtesting/types';
	import EquityCurveChart from '$lib/components/EquityCurveChart.svelte';
	import PnLDistributionChart from '$lib/components/PnLDistributionChart.svelte';

	let {
		backtestResult,
		selectedMarkets,
		config,
		walletConnected,
		onSaveStrategy
	}: {
		backtestResult: BacktestResult;
		selectedMarkets: any[];
		config: any;
		walletConnected: boolean;
		onSaveStrategy?: () => void;
	} = $props();

	// Internal state
	let showAdvancedMetrics = $state(false);
	let tradeSortColumn: 'entry' | 'exit' | 'pnl' | 'percent' | 'duration' | null = $state(null);
	let tradeSortDirection: 'asc' | 'desc' = $state('desc');
	let tradeSearchQuery = $state('');
	let tradeFilterSide: 'ALL' | 'YES' | 'NO' = $state('ALL');
	let tradeFilterExitReason: string = $state('ALL');
	let tradesCurrentPage = $state(0);
	let tradesPerPage = $state(50);

	// Save modal state
	let showSaveModal = $state(false);
	let showAuthModal = $state(false);
	let strategyName = $state('');
	let savingStrategy = $state(false);
	let saveError = $state('');
	let currentUser: any = $state(null);
	let isAuthenticating = $state(false);
	let showSuccessNotification = $state(false);

	// ---- Formatting functions ----
	function formatUSDC(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	}

	function formatPercentage(percentage: number): string {
		const sign = percentage >= 0 ? '+' : '';
		return `${sign}${percentage.toFixed(2)}%`;
	}

	function formatDateTime(date: Date | string): string {
		return new Date(date).toLocaleString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDate(date: Date | string): string {
		return new Date(date).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	// ---- Sort function ----
	function sortTradesBy(column: typeof tradeSortColumn) {
		if (tradeSortColumn === column) {
			tradeSortDirection = tradeSortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			tradeSortColumn = column;
			tradeSortDirection = 'desc';
		}
	}

	// ---- Export functions ----
	function exportToCSV() {
		if (!backtestResult) return;

		const headers = [
			'Market',
			'Side',
			'Entry Time',
			'Exit Time',
			'Entry Price',
			'Exit Price',
			'Amount Invested',
			'Shares',
			'P&L',
			'P&L %',
			'Fees',
			'Exit Reason'
		];

		const rows = backtestResult.trades.map((trade) => [
			trade.marketName,
			trade.side,
			formatDateTime(trade.entryTime),
			trade.exitTime ? formatDateTime(trade.exitTime) : 'N/A',
			trade.entryPrice.toFixed(4),
			trade.exitPrice.toFixed(4),
			trade.amountInvested.toFixed(2),
			trade.shares.toFixed(4),
			trade.pnl.toFixed(2),
			trade.pnlPercentage.toFixed(2),
			trade.fees.toFixed(2),
			trade.exitReason || 'N/A'
		]);

		const csvContent = [
			headers.join(','),
			...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))
		].join('\n');

		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const link = document.createElement('a');
		const url = URL.createObjectURL(blob);
		link.setAttribute('href', url);
		link.setAttribute('download', `backtest_results_${new Date().toISOString()}.csv`);
		link.style.visibility = 'hidden';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	function exportMetricsJSON() {
		if (!backtestResult) return;

		const data = {
			config: backtestResult.strategyConfig,
			metrics: backtestResult.metrics,
			summary: {
				startingCapital: backtestResult.startingCapital,
				endingCapital: backtestResult.endingCapital,
				marketsAnalyzed: backtestResult.marketsAnalyzed,
				executionTime: backtestResult.executionTime
			}
		};

		const blob = new Blob([JSON.stringify(data, null, 2)], {
			type: 'application/json;charset=utf-8;'
		});
		const link = document.createElement('a');
		const url = URL.createObjectURL(blob);
		link.setAttribute('href', url);
		link.setAttribute('download', `backtest_metrics_${new Date().toISOString()}.json`);
		link.style.visibility = 'hidden';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	// ---- Auth / Save functions ----
	async function checkAuth() {
		try {
			const response = await fetch('/api/auth/user');
			const data = await response.json();
			currentUser = data.user;
		} catch (error) {
			console.error('Auth check failed:', error);
			currentUser = null;
		}
	}

	function canSave(): boolean {
		return currentUser !== null || $walletStore.connected;
	}

	async function authenticateWallet() {
		isAuthenticating = true;
		saveError = '';

		try {
			const wallet = $walletStore;

			if (!wallet.adapter || !wallet.publicKey) {
				throw new Error('Wallet not connected');
			}

			if (typeof wallet.adapter.signMessage !== 'function') {
				throw new Error('Wallet does not support message signing');
			}

			const publicKey = wallet.publicKey.toBase58();

			const message = `Sign this message to authenticate with Polymock.\n\nWallet: ${publicKey}\nTimestamp: ${Date.now()}`;
			const messageBytes = new TextEncoder().encode(message);

			const signature = await wallet.adapter.signMessage(messageBytes);

			const response = await fetch('/api/auth/wallet', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					walletAddress: publicKey,
					signature: Array.from(signature),
					message: message
				})
			});

			const data = await response.json();

			if (response.ok && data.success) {
				currentUser = data.user;
				showAuthModal = false;
				showSaveModal = true;
				strategyName = '';
				saveError = '';
			} else {
				throw new Error(data.error || 'Authentication failed');
			}
		} catch (error: any) {
			console.error('Wallet authentication error:', error);
			saveError = error.message || 'Wallet authentication failed';
		} finally {
			isAuthenticating = false;
		}
	}

	async function showSaveStrategyModal() {
		if (!canSave()) {
			showAuthModal = true;
			saveError = '';
			return;
		}

		if ($walletStore.connected) {
			await authenticateWallet();
			return;
		}

		showSaveModal = true;
		strategyName = '';
		saveError = '';
	}

	async function saveStrategy() {
		if (!strategyName.trim()) {
			saveError = 'Please enter a strategy name';
			return;
		}

		if (!backtestResult || selectedMarkets.length === 0) {
			saveError = 'Missing backtest data';
			return;
		}

		savingStrategy = true;
		saveError = '';

		try {
			const strategyData = {
				strategyName: strategyName,
				marketIds: selectedMarkets.map((m: any) => m.condition_id),
				marketQuestion: selectedMarkets.length === 1
					? selectedMarkets[0].question
					: `Multi-market backtest (${selectedMarkets.length} markets)`,
				initialCapital: config.initialBankroll,
				startDate: config.startDate?.toISOString() || '',
				endDate: config.endDate?.toISOString() || '',

				entryType: config.entryType,
				entryConfig: {
					buyThreshold: config.buyThreshold,
					sellThreshold: config.sellThreshold,
					entryTimeConstraints: config.entryTimeConstraints
				},

				positionSizingType: config.positionSizing.type,
				positionSizingValue: config.positionSizing.type === 'PERCENTAGE'
					? config.positionSizing.percentageOfBankroll
					: config.positionSizing.fixedAmount,
				maxPositionSize: config.positionSizing.maxExposurePercent,

				stopLoss: config.exitRules.stopLoss,
				takeProfit: config.exitRules.takeProfit,
				timeBasedExit: config.exitRules.maxHoldTime,

				backtestResult: {
					finalCapital: backtestResult.endingCapital,
					totalReturnPercent: backtestResult.metrics.roi,
					totalTrades: backtestResult.metrics.totalTrades,
					winningTrades: backtestResult.metrics.winningTrades,
					losingTrades: backtestResult.metrics.losingTrades,
					breakEvenTrades: backtestResult.metrics.breakEvenTrades || 0,
					winRate: backtestResult.metrics.winRate,
					avgWin: backtestResult.metrics.avgWin,
					avgLoss: backtestResult.metrics.avgLoss,
					largestWin: backtestResult.metrics.largestWin || 0,
					largestLoss: backtestResult.metrics.largestLoss || 0,
					profitFactor: backtestResult.metrics.profitFactor,
					sharpeRatio: backtestResult.metrics.sharpeRatio,
					maxDrawdown: backtestResult.metrics.maxDrawdown,
					avgTradeDuration: backtestResult.metrics.avgTradeDuration || 0,
					trades: backtestResult.trades || [],
					equityCurve: backtestResult.metrics.equityCurve || [],
					pnlDistribution: backtestResult.metrics.pnlDistribution || {}
				}
			};

			const response = await fetch('/api/strategies', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(strategyData)
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to save strategy');
			}

			showSaveModal = false;
			showSuccessNotification = true;

			setTimeout(() => {
				showSuccessNotification = false;
				window.location.href = '/strategies';
			}, 3000);
		} catch (error: any) {
			saveError = error.message || 'Failed to save strategy';
		} finally {
			savingStrategy = false;
		}
	}

	// Check auth on component init
	checkAuth();

	// ---- Reactive derivations ----
	let sortedTrades = $derived(
		backtestResult?.trades
			? [...backtestResult.trades].sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime())
			: []
	);

	let topTrades = $derived(
		backtestResult?.trades
			? [...backtestResult.trades].sort((a, b) => b.pnl - a.pnl).slice(0, 5)
			: []
	);

	let worstBacktestTrades = $derived(
		backtestResult?.trades
			? [...backtestResult.trades].sort((a, b) => a.pnl - b.pnl).slice(0, 5)
			: []
	);

	let filteredTrades = $derived(
		backtestResult?.trades
			? backtestResult.trades.filter(trade => {
					if (tradeSearchQuery && !trade.marketName.toLowerCase().includes(tradeSearchQuery.toLowerCase())) {
						return false;
					}
					if (tradeFilterSide !== 'ALL' && trade.side !== tradeFilterSide) {
						return false;
					}
					if (tradeFilterExitReason !== 'ALL' && trade.exitReason !== tradeFilterExitReason) {
						return false;
					}
					return true;
			  })
			: []
	);

	let sortedAndFilteredTrades = $derived(
		[...filteredTrades].sort((a, b) => {
			if (!tradeSortColumn) return 0;

			let aVal: number, bVal: number;
			switch (tradeSortColumn) {
				case 'entry':
					aVal = new Date(a.entryTime).getTime();
					bVal = new Date(b.entryTime).getTime();
					break;
				case 'exit':
					aVal = a.exitTime ? new Date(a.exitTime).getTime() : 0;
					bVal = b.exitTime ? new Date(b.exitTime).getTime() : 0;
					break;
				case 'pnl':
					aVal = a.pnl;
					bVal = b.pnl;
					break;
				case 'percent':
					aVal = a.pnlPercentage;
					bVal = b.pnlPercentage;
					break;
				case 'duration':
					aVal = a.holdingDuration || 0;
					bVal = b.holdingDuration || 0;
					break;
				default:
					return 0;
			}

			return tradeSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
		})
	);

	let paginatedTrades = $derived(
		sortedAndFilteredTrades.slice(
			tradesCurrentPage * tradesPerPage,
			(tradesCurrentPage + 1) * tradesPerPage
		)
	);

	let totalTradesPages = $derived(Math.ceil(sortedAndFilteredTrades.length / tradesPerPage));

	// Reset to page 0 when filters change
	$effect(() => {
		// Access reactive deps
		tradeSearchQuery;
		tradeFilterSide;
		tradeFilterExitReason;
		tradesCurrentPage = 0;
	});

	let pnlDistribution = $derived(
		backtestResult?.trades
			? (() => {
					const trades = backtestResult.trades;
					if (trades.length === 0) return { buckets: [], stats: null };

					const pnls = trades.map(t => t.pnlPercentage);
					const minPnl = Math.min(...pnls);
					const maxPnl = Math.max(...pnls);

					const bucketCount = trades.length < 20 ? 5 : trades.length < 50 ? 8 : trades.length < 100 ? 10 : 15;

					const rawRange = maxPnl - minPnl;
					const bucketSize = rawRange / bucketCount;

					const buckets = Array(bucketCount).fill(0).map((_, i) => ({
						min: minPnl + i * bucketSize,
						max: minPnl + (i + 1) * bucketSize,
						count: 0,
						trades: [] as number[]
					}));

					trades.forEach(trade => {
						const pnl = trade.pnlPercentage;
						const bucketIndex = Math.min(
							Math.floor((pnl - minPnl) / bucketSize),
							bucketCount - 1
						);
						buckets[bucketIndex].count++;
						buckets[bucketIndex].trades.push(pnl);
					});

					const winningTrades = pnls.filter(p => p > 0);
					const losingTrades = pnls.filter(p => p < 0);
					const breakEvenTrades = pnls.filter(p => p === 0);

					const stats = {
						winCount: winningTrades.length,
						lossCount: losingTrades.length,
						breakEvenCount: breakEvenTrades.length,
						avgWin: winningTrades.length > 0 ? winningTrades.reduce((a, b) => a + b, 0) / winningTrades.length : 0,
						avgLoss: losingTrades.length > 0 ? losingTrades.reduce((a, b) => a + b, 0) / losingTrades.length : 0,
						largestWin: winningTrades.length > 0 ? Math.max(...winningTrades) : 0,
						largestLoss: losingTrades.length > 0 ? Math.min(...losingTrades) : 0,
						median: pnls.sort((a, b) => a - b)[Math.floor(pnls.length / 2)],
						mean: pnls.reduce((a, b) => a + b, 0) / pnls.length
					};

					return { buckets, stats };
			  })()
			: { buckets: [], stats: null }
	);

	let availableExitReasons = $derived(
		backtestResult?.trades
			? ['ALL', ...new Set(backtestResult.trades.map(t => t.exitReason).filter(Boolean))]
			: ['ALL']
	);
</script>

<!-- ============= COMPREHENSIVE RESULTS DISPLAY ============= -->
<div class="results-panel">

	<!-- Export Buttons -->
	<div class="export-actions">
		<button class="btn-save" onclick={showSaveStrategyModal}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
				<polyline points="17 21 17 13 7 13 7 21"/>
				<polyline points="7 3 7 8 15 8"/>
			</svg>
			Save Strategy
		</button>
		<button class="btn-export" onclick={exportToCSV}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
			</svg>
			Export CSV
		</button>
		<button class="btn-export" onclick={exportMetricsJSON}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
				<polyline points="14 2 14 8 20 8"/>
			</svg>
			Export JSON
		</button>
	</div>

	<!-- HERO SUMMARY SECTION -->
	<div class="hero-summary">
		<div class="hero-main">
			<div class="capital-display">
				<div class="capital-item">
					<div class="capital-label">Initial Capital</div>
					<div class="capital-value">{formatUSDC(backtestResult.startingCapital)}</div>
				</div>
				<div class="capital-arrow">&rarr;</div>
				<div class="capital-item">
					<div class="capital-label">Final Capital</div>
					<div
						class="capital-value"
						class:positive={backtestResult.endingCapital >= backtestResult.startingCapital}
						class:negative={backtestResult.endingCapital < backtestResult.startingCapital}
					>
						{formatUSDC(backtestResult.endingCapital)}
					</div>
				</div>
			</div>

			<div class="pnl-display">
				<div class="pnl-label">Net P&L</div>
				<div
					class="pnl-value"
					class:positive={backtestResult.metrics.netPnl >= 0}
					class:negative={backtestResult.metrics.netPnl < 0}
				>
					{backtestResult.metrics.netPnl >= 0 ? '+' : ''}{formatUSDC(backtestResult.metrics.netPnl)}
				</div>
				<div class="pnl-subtitle">
					ROI: <span class:positive={backtestResult.metrics.roi >= 0} class:negative={backtestResult.metrics.roi < 0}>
						{formatPercentage(backtestResult.metrics.roi)}
					</span>
				</div>
			</div>
		</div>

		<div class="hero-stats">
			<div class="stat-pill">
				<span class="stat-label">Execution</span>
				<span class="stat-value">{(backtestResult.executionTime / 1000).toFixed(2)}s</span>
			</div>
			<div class="stat-pill">
				<span class="stat-label">Trades</span>
				<span class="stat-value">{backtestResult.metrics.totalTrades}</span>
			</div>
			<div class="stat-pill">
				<span class="stat-label">Win/Loss</span>
				<span class="stat-value">{backtestResult.metrics.winningTrades}/{backtestResult.metrics.losingTrades}</span>
			</div>
			<div class="stat-pill">
				<span class="stat-label">Win Rate</span>
				<span
					class="stat-value"
					class:positive={backtestResult.metrics.winRate >= 50}
					class:negative={backtestResult.metrics.winRate < 50}
				>
					{backtestResult.metrics.winRate.toFixed(1)}%
				</span>
			</div>
		</div>
	</div>

	<!-- NO TRADES WARNING -->
	{#if backtestResult.metrics.totalTrades === 0}
		<div class="warning-box">
			<h3>No Trades Executed</h3>
			<p>The backtest completed but no trades matched your criteria.</p>
			<p><strong>Suggestions:</strong> Try wider price thresholds, different date ranges, or markets with higher trading volume.</p>
		</div>
	{:else}

		<!-- CORE PERFORMANCE METRICS -->
		<div class="section">
			<h2>Core Performance Metrics</h2>
			<div class="metrics-grid-4">
				<div class="metric-card">
					<div class="metric-label">Average Win</div>
					<div class="metric-value positive">{formatUSDC(backtestResult.metrics.avgWin)}</div>
				</div>
				<div class="metric-card">
					<div class="metric-label">Average Loss</div>
					<div class="metric-value negative">{formatUSDC(backtestResult.metrics.avgLoss)}</div>
				</div>
				<div class="metric-card">
					<div class="metric-label">Best Trade</div>
					<div class="metric-value positive">{formatUSDC(backtestResult.metrics.bestTrade)}</div>
					<div class="metric-sublabel">
						{((backtestResult.metrics.bestTrade / backtestResult.startingCapital) * 100).toFixed(1)}% of capital
					</div>
				</div>
				<div class="metric-card">
					<div class="metric-label">Worst Trade</div>
					<div class="metric-value negative">{formatUSDC(backtestResult.metrics.worstTrade)}</div>
					<div class="metric-sublabel">
						{((Math.abs(backtestResult.metrics.worstTrade) / backtestResult.startingCapital) * 100).toFixed(1)}% of capital
					</div>
				</div>
				<div class="metric-card">
					<div class="metric-label">Profit Factor</div>
					<div class="metric-value">{backtestResult.metrics.profitFactor.toFixed(2)}</div>
					<div class="metric-sublabel">
						{backtestResult.metrics.profitFactor > 2 ? 'Excellent' : backtestResult.metrics.profitFactor > 1.5 ? 'Good' : backtestResult.metrics.profitFactor > 1 ? 'Fair' : 'Poor'}
					</div>
				</div>
				<div class="metric-card">
					<div class="metric-label">Expectancy</div>
					<div class="metric-value">{formatUSDC(backtestResult.metrics.expectancy)}</div>
					<div class="metric-sublabel">per trade</div>
				</div>
				<div class="metric-card">
					<div class="metric-label">Avg Hold Time</div>
					<div class="metric-value">{backtestResult.metrics.avgHoldTime.toFixed(1)}h</div>
					<div class="metric-sublabel">
						{(backtestResult.metrics.avgHoldTime / 24).toFixed(1)} days
					</div>
				</div>
				<div class="metric-card">
					<div class="metric-label">Total Fees</div>
					<div class="metric-value negative">{formatUSDC(backtestResult.metrics.totalFees)}</div>
					<div class="metric-sublabel">
						{((backtestResult.metrics.totalFees / Math.abs(backtestResult.metrics.totalPnl)) * 100).toFixed(1)}% of P&L
					</div>
				</div>
			</div>
		</div>

		<!-- CHARTS SECTION -->
		<div class="section">
			<h2>Performance Charts</h2>

			<!-- Equity Curve -->
			<div class="chart-wrapper">
				<EquityCurveChart
					equityCurve={backtestResult.metrics.equityCurve}
					initialCapital={backtestResult.startingCapital}
				/>
			</div>

			<!-- P&L Distribution -->
			<PnLDistributionChart distribution={pnlDistribution} />
		</div>

		<!-- ADVANCED METRICS -->
		<div class="section">
			<h3 class="advanced-metrics-title">Advanced Metrics</h3>
			<div class="metrics-grid-4">
					<div class="metric-card">
						<div class="metric-label">Max Drawdown</div>
						<div class="metric-value negative">{formatUSDC(backtestResult.metrics.maxDrawdown)}</div>
						<div class="metric-sublabel">{backtestResult.metrics.maxDrawdownPercentage.toFixed(2)}%</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Sharpe Ratio</div>
						<div class="metric-value">{backtestResult.metrics.sharpeRatio.toFixed(2)}</div>
						<div class="metric-sublabel">
							{backtestResult.metrics.sharpeRatio > 2 ? 'Excellent' : backtestResult.metrics.sharpeRatio > 1 ? 'Good' : backtestResult.metrics.sharpeRatio > 0 ? 'Fair' : 'Poor'}
						</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Volatility</div>
						<div class="metric-value">{backtestResult.metrics.volatility.toFixed(2)}%</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Capital Utilization</div>
						<div class="metric-value">{backtestResult.metrics.capitalUtilization.toFixed(1)}%</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Median Win</div>
						<div class="metric-value positive">{formatUSDC(backtestResult.metrics.medianWin)}</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Median Loss</div>
						<div class="metric-value negative">{formatUSDC(backtestResult.metrics.medianLoss)}</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Consecutive Wins</div>
						<div class="metric-value positive">{backtestResult.metrics.consecutiveWins}</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Consecutive Losses</div>
						<div class="metric-value negative">{backtestResult.metrics.consecutiveLosses}</div>
					</div>
			</div>
		</div>

		<!-- YES vs NO PERFORMANCE -->
		<div class="section">
			<h2>Side Performance</h2>
			<div class="side-performance-grid">
				<div class="side-card yes-side">
					<div class="side-header">
						<span class="side-badge">YES</span>
						<span class="side-count">{backtestResult.metrics.yesPerformance.count} trades</span>
					</div>
					<div class="side-metrics">
						<div class="side-metric">
							<span>Win Rate</span>
							<span class="value">{backtestResult.metrics.yesPerformance.winRate.toFixed(1)}%</span>
						</div>
						<div class="side-metric">
							<span>Total P&L</span>
							<span
								class="value"
								class:positive={backtestResult.metrics.yesPerformance.pnl >= 0}
								class:negative={backtestResult.metrics.yesPerformance.pnl < 0}
							>
								{formatUSDC(backtestResult.metrics.yesPerformance.pnl)}
							</span>
						</div>
						<div class="side-metric">
							<span>Avg Win</span>
							<span class="value positive">{formatUSDC(backtestResult.metrics.yesPerformance.avgWin)}</span>
						</div>
						<div class="side-metric">
							<span>Avg Loss</span>
							<span class="value negative">{formatUSDC(backtestResult.metrics.yesPerformance.avgLoss)}</span>
						</div>
					</div>
				</div>

				<div class="side-card no-side">
					<div class="side-header">
						<span class="side-badge">NO</span>
						<span class="side-count">{backtestResult.metrics.noPerformance.count} trades</span>
					</div>
					<div class="side-metrics">
						<div class="side-metric">
							<span>Win Rate</span>
							<span class="value">{backtestResult.metrics.noPerformance.winRate.toFixed(1)}%</span>
						</div>
						<div class="side-metric">
							<span>Total P&L</span>
							<span
								class="value"
								class:positive={backtestResult.metrics.noPerformance.pnl >= 0}
								class:negative={backtestResult.metrics.noPerformance.pnl < 0}
							>
								{formatUSDC(backtestResult.metrics.noPerformance.pnl)}
							</span>
						</div>
						<div class="side-metric">
							<span>Avg Win</span>
							<span class="value positive">{formatUSDC(backtestResult.metrics.noPerformance.avgWin)}</span>
						</div>
						<div class="side-metric">
							<span>Avg Loss</span>
							<span class="value negative">{formatUSDC(backtestResult.metrics.noPerformance.avgLoss)}</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- BEST & WORST TRADES -->
		<div class="section">
			<h2>Best & Worst Trades</h2>
			<div class="trades-comparison-grid">
				<div class="trades-panel">
					<h3>Top 5 Trades</h3>
					{#each topTrades as trade}
						<div class="comparison-trade-item">
							<div class="trade-info-compact">
								<div class="trade-market-compact">{trade.marketName.substring(0, 40)}...</div>
								<div class="trade-meta-compact">
									<span class="trade-badge {trade.side.toLowerCase()}">{trade.side}</span>
									<span class="trade-date-compact">{formatDateTime(trade.entryTime)}</span>
								</div>
							</div>
							<div class="trade-result positive">
								{formatUSDC(trade.pnl)}
								<span class="trade-percent">({formatPercentage(trade.pnlPercentage)})</span>
							</div>
						</div>
					{/each}
				</div>

				<div class="trades-panel">
					<h3>Worst 5 Trades</h3>
					{#each worstBacktestTrades as trade}
						<div class="comparison-trade-item">
							<div class="trade-info-compact">
								<div class="trade-market-compact">{trade.marketName.substring(0, 40)}...</div>
								<div class="trade-meta-compact">
									<span class="trade-badge {trade.side.toLowerCase()}">{trade.side}</span>
									<span class="trade-date-compact">{formatDateTime(trade.entryTime)}</span>
								</div>
							</div>
							<div class="trade-result negative">
								{formatUSDC(trade.pnl)}
								<span class="trade-percent">({formatPercentage(trade.pnlPercentage)})</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- ENHANCED TRADE BREAKDOWN TABLE -->
		<div class="section">
			<div class="table-header">
				<h2>Trade Breakdown ({sortedAndFilteredTrades.length} of {backtestResult.trades.length})</h2>

				<!-- Filters Row -->
				<div class="table-filters">
					<input
						type="text"
						placeholder="Search markets..."
						bind:value={tradeSearchQuery}
						class="table-search"
					/>
					<select bind:value={tradeFilterSide} class="table-filter-select">
						<option value="ALL">All Sides</option>
						<option value="YES">YES only</option>
						<option value="NO">NO only</option>
					</select>
					<select bind:value={tradeFilterExitReason} class="table-filter-select">
						{#each availableExitReasons as reason}
							<option value={reason}>{reason === 'ALL' ? 'All Exit Reasons' : reason}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="trades-table-wrapper">
				<table class="trades-table">
					<thead>
						<tr>
							<th>Market</th>
							<th>Side</th>
							<th class="sortable" onclick={() => sortTradesBy('entry')}>
								Entry
								{#if tradeSortColumn === 'entry'}
									<span class="sort-indicator">{tradeSortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
								{/if}
							</th>
							<th class="sortable" onclick={() => sortTradesBy('exit')}>
								Exit
								{#if tradeSortColumn === 'exit'}
									<span class="sort-indicator">{tradeSortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
								{/if}
							</th>
							<th>Entry Price</th>
							<th>Exit Price</th>
							<th>Amount</th>
							<th>Shares</th>
							<th class="sortable" onclick={() => sortTradesBy('pnl')}>
								P&L ($)
								{#if tradeSortColumn === 'pnl'}
									<span class="sort-indicator">{tradeSortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
								{/if}
							</th>
							<th class="sortable" onclick={() => sortTradesBy('percent')}>
								P&L (%)
								{#if tradeSortColumn === 'percent'}
									<span class="sort-indicator">{tradeSortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
								{/if}
							</th>
							<th>Exit Reason</th>
							<th class="sortable" onclick={() => sortTradesBy('duration')}>
								Duration
								{#if tradeSortColumn === 'duration'}
									<span class="sort-indicator">{tradeSortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
								{/if}
							</th>
						</tr>
					</thead>
					<tbody>
						{#each paginatedTrades as trade}
							<tr>
								<td class="market-cell" title={trade.marketName}>
									{trade.marketName.substring(0, 35)}...
								</td>
								<td>
									<span class="trade-badge {trade.side.toLowerCase()}">{trade.side}</span>
								</td>
								<td class="date-cell">{formatDate(trade.entryTime)}</td>
								<td class="date-cell">{trade.exitTime ? formatDate(trade.exitTime) : '-'}</td>
								<td class="price-cell">{trade.entryPrice.toFixed(3)}</td>
								<td class="price-cell">{trade.exitPrice.toFixed(3)}</td>
								<td class="amount-cell">{formatUSDC(trade.amountInvested)}</td>
								<td class="shares-cell">{trade.shares.toFixed(2)}</td>
								<td class="pnl-cell" class:positive={trade.pnl >= 0} class:negative={trade.pnl < 0}>
									{formatUSDC(trade.pnl)}
								</td>
								<td class="percent-cell" class:positive={trade.pnl >= 0} class:negative={trade.pnl < 0}>
									{formatPercentage(trade.pnlPercentage)}
								</td>
								<td class="reason-cell">
									<span class="exit-reason-badge">{trade.exitReason || '-'}</span>
								</td>
								<td class="duration-cell">
									{trade.holdingDuration ? `${trade.holdingDuration.toFixed(1)}h` : '-'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Pagination Controls -->
			{#if totalTradesPages > 1}
				<div class="pagination-controls">
					<button
						class="pagination-btn"
						onclick={() => tradesCurrentPage = Math.max(0, tradesCurrentPage - 1)}
						disabled={tradesCurrentPage === 0}
					>
						&larr; Previous
					</button>
					<span class="pagination-info">
						Page {tradesCurrentPage + 1} of {totalTradesPages}
						(Showing {paginatedTrades.length} of {sortedAndFilteredTrades.length} trades)
					</span>
					<button
						class="pagination-btn"
						onclick={() => tradesCurrentPage = Math.min(totalTradesPages - 1, tradesCurrentPage + 1)}
						disabled={tradesCurrentPage >= totalTradesPages - 1}
					>
						Next &rarr;
					</button>
				</div>
			{/if}
		</div>

	{/if}
</div>

<!-- Success Notification -->
{#if showSuccessNotification}
	<div class="success-notification">
		<div class="success-content">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
				<circle cx="12" cy="12" r="10" fill="#10b981"/>
				<path d="M8 12l3 3 5-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			<div>
				<h3>Strategy Saved Successfully!</h3>
				<p>Your backtest strategy has been saved. Redirecting to strategies page...</p>
			</div>
			<button onclick={() => showSuccessNotification = false} class="close-notification">
				<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
					<path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/>
				</svg>
			</button>
		</div>
	</div>
{/if}

<!-- Authentication Required Modal -->
{#if showAuthModal}
	<div class="modal-overlay" onclick={() => (showAuthModal = false)}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="modal-content auth-modal" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>Authentication Required</h2>
				<button class="modal-close" onclick={() => (showAuthModal = false)}>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"/>
						<line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>

			<div class="modal-body">
				<p class="modal-description">To save your strategy, please authenticate with one of the following methods:</p>

				<div class="auth-options">
					{#if $walletStore.connected}
						<button class="auth-option" onclick={authenticateWallet} disabled={isAuthenticating}>
							<div class="auth-icon wallet-icon">
								<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
									<path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
									<path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
								</svg>
							</div>
							<div class="auth-text">
								<div class="auth-title">
									{isAuthenticating ? 'Signing...' : 'Sign with Wallet'}
								</div>
								<div class="auth-subtitle">
									{$walletStore.publicKey?.toBase58().slice(0, 8)}...{$walletStore.publicKey?.toBase58().slice(-8)}
								</div>
							</div>
						</button>
					{:else}
						<div class="auth-option disabled">
							<div class="auth-icon wallet-icon">
								<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
									<path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
									<path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
								</svg>
							</div>
							<div class="auth-text">
								<div class="auth-title">Connect Wallet First</div>
								<div class="auth-subtitle">Use the wallet button in the navbar</div>
							</div>
						</div>
					{/if}

					<a href="/api/auth/login" class="auth-option">
						<div class="auth-icon google-icon">
							<svg width="24" height="24" viewBox="0 0 24 24">
								<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
								<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
								<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
								<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
							</svg>
						</div>
						<div class="auth-text">
							<div class="auth-title">Sign in with Google</div>
							<div class="auth-subtitle">Quick and secure</div>
						</div>
					</a>
				</div>

				{#if saveError}
					<div class="error-message">{saveError}</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Save Strategy Modal -->
{#if showSaveModal}
	<div class="modal-overlay" onclick={() => (showSaveModal = false)}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>Save Strategy</h2>
				<button class="modal-close" onclick={() => (showSaveModal = false)}>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"/>
						<line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>

			<div class="modal-body">
				<p class="modal-description">Give your strategy a name to save it for future reference</p>

				<div class="form-group">
					<label for="strategy-name">Strategy Name</label>
					<input
						id="strategy-name"
						type="text"
						bind:value={strategyName}
						placeholder="Enter a name for your strategy"
						maxlength="100"
						disabled={savingStrategy}
					/>
				</div>

				{#if saveError}
					<div class="error-message">{saveError}</div>
				{/if}

				<div class="modal-actions">
					<button
						class="btn-cancel"
						onclick={() => (showSaveModal = false)}
						disabled={savingStrategy}
					>
						Cancel
					</button>
					<button
						class="btn-save-confirm"
						onclick={saveStrategy}
						disabled={savingStrategy || !strategyName.trim()}
					>
						{savingStrategy ? 'Saving...' : 'Save Strategy'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Results Panel */
	.results-panel {
		display: flex;
		flex-direction: column;
		gap: 24px;
		margin-top: 1.5rem;
	}

	/* Export Actions */
	.export-actions {
		display: flex;
		gap: 12px;
		margin-bottom: 24px;
		justify-content: flex-end;
	}

	.btn-export {
		background: #000000;
		border: 1px solid #404040;
		color: white;
		padding: 10px 20px;
		font-size: 14px;
		font-weight: 600;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.btn-export:hover {
		background: rgba(249, 115, 22, 0.1);
		border-color: #F97316;
		transform: translateY(-1px);
	}

	.btn-export svg {
		margin-right: 6px;
	}

	/* Save Strategy Button */
	.btn-save {
		background: #F97316;
		border: 1px solid #F97316;
		color: white;
		padding: 10px 20px;
		border-radius: 8px;
		cursor: pointer;
		font-size: 14px;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 8px;
		transition: all 0.2s;
	}

	.btn-save:hover {
		background: #ea580c;
	}

	.btn-save svg {
		flex-shrink: 0;
	}

	/* Hero Summary Section */
	.hero-summary {
		background: #000000;
		border-radius: 16px;
		padding: 32px;
		margin-bottom: 32px;
		border: 1px solid #404040;
		box-shadow: 0 8px 24px rgba(0,0,0,0.4);
	}

	.hero-main {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 32px;
		margin-bottom: 24px;
	}

	.capital-display {
		display: flex;
		align-items: center;
		gap: 20px;
		flex: 1;
	}

	.capital-item {
		text-align: center;
	}

	.capital-label {
		font-size: 12px;
		color: #9ca3af;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 8px;
		font-weight: 500;
	}

	.capital-value {
		font-size: 28px;
		font-weight: 700;
		color: white;
	}

	.capital-arrow {
		font-size: 32px;
		color: #6b7280;
		font-weight: 300;
	}

	.pnl-display {
		text-align: right;
		flex: 1;
	}

	.pnl-label {
		font-size: 14px;
		color: #9ca3af;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 8px;
		font-weight: 500;
	}

	.pnl-value {
		font-size: 36px;
		font-weight: 800;
		margin-bottom: 8px;
		text-shadow: 0 2px 8px rgba(0,0,0,0.3);
	}

	.pnl-subtitle {
		font-size: 14px;
		color: #9ca3af;
	}

	.pnl-subtitle span {
		font-weight: 600;
		font-size: 16px;
	}

	/* Hero Stats */
	.hero-stats {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
	}

	.stat-pill {
		background: #000000;
		border: 1px solid #404040;
		border-radius: 12px;
		padding: 12px 20px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 120px;
	}

	.stat-label {
		font-size: 11px;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
	}

	.stat-value {
		font-size: 18px;
		font-weight: 700;
		color: white;
	}

	/* Metrics Grid - 4 columns */
	.metrics-grid-4 {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16px;
		margin-top: 20px;
	}

	@media (max-width: 1400px) {
		.metrics-grid-4 {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (max-width: 900px) {
		.metrics-grid-4 {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 600px) {
		.metrics-grid-4 {
			grid-template-columns: 1fr;
		}
	}

	/* Section */
	.section {
		margin-bottom: 32px;
	}

	.section h2 {
		font-size: 18px;
		font-weight: 600;
		color: white;
		margin-bottom: 16px;
	}

	/* Metric Card */
	.metric-card {
		background: #000000;
		border: 1px solid #404040;
		border-radius: 12px;
		padding: 20px;
		text-align: center;
	}

	.metric-label {
		font-size: 12px;
		color: #8b92ab;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 8px;
		font-weight: 600;
	}

	.metric-value {
		font-size: 24px;
		font-weight: 700;
		color: white;
	}

	.metric-value.positive {
		color: #10b981;
	}

	.metric-value.negative {
		color: #ef4444;
	}

	.metric-sublabel {
		font-size: 12px;
		color: #6b7280;
		margin-top: 4px;
	}

	/* Advanced Metrics Title */
	.advanced-metrics-title {
		font-size: 16px;
		font-weight: 600;
		color: white;
		margin: 0 0 20px 0;
	}

	/* Chart Wrapper */
	.chart-wrapper {
		margin-bottom: 24px;
	}

	/* Warning Box */
	.warning-box {
		background: #2d1b0e;
		border: 2px solid #d97706;
		border-radius: 12px;
		padding: 1.5rem;
		margin: 2rem 0;
	}

	.warning-box h3 {
		color: #fbbf24;
		margin: 0 0 1rem 0;
		font-size: 1.1rem;
	}

	.warning-box p {
		color: #e5e7eb;
		margin: 0.5rem 0;
		line-height: 1.6;
	}

	.warning-box strong {
		color: #fbbf24;
	}

	/* Side Performance Grid */
	.side-performance-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 20px;
		margin-top: 20px;
	}

	@media (max-width: 900px) {
		.side-performance-grid {
			grid-template-columns: 1fr;
		}
	}

	.side-card {
		background: #000000;
		border-radius: 12px;
		padding: 24px;
		border: 2px solid;
	}

	.side-card.yes-side {
		border-color: #10b981;
	}

	.side-card.no-side {
		border-color: #ef4444;
	}

	.side-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
		padding-bottom: 16px;
		border-bottom: 1px solid #404040;
	}

	.side-badge {
		font-size: 20px;
		font-weight: 800;
		padding: 8px 20px;
		border-radius: 8px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.side-card.yes-side .side-badge {
		background: rgba(16, 185, 129, 0.2);
		color: #10b981;
		border: 2px solid #10b981;
	}

	.side-card.no-side .side-badge {
		background: rgba(239, 68, 68, 0.2);
		color: #ef4444;
		border: 2px solid #ef4444;
	}

	.side-count {
		font-size: 14px;
		color: #9ca3af;
		font-weight: 500;
	}

	.side-metrics {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.side-metric {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px;
		background: #000000;
		border-radius: 8px;
	}

	.side-metric span:first-child {
		font-size: 14px;
		color: #9ca3af;
		font-weight: 500;
	}

	.side-metric .value {
		font-size: 16px;
		font-weight: 700;
		color: white;
	}

	/* Trades Comparison Grid */
	.trades-comparison-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 20px;
		margin-top: 20px;
	}

	@media (max-width: 900px) {
		.trades-comparison-grid {
			grid-template-columns: 1fr;
		}
	}

	.trades-panel {
		background: #000000;
		border-radius: 12px;
		padding: 24px;
		border: 1px solid #404040;
	}

	.trades-panel h3 {
		margin: 0 0 20px 0;
		font-size: 18px;
		font-weight: 600;
		color: white;
		padding-bottom: 12px;
		border-bottom: 1px solid #404040;
	}

	.comparison-trade-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px;
		background: #000000;
		border-radius: 8px;
		margin-bottom: 12px;
		border: 1px solid #404040;
	}

	.trade-info-compact {
		flex: 1;
		min-width: 0;
	}

	.trade-market-compact {
		font-size: 13px;
		color: white;
		margin-bottom: 6px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.trade-meta-compact {
		display: flex;
		gap: 12px;
		align-items: center;
		font-size: 11px;
		color: #6b7280;
	}

	.trade-date-compact {
		font-size: 11px;
		color: #6b7280;
	}

	.trade-result {
		text-align: right;
		font-size: 16px;
		font-weight: 700;
		white-space: nowrap;
		margin-left: 16px;
	}

	.trade-percent {
		font-size: 12px;
		font-weight: 500;
		opacity: 0.8;
	}

	/* Trade Badge */
	.trade-badge {
		font-size: 11px;
		font-weight: 600;
		width: fit-content;
		padding: 2px 6px;
		border-radius: 4px;
	}

	.trade-badge.yes {
		background: rgba(0, 214, 143, 0.1);
		color: #00d68f;
	}

	.trade-badge.no {
		background: rgba(255, 107, 107, 0.1);
		color: #ff6b6b;
	}

	/* Table Filters */
	.table-header {
		margin-bottom: 20px;
	}

	.table-header h2 {
		margin-bottom: 16px;
	}

	.table-filters {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		align-items: center;
	}

	.table-search {
		flex: 1;
		min-width: 200px;
		padding: 10px 14px;
		background: #000000;
		border: 1px solid #404040;
		border-radius: 8px;
		color: #e2e8f0;
		font-size: 14px;
		transition: all 0.2s ease;
	}

	.table-search:focus {
		outline: none;
		border-color: #F97316;
	}

	.table-search::placeholder {
		color: #64748b;
	}

	.table-filter-select {
		padding: 10px 14px;
		background: #000000;
		border: 1px solid #404040;
		border-radius: 8px;
		color: #e2e8f0;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.table-filter-select:hover {
		border-color: #F97316;
	}

	.table-filter-select:focus {
		outline: none;
		border-color: #F97316;
	}

	/* Enhanced Trade Table */
	.trades-table-wrapper {
		overflow-x: auto;
		background: #000000;
		border-radius: 12px;
		border: 1px solid #404040;
	}

	.trades-table {
		width: 100%;
		border-collapse: collapse;
	}

	.trades-table thead {
		background: #000000;
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.trades-table th {
		padding: 16px 12px;
		text-align: left;
		font-size: 13px;
		font-weight: 600;
		color: #9ca3af;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 2px solid #404040;
		white-space: nowrap;
	}

	.trades-table th.sortable {
		cursor: pointer;
		user-select: none;
		transition: all 0.2s ease;
	}

	.trades-table th.sortable:hover {
		color: #F97316;
		background: #000000;
	}

	.sort-indicator {
		display: inline-block;
		margin-left: 6px;
		font-size: 12px;
		color: #F97316;
		font-weight: bold;
	}

	.trades-table td {
		padding: 14px 12px;
		font-size: 13px;
		color: #e2e8f0;
		border-bottom: 1px solid #404040;
	}

	.trades-table tbody tr {
		transition: background 0.2s ease;
	}

	.trades-table tbody tr:hover {
		background: #000000;
	}

	.market-cell {
		max-width: 250px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 500;
	}

	.date-cell {
		color: #9ca3af;
		font-size: 12px;
	}

	.price-cell,
	.amount-cell,
	.shares-cell {
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 12px;
		color: #cbd5e0;
	}

	.pnl-cell,
	.percent-cell {
		font-weight: 700;
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 13px;
	}

	.pnl-cell.positive,
	.percent-cell.positive {
		color: #10b981;
	}

	.pnl-cell.negative,
	.percent-cell.negative {
		color: #ef4444;
	}

	.reason-cell {
		font-size: 12px;
	}

	.exit-reason-badge {
		display: inline-block;
		padding: 4px 10px;
		background: #2d3748;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		color: #9ca3af;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.duration-cell {
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 12px;
		color: #cbd5e0;
	}

	/* Pagination Controls */
	.pagination-controls {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 20px;
		padding: 20px;
		background: #000000;
		border-top: 1px solid #404040;
		border-radius: 0 0 12px 12px;
	}

	.pagination-btn {
		padding: 8px 16px;
		background: #000000;
		border: 1px solid #404040;
		border-radius: 8px;
		color: #e2e8f0;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.pagination-btn:hover:not(:disabled) {
		background: #2d3748;
		border-color: #F97316;
		color: #F97316;
	}

	.pagination-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.pagination-info {
		font-size: 14px;
		color: #9ca3af;
	}

	/* Positive/Negative value classes */
	.positive {
		color: #10b981;
	}

	.negative {
		color: #ef4444;
	}

	.trade-result.positive {
		color: #00d68f;
	}

	.trade-result.negative {
		color: #ff6b6b;
	}

	.value.positive {
		color: #10b981;
	}

	.value.negative {
		color: #ef4444;
	}

	/* Save Modal */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
	}

	.modal-content {
		background: #1a1f35;
		border: 1px solid #404040;
		border-radius: 16px;
		max-width: 500px;
		width: 100%;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		position: relative;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 28px 28px 20px 28px;
		border-bottom: 1px solid #404040;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
		color: white;
		letter-spacing: -0.5px;
	}

	.modal-close {
		background: transparent;
		border: none;
		color: #8b92ab;
		cursor: pointer;
		padding: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.2s;
	}

	.modal-close:hover {
		color: white;
	}

	.modal-body {
		padding: 28px;
	}

	.modal-description {
		color: #8b92ab;
		margin: 0 0 28px 0;
		font-size: 14px;
		line-height: 1.6;
	}

	.form-group {
		margin-bottom: 24px;
	}

	.form-group label {
		display: block;
		color: #8b92ab;
		font-size: 12px;
		font-weight: 600;
		margin-bottom: 8px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.form-group input {
		width: 100%;
		background: #000000;
		border: 1px solid #FFFFFF;
		border-radius: 8px;
		padding: 12px 16px;
		color: white;
		font-size: 15px;
		transition: all 0.2s;
		box-sizing: border-box;
	}

	.form-group input:focus {
		outline: none;
		border-color: #F97316;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.form-group input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.form-group input::placeholder {
		color: #4a5066;
		opacity: 1;
	}

	.error-message {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid #ef4444;
		border-radius: 8px;
		padding: 12px;
		color: #ef4444;
		font-size: 14px;
		margin-bottom: 16px;
	}

	.modal-actions {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
	}

	.btn-cancel {
		background: transparent;
		border: 1px solid #404040;
		color: #8b92ab;
		padding: 12px 28px;
		border-radius: 8px;
		cursor: pointer;
		font-size: 14px;
		font-weight: 600;
		transition: all 0.2s;
	}

	.btn-cancel:hover:not(:disabled) {
		border-color: #F97316;
		background: rgba(249, 115, 22, 0.05);
		color: white;
	}

	.btn-cancel:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-save-confirm {
		background: #F97316;
		border: none;
		color: white;
		padding: 12px 32px;
		border-radius: 8px;
		cursor: pointer;
		font-size: 14px;
		font-weight: 600;
		transition: all 0.2s;
	}

	.btn-save-confirm:hover:not(:disabled) {
		background: #ea580c;
	}

	.btn-save-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	/* Auth Modal Styles */
	.auth-modal {
		max-width: 450px;
	}

	.auth-options {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 16px;
	}

	.auth-option {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 16px;
		background: #000000;
		border: 2px solid #FFFFFF;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s;
		text-decoration: none;
		color: inherit;
	}

	.auth-option:hover:not(.disabled) {
		border-color: #F97316;
		background: #000000;
		transform: translateY(-2px);
	}

	.auth-option.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.auth-option:disabled {
		opacity: 0.7;
		cursor: wait;
	}

	.auth-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border-radius: 12px;
		flex-shrink: 0;
	}

	.wallet-icon {
		background: linear-gradient(135deg, #9945ff 0%, #7928ca 100%);
		color: white;
	}

	.google-icon {
		background: white;
		padding: 8px;
	}

	.auth-text {
		flex: 1;
		text-align: left;
	}

	.auth-title {
		font-size: 16px;
		font-weight: 600;
		color: white;
		margin-bottom: 4px;
	}

	.auth-subtitle {
		font-size: 13px;
		color: #8b92ab;
	}

	/* Success Notification */
	.success-notification {
		position: fixed;
		top: 80px;
		right: 20px;
		z-index: 10000;
		animation: slideIn 0.3s ease-out;
	}

	@keyframes slideIn {
		from {
			transform: translateX(400px);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	.success-content {
		background: #000000;
		border: 2px solid #10b981;
		border-radius: 12px;
		padding: 20px;
		display: flex;
		align-items: flex-start;
		gap: 16px;
		min-width: 400px;
		max-width: 500px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
	}

	.success-content svg:first-child {
		flex-shrink: 0;
		margin-top: 2px;
	}

	.success-content h3 {
		margin: 0 0 4px 0;
		color: #10b981;
		font-size: 16px;
		font-weight: 700;
	}

	.success-content p {
		margin: 0;
		color: #8b92ab;
		font-size: 14px;
	}

	.close-notification {
		background: transparent;
		border: none;
		color: #6b7280;
		cursor: pointer;
		padding: 4px;
		margin-left: auto;
		flex-shrink: 0;
		transition: color 0.2s;
	}

	.close-notification:hover {
		color: white;
	}

	/* Responsive adjustments */
	@media (max-width: 1200px) {
		.hero-main {
			flex-direction: column;
			align-items: stretch;
		}

		.capital-display {
			justify-content: center;
		}

		.pnl-display {
			text-align: center;
		}

		.hero-stats {
			justify-content: center;
		}
	}

	@media (max-width: 768px) {
		.hero-summary {
			padding: 20px;
		}

		.capital-value {
			font-size: 22px;
		}

		.pnl-value {
			font-size: 28px;
		}

		.stat-pill {
			min-width: 100px;
			padding: 10px 16px;
		}

		.trades-table th,
		.trades-table td {
			padding: 10px 8px;
			font-size: 12px;
		}
	}

	/* Light mode overrides */
	:global(.light-mode) .results-panel {
		color: #1a1a2e;
	}

	:global(.light-mode) .hero-summary {
		background: #ffffff;
		border-color: #e5e7eb;
		box-shadow: 0 4px 12px rgba(0,0,0,0.08);
	}

	:global(.light-mode) .capital-value {
		color: #1a1a2e;
	}

	:global(.light-mode) .capital-label,
	:global(.light-mode) .pnl-label,
	:global(.light-mode) .pnl-subtitle {
		color: #6b7280;
	}

	:global(.light-mode) .stat-pill {
		background: #f9fafb;
		border-color: #e5e7eb;
	}

	:global(.light-mode) .stat-label {
		color: #6b7280;
	}

	:global(.light-mode) .stat-value {
		color: #1a1a2e;
	}

	:global(.light-mode) .metric-card {
		background: #ffffff;
		border-color: #e5e7eb;
	}

	:global(.light-mode) .metric-label {
		color: #6b7280;
	}

	:global(.light-mode) .metric-value {
		color: #1a1a2e;
	}

	:global(.light-mode) .metric-value.positive {
		color: #059669;
	}

	:global(.light-mode) .metric-value.negative {
		color: #dc2626;
	}

	:global(.light-mode) .metric-sublabel {
		color: #9ca3af;
	}

	:global(.light-mode) .side-card {
		background: #ffffff;
	}

	:global(.light-mode) .side-header {
		border-bottom-color: #e5e7eb;
	}

	:global(.light-mode) .side-metric {
		background: #f9fafb;
	}

	:global(.light-mode) .side-metric span:first-child {
		color: #6b7280;
	}

	:global(.light-mode) .side-metric .value {
		color: #1a1a2e;
	}

	:global(.light-mode) .trades-panel {
		background: #ffffff;
		border-color: #e5e7eb;
	}

	:global(.light-mode) .trades-panel h3 {
		color: #1a1a2e;
		border-bottom-color: #e5e7eb;
	}

	:global(.light-mode) .comparison-trade-item {
		background: #f9fafb;
		border-color: #e5e7eb;
	}

	:global(.light-mode) .trade-market-compact {
		color: #1a1a2e;
	}

	:global(.light-mode) .trade-result.positive {
		color: #059669;
	}

	:global(.light-mode) .trade-result.negative {
		color: #dc2626;
	}

	:global(.light-mode) .trades-table-wrapper {
		background: #ffffff;
		border-color: #e5e7eb;
	}

	:global(.light-mode) .trades-table thead {
		background: #f9fafb;
	}

	:global(.light-mode) .trades-table th {
		color: #6b7280;
		border-bottom-color: #e5e7eb;
	}

	:global(.light-mode) .trades-table td {
		color: #374151;
		border-bottom-color: #f3f4f6;
	}

	:global(.light-mode) .trades-table tbody tr:hover {
		background: #f9fafb;
	}

	:global(.light-mode) .table-search {
		background: #ffffff;
		border-color: #e5e7eb;
		color: #374151;
	}

	:global(.light-mode) .table-filter-select {
		background: #ffffff;
		border-color: #e5e7eb;
		color: #374151;
	}

	:global(.light-mode) .pagination-controls {
		background: #f9fafb;
		border-top-color: #e5e7eb;
	}

	:global(.light-mode) .pagination-btn {
		background: #ffffff;
		border-color: #e5e7eb;
		color: #374151;
	}

	:global(.light-mode) .pagination-info {
		color: #6b7280;
	}

	:global(.light-mode) .exit-reason-badge {
		background: #f3f4f6;
		color: #6b7280;
	}

	:global(.light-mode) .modal-content {
		background: #ffffff;
		border-color: #e5e7eb;
	}

	:global(.light-mode) .modal-header {
		border-bottom-color: #e5e7eb;
	}

	:global(.light-mode) .modal-header h2 {
		color: #1a1a2e;
	}

	:global(.light-mode) .modal-description {
		color: #6b7280;
	}

	:global(.light-mode) .form-group label {
		color: #6b7280;
	}

	:global(.light-mode) .form-group input {
		background: #f9fafb;
		border-color: #e5e7eb;
		color: #1a1a2e;
	}

	:global(.light-mode) .auth-option {
		background: #f9fafb;
		border-color: #e5e7eb;
	}

	:global(.light-mode) .auth-title {
		color: #1a1a2e;
	}

	:global(.light-mode) .auth-subtitle {
		color: #6b7280;
	}

	:global(.light-mode) .success-content {
		background: #ffffff;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
	}

	:global(.light-mode) .success-content h3 {
		color: #059669;
	}

	:global(.light-mode) .success-content p {
		color: #6b7280;
	}

	:global(.light-mode) .warning-box {
		background: #fffbeb;
		border-color: #f59e0b;
	}

	:global(.light-mode) .warning-box h3 {
		color: #b45309;
	}

	:global(.light-mode) .warning-box p {
		color: #374151;
	}

	:global(.light-mode) .warning-box strong {
		color: #b45309;
	}

	:global(.light-mode) .btn-export {
		background: #ffffff;
		border-color: #e5e7eb;
		color: #374151;
	}

	:global(.light-mode) .section h2 {
		color: #1a1a2e;
	}

	:global(.light-mode) .advanced-metrics-title {
		color: #1a1a2e;
	}
</style>
