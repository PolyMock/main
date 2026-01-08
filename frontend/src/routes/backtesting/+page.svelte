<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { fade } from 'svelte/transition';
	import { walletStore } from '$lib/wallet/stores';
	import { polymarketService } from '$lib/solana/polymarket-service';
	import { polymarketClient } from '$lib/polymarket';
	import { PublicKey } from '@solana/web3.js';
	import type { StrategyConfig, BacktestResult } from '$lib/backtesting/types';
	import EquityCurveChart from '$lib/components/EquityCurveChart.svelte';

	// Main tab state
	let activeMainTab: 'summary' | 'strategies' = 'summary';

	// ============= TRADE SUMMARY TAB (Original Code) =============
	interface Position {
		id: string;
		marketId: string;
		marketName: string;
		predictionType: 'Yes' | 'No';
		amountUsdc: number;
		shares: number;
		pricePerShare: number;
		currentPrice: number;
		pnl: number;
		pnlPercentage: number;
		status: 'Active' | 'Closed';
		openedAt: Date;
	}

	interface PerformanceMetrics {
		totalTrades: number;
		winningTrades: number;
		losingTrades: number;
		winRate: number;
		totalPnl: number;
		totalInvested: number;
		roi: number;
		avgWin: number;
		avgLoss: number;
		profitFactor: number;
		largestWin: number;
		largestLoss: number;
		avgHoldTime: number;
	}

	interface StrategyMetrics {
		yesWinRate: number;
		noWinRate: number;
		yesPnl: number;
		noPnl: number;
		yesCount: number;
		noCount: number;
		yesAvgReturn: number;
		noAvgReturn: number;
	}

	let positions: Position[] = [];
	let loading = true;
	let walletState = $walletStore;
	let performanceMetrics: PerformanceMetrics = {
		totalTrades: 0,
		winningTrades: 0,
		losingTrades: 0,
		winRate: 0,
		totalPnl: 0,
		totalInvested: 0,
		roi: 0,
		avgWin: 0,
		avgLoss: 0,
		profitFactor: 0,
		largestWin: 0,
		largestLoss: 0,
		avgHoldTime: 0
	};
	let strategyMetrics: StrategyMetrics = {
		yesWinRate: 0,
		noWinRate: 0,
		yesPnl: 0,
		noPnl: 0,
		yesCount: 0,
		noCount: 0,
		yesAvgReturn: 0,
		noAvgReturn: 0
	};

	walletStore.subscribe((value) => {
		walletState = value;
		if (value.connected && value.publicKey) {
			loadBacktestingData();
		}
	});

	onMount(async () => {
		if (walletState.connected && walletState.publicKey) {
			await loadBacktestingData();
		} else {
			loading = false;
		}
	});

	async function loadBacktestingData() {
		if (!walletState.publicKey) {
			loading = false;
			return;
		}

		loading = true;
		try {
			const userPublicKey = new PublicKey(walletState.publicKey.toString());
			const blockchainPositions = await polymarketService.getUserPositions(userPublicKey);

			const initialPositions: Position[] = blockchainPositions.map((pos) => {
				const isYes = 'yes' in pos.predictionType;
				const amountUsdc = pos.amountUsdc.toNumber() / 1_000_000;
				const shares = pos.shares.toNumber() / 1_000_000;
				const pricePerShare = pos.pricePerShare.toNumber() / 1_000_000;

				return {
					id: pos.positionId.toString(),
					marketId: pos.marketId,
					marketName: `Market ${pos.marketId.slice(0, 10)}...`,
					predictionType: (isYes ? 'Yes' : 'No') as 'Yes' | 'No',
					amountUsdc,
					shares,
					pricePerShare,
					currentPrice: pricePerShare,
					pnl: 0,
					pnlPercentage: 0,
					status: ('active' in pos.status ? 'Active' : 'Closed') as 'Active' | 'Closed',
					openedAt: new Date(pos.openedAt.toNumber() * 1000)
				};
			});

			await Promise.all(
				initialPositions.map(async (pos) => {
					try {
						const market = await polymarketClient.getMarketById(pos.marketId);
						if (market) {
							const currentPrice =
								pos.predictionType === 'Yes'
									? market.yesPrice || pos.pricePerShare
									: market.noPrice || pos.pricePerShare;

							pos.currentPrice = currentPrice;
							const currentValue = pos.shares * currentPrice;
							pos.pnl = currentValue - pos.amountUsdc;
							pos.pnlPercentage = (pos.pnl / pos.amountUsdc) * 100;
						}
					} catch (error) {
						console.error(`Error fetching current price for market ${pos.marketId}:`, error);
						const currentValue = pos.shares * pos.pricePerShare;
						pos.pnl = currentValue - pos.amountUsdc;
						pos.pnlPercentage = (pos.pnl / pos.amountUsdc) * 100;
					}
				})
			);

			positions = initialPositions;
			calculateMetrics();
		} catch (error) {
			console.error('Error loading backtesting data:', error);
			positions = [];
		} finally {
			loading = false;
		}
	}

	function calculateMetrics() {
		if (positions.length === 0) return;

		const closedPositions = positions.filter((p) => p.status === 'Closed');
		const winningPositions = closedPositions.filter((p) => p.pnl > 0);
		const losingPositions = closedPositions.filter((p) => p.pnl < 0);

		const totalPnl = closedPositions.reduce((sum, p) => sum + p.pnl, 0);
		const totalInvested = closedPositions.reduce((sum, p) => sum + p.amountUsdc, 0);

		const totalWinAmount = winningPositions.reduce((sum, p) => sum + p.pnl, 0);
		const totalLossAmount = Math.abs(losingPositions.reduce((sum, p) => sum + p.pnl, 0));

		performanceMetrics = {
			totalTrades: closedPositions.length,
			winningTrades: winningPositions.length,
			losingTrades: losingPositions.length,
			winRate: closedPositions.length > 0 ? (winningPositions.length / closedPositions.length) * 100 : 0,
			totalPnl,
			totalInvested,
			roi: totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0,
			avgWin: winningPositions.length > 0 ? totalWinAmount / winningPositions.length : 0,
			avgLoss: losingPositions.length > 0 ? totalLossAmount / losingPositions.length : 0,
			profitFactor: totalLossAmount > 0 ? totalWinAmount / totalLossAmount : totalWinAmount > 0 ? 999 : 0,
			largestWin: winningPositions.length > 0 ? Math.max(...winningPositions.map((p) => p.pnl)) : 0,
			largestLoss: losingPositions.length > 0 ? Math.min(...losingPositions.map((p) => p.pnl)) : 0,
			avgHoldTime: 0
		};

		const yesPositions = closedPositions.filter((p) => p.predictionType === 'Yes');
		const noPositions = closedPositions.filter((p) => p.predictionType === 'No');

		const yesWins = yesPositions.filter((p) => p.pnl > 0);
		const noWins = noPositions.filter((p) => p.pnl > 0);

		const yesPnl = yesPositions.reduce((sum, p) => sum + p.pnl, 0);
		const noPnl = noPositions.reduce((sum, p) => sum + p.pnl, 0);

		strategyMetrics = {
			yesWinRate: yesPositions.length > 0 ? (yesWins.length / yesPositions.length) * 100 : 0,
			noWinRate: noPositions.length > 0 ? (noWins.length / noPositions.length) * 100 : 0,
			yesPnl,
			noPnl,
			yesCount: yesPositions.length,
			noCount: noPositions.length,
			yesAvgReturn: yesPositions.length > 0 ? yesPnl / yesPositions.length : 0,
			noAvgReturn: noPositions.length > 0 ? noPnl / noPositions.length : 0
		};
	}

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

	$: bestTrades = [...positions]
		.filter((p) => p.status === 'Closed')
		.sort((a, b) => b.pnlPercentage - a.pnlPercentage)
		.slice(0, 5);

	$: worstTrades = [...positions]
		.filter((p) => p.status === 'Closed')
		.sort((a, b) => a.pnlPercentage - b.pnlPercentage)
		.slice(0, 5);

	$: insights = generateInsights();

	function generateInsights(): string[] {
		const insights: string[] = [];

		if (performanceMetrics.totalTrades === 0) {
			return ['No closed positions yet. Start trading to see analytics!'];
		}

		if (performanceMetrics.winRate > 60) {
			insights.push(
				`Excellent win rate of ${performanceMetrics.winRate.toFixed(1)}% - You're performing above average!`
			);
		} else if (performanceMetrics.winRate < 40) {
			insights.push(
				`Win rate is ${performanceMetrics.winRate.toFixed(1)}% - Consider reviewing your strategy selection.`
			);
		}

		if (strategyMetrics.yesCount > 0 && strategyMetrics.noCount > 0) {
			if (strategyMetrics.yesWinRate > strategyMetrics.noWinRate + 10) {
				insights.push(
					`YES positions perform ${(strategyMetrics.yesWinRate - strategyMetrics.noWinRate).toFixed(1)}% better - Focus on YES strategies.`
				);
			} else if (strategyMetrics.noWinRate > strategyMetrics.yesWinRate + 10) {
				insights.push(
					`NO positions perform ${(strategyMetrics.noWinRate - strategyMetrics.yesWinRate).toFixed(1)}% better - Focus on NO strategies.`
				);
			}
		}

		if (performanceMetrics.roi > 20) {
			insights.push(
				`Strong ROI of ${performanceMetrics.roi.toFixed(1)}% - Your strategy is highly profitable!`
			);
		} else if (performanceMetrics.roi < 0) {
			insights.push(
				`Negative ROI of ${performanceMetrics.roi.toFixed(1)}% - Review position sizing and market selection.`
			);
		}

		if (performanceMetrics.profitFactor > 2) {
			insights.push(
				`Profit factor of ${performanceMetrics.profitFactor.toFixed(2)} indicates strong risk management.`
			);
		} else if (performanceMetrics.profitFactor < 1) {
			insights.push(`Profit factor below 1.0 means losses exceed wins - Adjust your strategy.`);
		}

		if (Math.abs(performanceMetrics.largestLoss) > performanceMetrics.avgWin * 3) {
			insights.push(
				`Largest loss is ${Math.abs(performanceMetrics.largestLoss / performanceMetrics.avgWin).toFixed(1)}x your average win - Consider stop losses.`
			);
		}

		if (insights.length === 0) {
			insights.push('Keep trading to generate more insights!');
		}

		return insights;
	}

	// ============= STRATEGY BACKTESTING TAB (New Code) =============
	let strategyTab: 'configure' | 'results' = 'configure';
	let isRunning = false;
	let progress = 0;
	let error = '';

	// Helper to format date for input type="date"
	function formatDateForInput(date: Date): string {
		return date.toISOString().split('T')[0];
	}

	// Helper to parse date from input
	function parseDateFromInput(dateStr: string): Date {
		return new Date(dateStr + 'T00:00:00');
	}

	// Date strings for input binding
	let startDateStr = formatDateForInput(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
	let endDateStr = formatDateForInput(new Date());

	let config: Partial<StrategyConfig> = {
		specificMarket: {
			conditionId: undefined,
			marketSlug: undefined
		},
		categories: [],
		minTimeToResolution: undefined,
		maxTimeToResolution: undefined,
		entryType: 'BOTH',
		entryPriceThreshold: {
			yes: { min: undefined, max: undefined },
			no: { min: undefined, max: undefined }
		},
		exitRules: {
			resolveOnExpiry: true,
			stopLoss: undefined,
			takeProfit: undefined,
			maxHoldTime: undefined
		},
		positionSizing: {
			type: 'PERCENTAGE',
			fixedAmount: 100,
			percentageOfBankroll: 5
		},
		startDate: parseDateFromInput(startDateStr),
		endDate: parseDateFromInput(endDateStr),
		initialBankroll: 10000
	};

	// Update config dates when date strings change
	$: if (startDateStr) {
		config.startDate = parseDateFromInput(startDateStr);
	}
	$: if (endDateStr) {
		config.endDate = parseDateFromInput(endDateStr);
	}

	let backtestResult: BacktestResult | null = null;
	let showProMetrics = false;

	// Wizard state
	let currentStep = 0;
	const totalSteps = 5; // Markets (with date range & filters), Capital, Entry, Exit, Position Sizing

	// Market browser state
	let marketStatus: 'closed' | 'open' = 'closed'; // closed = past, open = active
	let availableMarkets: any[] = [];
	let loadingMarkets = false;
	let marketSearchQuery = '';

	// Advanced filters
	let minVolume: number | null = null;
	let maxVolume: number | null = null;
	let marketStartDate: string = '';
	let marketEndDate: string = '';

	// Pagination
	let currentPage = 0;
	let rowsPerPage = 20;
	let selectedMarketId: string | null = null;
	let selectedTag = 'All';
	let showAdvancedFilters = false;
	let selectedAdvancedFilter = 'None';

	const availableTags = [
		'All',
		'crypto',
		'culture',
		'economy',
		'elections',
		'finance',
		'geopolitics',
		'politic',
		'sport',
		'tech',
		'world'
	];

	// Fetch available markets for selection (auto-fetches when dates change)
	async function fetchMarkets() {
		if (!config.startDate || !config.endDate) return;

		loadingMarkets = true;
		availableMarkets = []; // Clear previous results
		selectedMarketId = null; // Clear selection

		try {
			const response = await fetch('/api/backtest/markets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					startDate: config.startDate,
					endDate: config.endDate,
					status: marketStatus,
					tag: selectedTag !== 'All' ? selectedTag : undefined,
					minVolume,
					maxVolume,
					marketStartDate,
					marketEndDate
				})
			});

			if (!response.ok) {
				throw new Error('Failed to fetch markets');
			}

			const data = await response.json();
			availableMarkets = data.markets || [];
		} catch (err: any) {
			console.error('Error fetching markets:', err);
			availableMarkets = [];
		} finally {
			loadingMarkets = false;
		}
	}

	// Track previous values to detect actual changes
	let prevStartDate: string | undefined;
	let prevEndDate: string | undefined;
	let prevTag: string = '';
	let hasLoadedMarkets = false;

	// Auto-fetch markets only when dates or tag actually change (client-side only)
	$: if (browser && config.startDate && config.endDate && currentStep === 0) {
		const startDateStr = typeof config.startDate === 'string' ? config.startDate : config.startDate.toISOString().split('T')[0];
		const endDateStr = typeof config.endDate === 'string' ? config.endDate : config.endDate.toISOString().split('T')[0];

		const datesChanged = prevStartDate !== startDateStr || prevEndDate !== endDateStr;
		const tagChanged = prevTag !== selectedTag;

		// Only fetch if dates/tag changed or this is the first load
		if (!hasLoadedMarkets || datesChanged || tagChanged) {
			prevStartDate = startDateStr;
			prevEndDate = endDateStr;
			prevTag = selectedTag;
			hasLoadedMarkets = true;
			fetchMarkets();
		}
	}

	// Wizard navigation
	function nextStep() {
		if (currentStep < totalSteps - 1) {
			currentStep++;
		}
	}

	function prevStep() {
		if (currentStep > 0) {
			currentStep--;
		}
	}

	function goToStep(step: number) {
		if (step >= 0 && step < totalSteps) {
			currentStep = step;
		}
	}

	// Filter markets based on search
	$: filteredMarkets = availableMarkets.filter(market => {
		if (!marketSearchQuery) return true;
		const query = marketSearchQuery.toLowerCase();
		return (
			market.title?.toLowerCase().includes(query) ||
			market.question?.toLowerCase().includes(query) ||
			market.market_slug?.toLowerCase().includes(query) ||
			market.category?.toLowerCase().includes(query) ||
			market.tags?.some((tag: any) => tag.toLowerCase().includes(query))
		);
	});

	// Sort markets
	$: sortedFilteredMarkets = (() => {
		let markets = [...filteredMarkets];
		if (sortColumn) {
			markets.sort((a, b) => {
				let aVal: number, bVal: number;
				if (sortColumn === 'volume') {
					aVal = a.volume_total || a.volume || a.volume_24h || a.total_volume || 0;
					bVal = b.volume_total || b.volume || b.volume_24h || b.total_volume || 0;
				} else {
					aVal = a.end_time || a.close_time || 0;
					bVal = b.end_time || b.close_time || 0;
				}
				return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
			});
		}
		return markets;
	})();

	// Paginated markets
	$: totalPages = Math.ceil(sortedFilteredMarkets.length / rowsPerPage);
	$: paginatedMarkets = sortedFilteredMarkets.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage);

	// Reset to first page when filters change
	$: if (marketSearchQuery || selectedTag) {
		currentPage = 0;
	}

	// Select a market
	function selectMarket(market: any) {
		selectedMarketId = market.condition_id;
		if (!config.specificMarket) {
			config.specificMarket = {};
		}
		config.specificMarket.conditionId = market.condition_id;
		config.specificMarket.marketSlug = market.market_slug;
	}

	// Clear market selection
	function clearMarketSelection() {
		selectedMarketId = null;
		if (config.specificMarket) {
			config.specificMarket.conditionId = undefined;
			config.specificMarket.marketSlug = undefined;
		}
	}


	// Format date to MM/DD/YYYY
	function formatMarketDate(timestamp: number): string {
		const date = new Date(timestamp * 1000);
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const year = date.getFullYear();
		return `${month}/${day}/${year}`;
	}

	// Table sorting
	let sortColumn: 'volume' | 'ends' | null = null;
	let sortDirection: 'asc' | 'desc' = 'desc';

	function sortMarkets(column: 'volume' | 'ends') {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'desc';
		}
		currentPage = 0; // Reset to first page when sorting
	}



	async function runBacktest() {
		isRunning = true;
		error = '';
		progress = 0;

		try {
			if (!config.startDate || !config.endDate) {
				throw new Error('Please select start and end dates');
			}

			if (!config.initialBankroll || config.initialBankroll <= 0) {
				throw new Error('Initial bankroll must be greater than 0');
			}

			const progressInterval = setInterval(() => {
				progress = Math.min(progress + 10, 90);
			}, 500);

			const response = await fetch('/api/backtest', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(config)
			});

			clearInterval(progressInterval);

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Backtest failed');
			}

			backtestResult = await response.json();
			progress = 100;
			strategyTab = 'results';

			console.log('Backtest completed:', backtestResult);
		} catch (err: any) {
			error = err.message || 'An error occurred';
			console.error('Backtest error:', err);
		} finally {
			isRunning = false;
		}
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

	$: sortedTrades = backtestResult?.trades
		? [...backtestResult.trades].sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime())
		: [];

	$: topTrades = backtestResult?.trades
		? [...backtestResult.trades].sort((a, b) => b.pnl - a.pnl).slice(0, 5)
		: [];

	$: worstBacktestTrades = backtestResult?.trades
		? [...backtestResult.trades].sort((a, b) => a.pnl - b.pnl).slice(0, 5)
		: [];

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
</script>

<div class="backtesting-container">
	<div class="page-header">
		<h1>Backtesting Hub</h1>
		<p class="subtitle">Analyze performance and test strategies on historical market data</p>
	</div>

	<!-- Main Tabs -->
	<div class="main-tabs">
		<button
			class="main-tab"
			class:active={activeMainTab === 'summary'}
			on:click={() => (activeMainTab = 'summary')}
		>
			Trade Summary
		</button>
		<button
			class="main-tab"
			class:active={activeMainTab === 'strategies'}
			on:click={() => (activeMainTab = 'strategies')}
		>
			Backtesting Strategies
		</button>
	</div>

	<!-- TRADE SUMMARY TAB -->
	{#if activeMainTab === 'summary'}
		{#if loading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>Loading analytics...</p>
			</div>
		{:else if !walletState.connected}
			<div class="empty-state">
				<div class="empty-icon">🔗</div>
				<h3>Wallet Not Connected</h3>
				<p>Please connect your wallet to view trade summary</p>
			</div>
		{:else if positions.length === 0}
			<div class="empty-state">
				<div class="empty-icon">⌀</div>
				<h3>No Trading History</h3>
				<p>Start trading to build your performance history and analytics</p>
			</div>
		{:else}
			<!-- Performance Overview -->
			<div class="section">
				<h2>Performance Overview</h2>
				<div class="metrics-grid">
					<div class="metric-card">
						<div class="metric-label">Total Trades</div>
						<div class="metric-value">{performanceMetrics.totalTrades}</div>
						<div class="metric-sublabel">
							{performanceMetrics.winningTrades}W / {performanceMetrics.losingTrades}L
						</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Win Rate</div>
						<div
							class="metric-value"
							class:positive={performanceMetrics.winRate >= 50}
							class:negative={performanceMetrics.winRate < 50}
						>
							{performanceMetrics.winRate.toFixed(1)}%
						</div>
						<div class="metric-progress">
							<div class="progress-bar" style="width: {performanceMetrics.winRate}%"></div>
						</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Total P&L</div>
						<div
							class="metric-value"
							class:positive={performanceMetrics.totalPnl >= 0}
							class:negative={performanceMetrics.totalPnl < 0}
						>
							{formatUSDC(performanceMetrics.totalPnl)}
						</div>
						<div class="metric-sublabel">on {formatUSDC(performanceMetrics.totalInvested)} invested</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">ROI</div>
						<div
							class="metric-value"
							class:positive={performanceMetrics.roi >= 0}
							class:negative={performanceMetrics.roi < 0}
						>
							{formatPercentage(performanceMetrics.roi)}
						</div>
						<div class="metric-sublabel">Return on Investment</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Avg Win</div>
						<div class="metric-value positive">
							{formatUSDC(performanceMetrics.avgWin)}
						</div>
						<div class="metric-sublabel">per winning trade</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Avg Loss</div>
						<div class="metric-value negative">
							{formatUSDC(performanceMetrics.avgLoss)}
						</div>
						<div class="metric-sublabel">per losing trade</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Profit Factor</div>
						<div
							class="metric-value"
							class:positive={performanceMetrics.profitFactor >= 1}
							class:negative={performanceMetrics.profitFactor < 1}
						>
							{performanceMetrics.profitFactor.toFixed(2)}
						</div>
						<div class="metric-sublabel">wins / losses ratio</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Best Trade</div>
						<div class="metric-value positive">
							{formatUSDC(performanceMetrics.largestWin)}
						</div>
						<div class="metric-sublabel">largest winner</div>
					</div>
				</div>
			</div>

			<!-- Strategy Analysis -->
			<div class="section">
				<h2>Strategy Performance</h2>
				<div class="strategy-grid">
					<div class="strategy-card yes-card">
						<div class="strategy-header">
							<span class="strategy-badge yes">YES</span>
							<span class="strategy-count">{strategyMetrics.yesCount} trades</span>
						</div>
						<div class="strategy-metrics">
							<div class="strategy-metric">
								<span class="strategy-metric-label">Win Rate</span>
								<span
									class="strategy-metric-value"
									class:positive={strategyMetrics.yesWinRate >= 50}
								>
									{strategyMetrics.yesWinRate.toFixed(1)}%
								</span>
							</div>
							<div class="strategy-metric">
								<span class="strategy-metric-label">Total P&L</span>
								<span
									class="strategy-metric-value"
									class:positive={strategyMetrics.yesPnl >= 0}
									class:negative={strategyMetrics.yesPnl < 0}
								>
									{formatUSDC(strategyMetrics.yesPnl)}
								</span>
							</div>
							<div class="strategy-metric">
								<span class="strategy-metric-label">Avg Return</span>
								<span
									class="strategy-metric-value"
									class:positive={strategyMetrics.yesAvgReturn >= 0}
									class:negative={strategyMetrics.yesAvgReturn < 0}
								>
									{formatUSDC(strategyMetrics.yesAvgReturn)}
								</span>
							</div>
						</div>
						<div class="strategy-bar">
							<div
								class="bar-fill yes-bar"
								style="width: {Math.min(strategyMetrics.yesWinRate, 100)}%"
							></div>
						</div>
					</div>

					<div class="strategy-card no-card">
						<div class="strategy-header">
							<span class="strategy-badge no">NO</span>
							<span class="strategy-count">{strategyMetrics.noCount} trades</span>
						</div>
						<div class="strategy-metrics">
							<div class="strategy-metric">
								<span class="strategy-metric-label">Win Rate</span>
								<span
									class="strategy-metric-value"
									class:positive={strategyMetrics.noWinRate >= 50}
								>
									{strategyMetrics.noWinRate.toFixed(1)}%
								</span>
							</div>
							<div class="strategy-metric">
								<span class="strategy-metric-label">Total P&L</span>
								<span
									class="strategy-metric-value"
									class:positive={strategyMetrics.noPnl >= 0}
									class:negative={strategyMetrics.noPnl < 0}
								>
									{formatUSDC(strategyMetrics.noPnl)}
								</span>
							</div>
							<div class="strategy-metric">
								<span class="strategy-metric-label">Avg Return</span>
								<span
									class="strategy-metric-value"
									class:positive={strategyMetrics.noAvgReturn >= 0}
									class:negative={strategyMetrics.noAvgReturn < 0}
								>
									{formatUSDC(strategyMetrics.noAvgReturn)}
								</span>
							</div>
						</div>
						<div class="strategy-bar">
							<div
								class="bar-fill no-bar"
								style="width: {Math.min(strategyMetrics.noWinRate, 100)}%"
							></div>
						</div>
					</div>
				</div>
			</div>

			<!-- Best/Worst Trades -->
			<div class="section">
				<div class="trades-comparison">
					<div class="trades-panel">
						<h2>Best Trades</h2>
						<div class="trades-list">
							{#each bestTrades as trade (trade.id)}
								<div class="trade-item">
									<div class="trade-info">
										<span class="trade-market">{trade.marketName}</span>
										<span
											class="trade-type"
											class:yes={trade.predictionType === 'Yes'}
											class:no={trade.predictionType === 'No'}
										>
											{trade.predictionType}
										</span>
									</div>
									<div class="trade-result positive">
										{formatUSDC(trade.pnl)} ({formatPercentage(trade.pnlPercentage)})
									</div>
								</div>
							{/each}
							{#if bestTrades.length === 0}
								<div class="no-trades">No closed trades yet</div>
							{/if}
						</div>
					</div>

					<div class="trades-panel">
						<h2>Worst Trades</h2>
						<div class="trades-list">
							{#each worstTrades as trade (trade.id)}
								<div class="trade-item">
									<div class="trade-info">
										<span class="trade-market">{trade.marketName}</span>
										<span
											class="trade-type"
											class:yes={trade.predictionType === 'Yes'}
											class:no={trade.predictionType === 'No'}
										>
											{trade.predictionType}
										</span>
									</div>
									<div class="trade-result negative">
										{formatUSDC(trade.pnl)} ({formatPercentage(trade.pnlPercentage)})
									</div>
								</div>
							{/each}
							{#if worstTrades.length === 0}
								<div class="no-trades">No closed trades yet</div>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Insights -->
			<div class="section">
				<h2>Insights & Recommendations</h2>
				<div class="insights-grid">
					{#each insights as insight}
						<div class="insight-card">
							<p>{insight}</p>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}

	<!-- STRATEGY BACKTESTING TAB -->
	{#if activeMainTab === 'strategies'}
		<div class="strategy-backtesting">
			<!-- Sub-tabs for Strategy Backtesting -->
			<div class="tabs">
				<button
					class="tab"
					class:active={strategyTab === 'configure'}
					on:click={() => (strategyTab = 'configure')}
				>
					Configure Strategy
				</button>
				<button
					class="tab"
					class:active={strategyTab === 'results'}
					on:click={() => (strategyTab = 'results')}
					disabled={!backtestResult}
				>
					Results
				</button>
			</div>

			<!-- WIZARD CONFIGURATION -->
			{#if strategyTab === 'configure'}
				<div class="wizard-container">
					<!-- Progress Bar -->
					<div class="wizard-progress">
						<div class="progress-bar">
							<div class="progress-fill" style="width: {((currentStep + 1) / totalSteps) * 100}%"></div>
						</div>
						<div class="progress-steps">
							{#each Array(totalSteps) as _, i}
								<button
									class="progress-step"
									class:active={i === currentStep}
									class:completed={i < currentStep}
									on:click={() => goToStep(i)}
								>
									{i + 1}
								</button>
							{/each}
						</div>
					</div>
			
					<!-- Wizard Steps -->
					<div class="wizard-content">
						<!-- STEP 1: Market Selection with Advanced Filters -->
						{#if currentStep === 0}
							<div class="wizard-step" transition:fade>
								<div class="step-header">
									<h2>Market Selection</h2>
									<p>Filter and select markets for backtesting</p>
								</div>

								<div class="step-body">
									<!-- Filters Grid - All Same Size -->
									{#if !selectedMarketId}
										<div class="filters-grid">
											<!-- Date Range -->
											<div class="filter-item">
												<label>Start Date</label>
												<input
													type="date"
													bind:value={startDateStr}
													max={endDateStr || new Date().toISOString().split('T')[0]}
													class="filter-input-uniform"
												/>
											</div>

											<div class="filter-item">
												<label>End Date</label>
												<input
													type="date"
													bind:value={endDateStr}
													min={startDateStr}
													max={new Date().toISOString().split('T')[0]}
													class="filter-input-uniform"
												/>
											</div>

											<!-- Duration Display -->
											<div class="filter-item">
												<label>Duration</label>
												<div class="duration-display">
													{#if config.startDate && config.endDate}
														{Math.floor((config.endDate.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24))} days
													{:else}
														-
													{/if}
												</div>
											</div>

											<!-- Search Bar -->
											<div class="filter-item filter-item-full">
												<label>Search Markets</label>
												<input
													type="text"
													bind:value={marketSearchQuery}
													placeholder="Search by title, category, or tags..."
													class="filter-input-uniform"
												/>
											</div>

											<!-- Tag Filter Dropdown -->
											<div class="filter-item">
												<label>Tag</label>
												<select bind:value={selectedTag} class="filter-input-uniform">
													{#each availableTags as tag}
														<option value={tag}>{tag.charAt(0).toUpperCase() + tag.slice(1)}</option>
													{/each}
												</select>
											</div>

											<!-- Advanced Filters Dropdown -->
											<div class="filter-item">
												<label>Advanced Filters</label>
												<select bind:value={selectedAdvancedFilter} class="filter-input-uniform" on:change={() => showAdvancedFilters = selectedAdvancedFilter !== 'None'}>
													<option value="None">None</option>
													<option value="Volume">Volume</option>
												</select>
											</div>
										</div>

										<!-- Advanced Filters Panel -->
										{#if showAdvancedFilters && selectedAdvancedFilter === 'Volume'}
											<div class="advanced-filters-panel">
												<div class="filters-grid">
													<div class="filter-item">
														<label>Min Volume ($)</label>
														<input
															type="number"
															bind:value={minVolume}
															placeholder="e.g., 50000"
															class="filter-input-uniform"
															on:change={fetchMarkets}
														/>
													</div>
													<div class="filter-item">
														<label>Max Volume ($)</label>
														<input
															type="number"
															bind:value={maxVolume}
															placeholder="e.g., 1000000"
															class="filter-input-uniform"
															on:change={fetchMarkets}
														/>
													</div>
												</div>
											</div>
										{/if}
									{/if}

									<!-- Selected Market Display -->
									{#if selectedMarketId}
										{@const selectedMarket = availableMarkets.find(m => m.condition_id === selectedMarketId)}
										{#if selectedMarket}
											{@const selectedVolume = selectedMarket.volume_total || selectedMarket.volume || selectedMarket.volume_24h || selectedMarket.total_volume || 0}
											<div class="selected-market-display">
												<div class="selected-market-info">
													<div class="selected-label">Selected Market:</div>
													<div class="selected-market-title">{selectedMarket.title || selectedMarket.question}</div>
													<div class="selected-market-meta">
														<span>Volume: ${(selectedVolume / 1000000).toFixed(2)}M</span>
													</div>
												</div>
												<button class="change-market-btn" on:click={clearMarketSelection}>
													Change Market
												</button>
											</div>
										{/if}
									{/if}

									<!-- Markets Table -->
									{#if config.startDate && config.endDate && !selectedMarketId}
										{#if loadingMarkets}
											<div class="loading-state">
												<span class="spinner"></span>
												<p>Loading markets...</p>
											</div>
										{:else if availableMarkets.length === 0}
											<div class="empty-state">
												<p>No markets found matching your criteria</p>
												<small>Try adjusting your filters or date range</small>
											</div>
										{:else}
											<div class="markets-table-container">
												<div class="results-info">
													<span>{filteredMarkets.length} markets found</span>
													<span>Showing {currentPage * rowsPerPage + 1}-{Math.min((currentPage + 1) * rowsPerPage, filteredMarkets.length)} of {filteredMarkets.length}</span>
												</div>

												<table class="markets-table">
													<thead>
														<tr>
															<th class="event-header">Event</th>
															<th class="sortable-header" on:click={() => sortMarkets('volume')}>
																<div class="sort-header-content">
																	<span>Volume</span>
																	<span class="sort-indicator" class:active={sortColumn === 'volume'}>
																		{#if sortColumn === 'volume'}
																			{sortDirection === 'asc' ? '↑' : '↓'}
																		{:else}
																			<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
																				<path d="M3 4.5L6 1.5L9 4.5M3 7.5L6 10.5L9 7.5"/>
																			</svg>
																		{/if}
																	</span>
																</div>
															</th>
															<th class="sortable-header" on:click={() => sortMarkets('ends')}>
																<div class="sort-header-content">
																	<span>Ends</span>
																	<span class="sort-indicator" class:active={sortColumn === 'ends'}>
																		{#if sortColumn === 'ends'}
																			{sortDirection === 'asc' ? '↑' : '↓'}
																		{:else}
																			<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
																				<path d="M3 4.5L6 1.5L9 4.5M3 7.5L6 10.5L9 7.5"/>
																			</svg>
																		{/if}
																	</span>
																</div>
															</th>
															<th>Tags</th>
														</tr>
													</thead>
													<tbody>
														{#each paginatedMarkets as market}
															{@const marketVolume = market.volume_total || market.volume || market.volume_24h || market.total_volume || 0}
															<tr class:selected={selectedMarketId === market.condition_id} on:click={() => selectMarket(market)}>
																<td class="event-cell">
																	<div class="event-content">
																		<div class="event-info">
																			<div class="event-title">{market.title || market.question || 'Untitled'}</div>
																		</div>
																	</div>
																</td>
																<td class="volume-cell">
																	{#if marketVolume > 0}
																		${(marketVolume / 1000000).toFixed(1)}M
																	{:else}
																		$0.0M
																	{/if}
																</td>
																<td class="ends-cell">
																	{#if market.end_time || market.close_time}
																		{formatMarketDate(market.end_time || market.close_time)}
																	{:else}
																		N/A
																	{/if}
																</td>
																<td class="tags-cell">
																	<div class="tags-container">
																		{#if market.tags && market.tags.length > 0}
																			{#each market.tags.slice(0, 2) as tag}
																				<span class="tag-badge">{tag}</span>
																			{/each}
																			{#if market.tags.length > 2}
																				<span class="tag-more">+{market.tags.length - 2}</span>
																			{/if}
																		{:else if market.category}
																			<span class="tag-badge">{market.category}</span>
																		{:else}
																			<span class="tag-badge">Other</span>
																		{/if}
																	</div>
																</td>
															</tr>
														{/each}
													</tbody>
												</table>

												<!-- Pagination Controls -->
												<div class="pagination-controls">
													<div class="pagination-buttons">
														<button
															class="pagination-btn"
															on:click={() => currentPage = 0}
															disabled={currentPage === 0}
														>
															First
														</button>
														<button
															class="pagination-btn"
															on:click={() => currentPage--}
															disabled={currentPage === 0}
														>
															Previous
														</button>
														<span class="page-info">
															Page {currentPage + 1} of {totalPages || 1}
														</span>
														<button
															class="pagination-btn"
															on:click={() => currentPage++}
															disabled={currentPage >= totalPages - 1}
														>
															Next
														</button>
														<button
															class="pagination-btn"
															on:click={() => currentPage = totalPages - 1}
															disabled={currentPage >= totalPages - 1}
														>
															Last
														</button>
													</div>
													<div class="rows-per-page">
														<label>Rows per page:</label>
														<select bind:value={rowsPerPage} on:change={() => currentPage = 0}>
															<option value={10}>10</option>
															<option value={20}>20</option>
															<option value={50}>50</option>
															<option value={100}>100</option>
														</select>
													</div>
												</div>
											</div>
										{/if}
									{/if}
								</div>
							</div>
						{/if}
			
						<!-- STEP 2: Initial Capital -->
						{#if currentStep === 1}
							<div class="wizard-step" transition:fade>
								<div class="step-header">
									<h2>Initial Capital</h2>
									<p>How much capital to start with</p>
								</div>
			
								<div class="step-body">
									<div class="capital-input-wrapper">
										<input
											type="number"
											bind:value={config.initialBankroll}
											min="100"
											step="100"
											class="capital-input"
											placeholder="10000"
										/>
										<span class="currency-label">USDC</span>
									</div>
			
									<div class="capital-presets">
										<button class="preset-btn" on:click={() => config.initialBankroll = 1000}>
											$1K
										</button>
										<button class="preset-btn" on:click={() => config.initialBankroll = 5000}>
											$5K
										</button>
										<button class="preset-btn" on:click={() => config.initialBankroll = 10000}>
											$10K
										</button>
										<button class="preset-btn" on:click={() => config.initialBankroll = 50000}>
											$50K
										</button>
									</div>
								</div>
							</div>
						{/if}

						<!-- STEP 2: Entry Rules -->
						{#if currentStep === 2}
							<div class="wizard-step" transition:fade>
								<div class="step-header">
									<h2>Entry Rules</h2>
									<p>Define when to enter positions</p>
								</div>
			
								<div class="step-body">
									<div class="form-section">
										<label>Entry Type</label>
										<div class="entry-type-buttons">
											<button
												class="entry-btn"
												class:active={config.entryType === 'YES'}
												on:click={() => config.entryType = 'YES'}
											>
												YES
											</button>
											<button
												class="entry-btn"
												class:active={config.entryType === 'NO'}
												on:click={() => config.entryType = 'NO'}
											>
												NO
											</button>
											<button
												class="entry-btn"
												class:active={config.entryType === 'BOTH'}
												on:click={() => config.entryType = 'BOTH'}
											>
												BOTH
											</button>
										</div>
									</div>
			
									{#if config.entryType === 'YES' || config.entryType === 'BOTH'}
										<div class="form-section">
											<label>YES Price Threshold</label>
											<div class="price-range">
												<div class="range-input-group">
													<span class="range-label">Min</span>
													<input
														type="range"
														bind:value={config.entryPriceThreshold.yes.min}
														min="0"
														max="1"
														step="0.01"
														class="price-slider"
													/>
													<span class="range-value">{(config.entryPriceThreshold.yes.min || 0).toFixed(2)}</span>
												</div>
												<div class="range-input-group">
													<span class="range-label">Max</span>
													<input
														type="range"
														bind:value={config.entryPriceThreshold.yes.max}
														min="0"
														max="1"
														step="0.01"
														class="price-slider"
													/>
													<span class="range-value">{(config.entryPriceThreshold.yes.max || 1).toFixed(2)}</span>
												</div>
											</div>
										</div>
									{/if}
			
									{#if config.entryType === 'NO' || config.entryType === 'BOTH'}
										<div class="form-section">
											<label>NO Price Threshold</label>
											<div class="price-range">
												<div class="range-input-group">
													<span class="range-label">Min</span>
													<input
														type="range"
														bind:value={config.entryPriceThreshold.no.min}
														min="0"
														max="1"
														step="0.01"
														class="price-slider"
													/>
													<span class="range-value">{(config.entryPriceThreshold.no.min || 0).toFixed(2)}</span>
												</div>
												<div class="range-input-group">
													<span class="range-label">Max</span>
													<input
														type="range"
														bind:value={config.entryPriceThreshold.no.max}
														min="0"
														max="1"
														step="0.01"
														class="price-slider"
													/>
													<span class="range-value">{(config.entryPriceThreshold.no.max || 1).toFixed(2)}</span>
												</div>
											</div>
										</div>
									{/if}
								</div>
							</div>
						{/if}
			
						<!-- STEP 3: Exit Rules -->
						{#if currentStep === 3}
							<div class="wizard-step" transition:fade>
								<div class="step-header">
									<h2>Exit Rules</h2>
									<p>Define when to close positions</p>
								</div>
			
								<div class="step-body">
									<div class="form-section">
										<label>Stop Loss (%)</label>
										<input
											type="number"
											bind:value={config.exitRules.stopLoss}
											min="0"
											max="100"
											step="1"
											placeholder="e.g., 20 (leave empty for none)"
											class="exit-input"
										/>
									</div>
			
									<div class="form-section">
										<label>Take Profit (%)</label>
										<input
											type="number"
											bind:value={config.exitRules.takeProfit}
											min="0"
											max="500"
											step="1"
											placeholder="e.g., 50 (leave empty for none)"
											class="exit-input"
										/>
									</div>
			
									<div class="form-section">
										<label>Max Hold Time (hours)</label>
										<input
											type="number"
											bind:value={config.exitRules.maxHoldTime}
											min="1"
											step="1"
											placeholder="e.g., 168 (leave empty for none)"
											class="exit-input"
										/>
									</div>
			
									<div class="form-section">
										<label class="checkbox-label">
											<input type="checkbox" bind:checked={config.exitRules.resolveOnExpiry} />
											<span>Close at resolution</span>
										</label>
									</div>
								</div>
							</div>
						{/if}
			
						<!-- STEP 4: Review & Run -->
						{#if currentStep === 4}
							<div class="wizard-step" transition:fade>
								<div class="step-header">
									<h2>Review & Run</h2>
									<p>Review your configuration and run the backtest</p>
								</div>
			
								<div class="step-body">
									<!-- Configuration Summary -->
									<div class="config-summary">
										<h3>Summary</h3>
										<div class="summary-grid">
											<div class="summary-item">
												<span class="summary-label">Date Range</span>
												<span class="summary-value">
													{config.startDate?.toLocaleDateString()} - {config.endDate?.toLocaleDateString()}
												</span>
											</div>
											<div class="summary-item">
												<span class="summary-label">Initial Capital</span>
												<span class="summary-value">${config.initialBankroll?.toLocaleString()}</span>
											</div>
											<div class="summary-item">
												<span class="summary-label">Markets</span>
												<span class="summary-value">
													{selectedMarketId ? '1 specific market' : 'All matching markets'}
												</span>
											</div>
											<div class="summary-item">
												<span class="summary-label">Entry Type</span>
												<span class="summary-value">{config.entryType}</span>
											</div>
											<div class="summary-item">
												<span class="summary-label">Stop Loss</span>
												<span class="summary-value">
													{config.exitRules.stopLoss ? `${config.exitRules.stopLoss}%` : 'None'}
												</span>
											</div>
											<div class="summary-item">
												<span class="summary-label">Take Profit</span>
												<span class="summary-value">
													{config.exitRules.takeProfit ? `${config.exitRules.takeProfit}%` : 'None'}
												</span>
											</div>
											<div class="summary-item">
												<span class="summary-label">Max Hold Time</span>
												<span class="summary-value">
													{config.exitRules.maxHoldTime ? `${config.exitRules.maxHoldTime}h` : 'None'}
												</span>
											</div>
											<div class="summary-item">
												<span class="summary-label">Close at Resolution</span>
												<span class="summary-value">
													{config.exitRules.resolveOnExpiry ? 'Yes' : 'No'}
												</span>
											</div>
										</div>
									</div>
			
									<!-- Error Display -->
									{#if error}
										<div class="error-box">{error}</div>
									{/if}
			
									<!-- Run Backtest Button -->
									<button class="btn-run-backtest" on:click={runBacktest} disabled={isRunning}>
										{#if isRunning}
											<span class="spinner-small"></span>
											Running Backtest... {progress}%
										{:else}
											Run Backtest
										{/if}
									</button>
								</div>
							</div>
						{/if}
					</div>
			
					<!-- Navigation -->
					<div class="wizard-navigation">
						{#if currentStep > 0}
							<button class="nav-btn nav-prev" on:click={prevStep}>
								← Back
							</button>
						{/if}
						{#if currentStep < totalSteps - 1}
							<button class="nav-btn nav-next" on:click={nextStep}>
								Next →
							</button>
						{:else}
							<div></div>
						{/if}
					</div>
				</div>
			{:else if strategyTab === 'results' && backtestResult}
				<!-- Results Panel -->
				<div class="results-panel">
					<!-- Export Buttons -->
					<div class="export-section">
						<button class="btn-export" on:click={exportToCSV}> Export Trades (CSV) </button>
						<button class="btn-export" on:click={exportMetricsJSON}>
							Export Metrics (JSON)
						</button>
					</div>

					<!-- Summary Header -->
					<div class="results-header">
						<div class="result-card">
							<div class="result-label">Execution Time</div>
							<div class="result-value">{(backtestResult.executionTime / 1000).toFixed(2)}s</div>
						</div>
						<div class="result-card">
							<div class="result-label">Markets Analyzed</div>
							<div class="result-value">{backtestResult.marketsAnalyzed}</div>
						</div>
						<div class="result-card">
							<div class="result-label">Trades Executed</div>
							<div class="result-value">{backtestResult.metrics.totalTrades}</div>
						</div>
						<div class="result-card">
							<div class="result-label">Final Capital</div>
							<div
								class="result-value"
								class:positive={backtestResult.endingCapital >= backtestResult.startingCapital}
								class:negative={backtestResult.endingCapital < backtestResult.startingCapital}
							>
								{formatUSDC(backtestResult.endingCapital)}
							</div>
						</div>
					</div>

					<!-- No Trades Warning -->
					{#if backtestResult.metrics.totalTrades === 0}
						<div class="warning-box">
							<h3>No Trades Executed</h3>
							<p>The backtest completed but no trades matched your criteria. This could be because:</p>
							<ul>
								<li><strong>No historical data:</strong> The selected market(s) may not have candlestick data available for the date range</li>
								<li><strong>Entry price too restrictive:</strong> Your price thresholds may be too narrow</li>
								<li><strong>Market too new:</strong> Recently created markets may not have enough historical data yet</li>
								<li><strong>Low volume markets:</strong> Markets with little trading activity may not have price data</li>
							</ul>
							<p><strong>Suggestions:</strong></p>
							<ul>
								<li>Try selecting a market with higher volume (look for markets with >$0.5M volume)</li>
								<li>Widen your entry price thresholds or remove them entirely</li>
								<li>Choose markets created before your start date</li>
								<li>Use a longer date range (30-60 days)</li>
								<li>Try backtesting across all markets instead of a single market</li>
							</ul>
						</div>
					{/if}

					<!-- Free Metrics -->
					<div class="section">
						<h2>Performance Metrics</h2>
						<div class="metrics-grid">
							<div class="metric-card">
								<div class="metric-label">Total Trades</div>
								<div class="metric-value">{backtestResult.metrics.totalTrades}</div>
								<div class="metric-sublabel">
									{backtestResult.metrics.winningTrades}W / {backtestResult.metrics.losingTrades}L
								</div>
							</div>
							<div class="metric-card">
								<div class="metric-label">Win Rate</div>
								<div
									class="metric-value"
									class:positive={backtestResult.metrics.winRate >= 50}
									class:negative={backtestResult.metrics.winRate < 50}
								>
									{backtestResult.metrics.winRate.toFixed(1)}%
								</div>
							</div>
							<div class="metric-card">
								<div class="metric-label">Net P&L</div>
								<div
									class="metric-value"
									class:positive={backtestResult.metrics.netPnl >= 0}
									class:negative={backtestResult.metrics.netPnl < 0}
								>
									{formatUSDC(backtestResult.metrics.netPnl)}
								</div>
							</div>
							<div class="metric-card">
								<div class="metric-label">ROI</div>
								<div
									class="metric-value"
									class:positive={backtestResult.metrics.roi >= 0}
									class:negative={backtestResult.metrics.roi < 0}
								>
									{formatPercentage(backtestResult.metrics.roi)}
								</div>
							</div>
							<div class="metric-card">
								<div class="metric-label">Avg Win</div>
								<div class="metric-value positive">
									{formatUSDC(backtestResult.metrics.avgWin)}
								</div>
							</div>
							<div class="metric-card">
								<div class="metric-label">Avg Loss</div>
								<div class="metric-value negative">
									{formatUSDC(backtestResult.metrics.avgLoss)}
								</div>
							</div>
							<div class="metric-card">
								<div class="metric-label">Best Trade</div>
								<div class="metric-value positive">
									{formatUSDC(backtestResult.metrics.bestTrade)}
								</div>
							</div>
							<div class="metric-card">
								<div class="metric-label">Worst Trade</div>
								<div class="metric-value negative">
									{formatUSDC(backtestResult.metrics.worstTrade)}
								</div>
							</div>
						</div>
					</div>

					<!-- YES vs NO Performance -->
					<div class="section">
						<h2>Strategy Performance</h2>
						<div class="strategy-grid">
							<div class="strategy-card yes-card">
								<div class="strategy-header">
									<span class="strategy-badge yes">YES</span>
									<span class="strategy-count"
										>{backtestResult.metrics.yesPerformance.count} trades</span
									>
								</div>
								<div class="strategy-metrics">
									<div class="strategy-metric">
										<span>Win Rate</span>
										<span class="value positive"
											>{backtestResult.metrics.yesPerformance.winRate.toFixed(1)}%</span
										>
									</div>
									<div class="strategy-metric">
										<span>Total P&L</span>
										<span
											class="value"
											class:positive={backtestResult.metrics.yesPerformance.pnl >= 0}
											class:negative={backtestResult.metrics.yesPerformance.pnl < 0}
										>
											{formatUSDC(backtestResult.metrics.yesPerformance.pnl)}
										</span>
									</div>
								</div>
							</div>

							<div class="strategy-card no-card">
								<div class="strategy-header">
									<span class="strategy-badge no">NO</span>
									<span class="strategy-count"
										>{backtestResult.metrics.noPerformance.count} trades</span
									>
								</div>
								<div class="strategy-metrics">
									<div class="strategy-metric">
										<span>Win Rate</span>
										<span class="value positive"
											>{backtestResult.metrics.noPerformance.winRate.toFixed(1)}%</span
										>
									</div>
									<div class="strategy-metric">
										<span>Total P&L</span>
										<span
											class="value"
											class:positive={backtestResult.metrics.noPerformance.pnl >= 0}
											class:negative={backtestResult.metrics.noPerformance.pnl < 0}
										>
											{formatUSDC(backtestResult.metrics.noPerformance.pnl)}
										</span>
									</div>
								</div>
							</div>
						</div>
					</div>

					<!-- Pro Metrics Section -->
					<div class="section pro-section">
						<div class="pro-header">
							<h2>⭐ Professional Metrics</h2>
							<button class="btn-unlock" on:click={() => (showProMetrics = !showProMetrics)}>
								{showProMetrics ? '🔓 Hide' : '🔒 Show All (Free for now)'}
							</button>
						</div>

						{#if showProMetrics}
							<!-- Equity Curve Chart -->
							<div class="chart-section">
								<EquityCurveChart
									equityCurve={backtestResult.metrics.equityCurve}
									initialCapital={backtestResult.startingCapital}
								/>
							</div>

							<!-- Pro Metrics Grid -->
							<div class="metrics-grid">
								<div class="metric-card pro">
									<div class="metric-label">Max Drawdown</div>
									<div class="metric-value negative">
										{formatUSDC(backtestResult.metrics.maxDrawdown)}
									</div>
									<div class="metric-sublabel">
										{backtestResult.metrics.maxDrawdownPercentage.toFixed(2)}%
									</div>
								</div>
								<div class="metric-card pro">
									<div class="metric-label">Sharpe Ratio</div>
									<div class="metric-value">
										{backtestResult.metrics.sharpeRatio.toFixed(2)}
									</div>
								</div>
								<div class="metric-card pro">
									<div class="metric-label">Volatility</div>
									<div class="metric-value">
										{backtestResult.metrics.volatility.toFixed(2)}%
									</div>
								</div>
								<div class="metric-card pro">
									<div class="metric-label">Expectancy</div>
									<div class="metric-value">
										{formatUSDC(backtestResult.metrics.expectancy)}
									</div>
								</div>
								<div class="metric-card pro">
									<div class="metric-label">Median Win</div>
									<div class="metric-value positive">
										{formatUSDC(backtestResult.metrics.medianWin)}
									</div>
								</div>
								<div class="metric-card pro">
									<div class="metric-label">Median Loss</div>
									<div class="metric-value negative">
										{formatUSDC(backtestResult.metrics.medianLoss)}
									</div>
								</div>
								<div class="metric-card pro">
									<div class="metric-label">Avg Hold Time</div>
									<div class="metric-value">
										{backtestResult.metrics.avgHoldTime.toFixed(1)}h
									</div>
								</div>
								<div class="metric-card pro">
									<div class="metric-label">Profit Factor</div>
									<div class="metric-value">
										{backtestResult.metrics.profitFactor.toFixed(2)}
									</div>
								</div>
								<div class="metric-card pro">
									<div class="metric-label">Consecutive Wins</div>
									<div class="metric-value positive">
										{backtestResult.metrics.consecutiveWins}
									</div>
								</div>
								<div class="metric-card pro">
									<div class="metric-label">Consecutive Losses</div>
									<div class="metric-value negative">
										{backtestResult.metrics.consecutiveLosses}
									</div>
								</div>
							</div>
						{/if}
					</div>

					<!-- Top/Worst Trades -->
					<div class="section">
						<h2>🏆 Best & Worst Trades</h2>
						<div class="trades-comparison">
							<div class="trades-panel">
								<h3>Top 5 Trades</h3>
								{#each topTrades as trade}
									<div class="trade-item">
										<div class="trade-info">
											<div class="trade-market">{trade.marketName.substring(0, 50)}...</div>
											<div class="trade-meta">
												<span class="trade-badge {trade.side.toLowerCase()}">{trade.side}</span>
												<span class="trade-date">{formatDateTime(trade.entryTime)}</span>
											</div>
										</div>
										<div class="trade-result positive">
											{formatUSDC(trade.pnl)} ({formatPercentage(trade.pnlPercentage)})
										</div>
									</div>
								{/each}
							</div>

							<div class="trades-panel">
								<h3>Worst 5 Trades</h3>
								{#each worstBacktestTrades as trade}
									<div class="trade-item">
										<div class="trade-info">
											<div class="trade-market">{trade.marketName.substring(0, 50)}...</div>
											<div class="trade-meta">
												<span class="trade-badge {trade.side.toLowerCase()}">{trade.side}</span>
												<span class="trade-date">{formatDateTime(trade.entryTime)}</span>
											</div>
										</div>
										<div class="trade-result negative">
											{formatUSDC(trade.pnl)} ({formatPercentage(trade.pnlPercentage)})
										</div>
									</div>
								{/each}
							</div>
						</div>
					</div>

					<!-- All Trades Table -->
					<div class="section">
						<h2>📋 All Trades ({sortedTrades.length})</h2>
						<div class="trades-table">
							<table>
								<thead>
									<tr>
										<th>Market</th>
										<th>Side</th>
										<th>Entry</th>
										<th>Exit</th>
										<th>Entry Price</th>
										<th>Exit Price</th>
										<th>Amount</th>
										<th>P&L</th>
										<th>%</th>
										<th>Exit Reason</th>
									</tr>
								</thead>
								<tbody>
									{#each sortedTrades as trade}
										<tr>
											<td class="market-cell">{trade.marketName.substring(0, 40)}...</td>
											<td>
												<span class="trade-badge {trade.side.toLowerCase()}">{trade.side}</span>
											</td>
											<td>{formatDateTime(trade.entryTime)}</td>
											<td>{trade.exitTime ? formatDateTime(trade.exitTime) : '-'}</td>
											<td>{trade.entryPrice.toFixed(3)}</td>
											<td>{trade.exitPrice.toFixed(3)}</td>
											<td>{formatUSDC(trade.amountInvested)}</td>
											<td class:positive={trade.pnl >= 0} class:negative={trade.pnl < 0}>
												{formatUSDC(trade.pnl)}
											</td>
											<td class:positive={trade.pnl >= 0} class:negative={trade.pnl < 0}>
												{formatPercentage(trade.pnlPercentage)}
											</td>
											<td><span class="exit-reason">{trade.exitReason || '-'}</span></td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.backtesting-container {
		min-height: 100vh;
		background: #0a0e1a;
		color: white;
		padding: 40px 20px;
		max-width: 1600px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: 32px;
		text-align: center;
	}

	.page-header h1 {
		font-size: 36px;
		font-weight: 700;
		margin: 0 0 8px 0;
		color: #e8e8e8;
	}

	.subtitle {
		color: #8b92ab;
		font-size: 16px;
		margin: 0;
	}

	/* Main Tabs */
	.main-tabs {
		display: flex;
		gap: 12px;
		margin-bottom: 32px;
		border-bottom: 2px solid #2a2f45;
		justify-content: center;
	}

	.main-tab {
		background: transparent;
		border: none;
		color: #8b92ab;
		padding: 14px 32px;
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		border-bottom: 3px solid transparent;
		margin-bottom: -2px;
		transition: all 0.2s;
	}

	.main-tab:hover:not(:disabled) {
		color: #00b4ff;
	}

	.main-tab.active {
		color: white;
		border-bottom-color: #00b4ff;
	}

	/* Sub Tabs */
	.tabs {
		display: flex;
		gap: 8px;
		margin-bottom: 24px;
		border-bottom: 2px solid #2a2f45;
	}

	.tab {
		background: transparent;
		border: none;
		color: #8b92ab;
		padding: 12px 24px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
		transition: all 0.2s;
	}

	.tab:hover:not(:disabled) {
		color: #00b4ff;
	}

	.tab.active {
		color: white;
		border-bottom-color: #00b4ff;
	}

	.tab:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.section {
		margin-bottom: 40px;
		background: #151b2f;
		border: 1px solid #2a2f45;
		border-radius: 12px;
		padding: 24px;
	}

	.section h2 {
		font-size: 20px;
		font-weight: 600;
		margin: 0 0 20px 0;
		color: #e8e8e8;
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
	}

	.metric-card {
		background: #0a0e1a;
		border: 1px solid #2a2f45;
		border-radius: 8px;
		padding: 20px;
	}

	.metric-card.pro {
		border-color: #00b4ff;
		background: rgba(0, 180, 255, 0.05);
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
		font-size: 28px;
		font-weight: 700;
		color: white;
		margin-bottom: 4px;
	}

	.metric-value.positive {
		color: #00d68f;
	}

	.metric-value.negative {
		color: #ff6b6b;
	}

	.metric-sublabel {
		font-size: 11px;
		color: #6b7280;
	}

	.metric-progress {
		margin-top: 8px;
		height: 4px;
		background: #2a2f45;
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-bar {
		height: 100%;
		background: linear-gradient(90deg, #00b4ff 0%, #00d084 100%);
		transition: width 0.5s ease;
	}

	.strategy-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 20px;
	}

	.strategy-card {
		background: #0a0e1a;
		border: 1px solid #2a2f45;
		border-radius: 12px;
		padding: 24px;
	}

	.strategy-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
	}

	.strategy-badge {
		padding: 6px 12px;
		border-radius: 6px;
		font-size: 14px;
		font-weight: 700;
		letter-spacing: 0.5px;
	}

	.strategy-badge.yes {
		background: rgba(0, 214, 143, 0.15);
		color: #00d68f;
		border: 1px solid #00d68f;
	}

	.strategy-badge.no {
		background: rgba(255, 107, 107, 0.15);
		color: #ff6b6b;
		border: 1px solid #ff6b6b;
	}

	.strategy-count {
		font-size: 12px;
		color: #8b92ab;
	}

	.strategy-metrics {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin-bottom: 20px;
	}

	.strategy-metric {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.strategy-metric-label {
		font-size: 13px;
		color: #8b92ab;
	}

	.strategy-metric-value {
		font-size: 16px;
		font-weight: 600;
		color: white;
	}

	.strategy-metric-value.positive,
	.value.positive {
		color: #00d68f;
	}

	.strategy-metric-value.negative,
	.value.negative {
		color: #ff6b6b;
	}

	.strategy-bar {
		height: 8px;
		background: #2a2f45;
		border-radius: 4px;
		overflow: hidden;
	}

	.bar-fill {
		height: 100%;
		transition: width 0.5s ease;
	}

	.yes-bar {
		background: linear-gradient(90deg, #00d68f 0%, #00f5a0 100%);
	}

	.no-bar {
		background: linear-gradient(90deg, #ff6b6b 0%, #ff8e8e 100%);
	}

	.trades-comparison {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
		gap: 20px;
	}

	.trades-panel {
		background: #0a0e1a;
		border: 1px solid #2a2f45;
		border-radius: 12px;
		padding: 24px;
	}

	.trades-panel h2,
	.trades-panel h3 {
		font-size: 18px;
		margin: 0 0 16px 0;
	}

	.trades-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.trade-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px;
		background: #151b2f;
		border: 1px solid #2a2f45;
		border-radius: 8px;
	}

	.trade-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.trade-market {
		font-size: 13px;
		color: #e8e8e8;
	}

	.trade-type,
	.trade-badge {
		font-size: 11px;
		font-weight: 600;
		width: fit-content;
		padding: 2px 6px;
		border-radius: 4px;
	}

	.trade-type.yes,
	.trade-badge.yes {
		background: rgba(0, 214, 143, 0.1);
		color: #00d68f;
	}

	.trade-type.no,
	.trade-badge.no {
		background: rgba(255, 107, 107, 0.1);
		color: #ff6b6b;
	}

	.trade-meta {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.trade-date {
		font-size: 10px;
		color: #6b7280;
	}

	.trade-result {
		font-size: 14px;
		font-weight: 600;
		text-align: right;
	}

	.trade-result.positive,
	.positive {
		color: #00d68f;
	}

	.trade-result.negative,
	.negative {
		color: #ff6b6b;
	}

	.no-trades {
		text-align: center;
		padding: 20px;
		color: #6b7280;
		font-size: 14px;
	}

	.insights-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 16px;
	}

	.insight-card {
		background: #0a0e1a;
		border: 1px solid #2a2f45;
		border-left: 3px solid #00b4ff;
		border-radius: 8px;
		padding: 16px 20px;
	}

	.insight-card p {
		margin: 0;
		font-size: 14px;
		line-height: 1.6;
		color: #e8e8e8;
	}

	.loading-state,
	.empty-state {
		text-align: center;
		padding: 80px 20px;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #2a2f45;
		border-top-color: #00b4ff;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 16px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.empty-icon {
		font-size: 64px;
		margin-bottom: 16px;
	}

	.empty-state h3 {
		font-size: 24px;
		font-weight: 600;
		margin: 0 0 8px 0;
	}

	.empty-state p {
		color: #8b92ab;
		font-size: 16px;
		margin: 0;
	}

	/* Config Panel Styles */
	.config-panel {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.config-section {
		background: #151b2f;
		border: 1px solid #2a2f45;
		border-radius: 12px;
		padding: 24px;
	}

	.config-section h2 {
		font-size: 18px;
		font-weight: 600;
		margin: 0 0 20px 0;
		color: #e8e8e8;
	}

	.form-group {
		margin-bottom: 16px;
	}

	.form-group label {
		display: block;
		font-size: 13px;
		font-weight: 600;
		color: #8b92ab;
		margin-bottom: 8px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.form-group input,
	.form-group select {
		width: 100%;
		background: #0a0e1a;
		border: 1px solid #2a2f45;
		border-radius: 8px;
		padding: 12px;
		color: white;
		font-size: 14px;
	}

	.form-group input:focus,
	.form-group select:focus {
		outline: none;
		border-color: #00b4ff;
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
	}

	.checkbox-group {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 12px;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		color: #e8e8e8;
		cursor: pointer;
		text-transform: none;
		font-weight: normal;
		letter-spacing: normal;
	}

	.checkbox-label input[type='checkbox'] {
		width: auto;
		cursor: pointer;
	}

	.run-section {
		background: #151b2f;
		border: 1px solid #2a2f45;
		border-radius: 12px;
		padding: 24px;
		text-align: center;
	}

	.btn-run {
		background: linear-gradient(90deg, #00b4ff 0%, #00d084 100%);
		border: none;
		color: white;
		padding: 16px 48px;
		font-size: 16px;
		font-weight: 700;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.3s;
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}

	.btn-run:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 16px rgba(0, 180, 255, 0.3);
	}

	.btn-run:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.spinner-small {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.progress-bar-container {
		margin-top: 16px;
		height: 8px;
		background: #2a2f45;
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #00b4ff 0%, #00d084 100%);
		transition: width 0.3s ease;
	}

	.error-message {
		background: rgba(255, 107, 107, 0.1);
		border: 1px solid #ff6b6b;
		border-radius: 8px;
		padding: 12px;
		color: #ff6b6b;
		margin-bottom: 16px;
		font-size: 14px;
	}

	/* Results Panel */
	.results-panel {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.export-section {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
	}

	.btn-export {
		background: #151b2f;
		border: 1px solid #2a2f45;
		color: white;
		padding: 10px 20px;
		font-size: 14px;
		font-weight: 600;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-export:hover {
		background: #1f2637;
		border-color: #00b4ff;
		transform: translateY(-1px);
	}

	.results-header {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
	}

	.result-card {
		background: #151b2f;
		border: 1px solid #2a2f45;
		border-radius: 12px;
		padding: 20px;
		text-align: center;
	}

	.result-label {
		font-size: 12px;
		color: #8b92ab;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 8px;
		font-weight: 600;
	}

	.result-value {
		font-size: 24px;
		font-weight: 700;
		color: white;
	}

	.pro-section {
		border: 2px solid #00b4ff;
	}

	.pro-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
	}

	.btn-unlock {
		background: linear-gradient(90deg, #00b4ff 0%, #00d084 100%);
		border: none;
		color: white;
		padding: 8px 16px;
		font-size: 14px;
		font-weight: 600;
		border-radius: 6px;
		cursor: pointer;
	}

	.chart-section {
		margin-bottom: 24px;
	}

	.trades-table {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}

	thead {
		background: #0a0e1a;
	}

	th {
		padding: 12px;
		text-align: left;
		font-weight: 600;
		color: #8b92ab;
		text-transform: uppercase;
		font-size: 11px;
		letter-spacing: 0.5px;
	}

	td {
		padding: 12px;
		border-top: 1px solid #2a2f45;
		color: #e8e8e8;
	}

	.market-cell {
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.exit-reason {
		font-size: 11px;
		padding: 2px 6px;
		background: #2a2f45;
		border-radius: 4px;
		color: #8b92ab;
	}

	@media (max-width: 768px) {
		.backtesting-container {
			padding: 20px 12px;
		}

		.page-header h1 {
			font-size: 24px;
		}

		.main-tabs {
			flex-direction: column;
		}

		.main-tab {
			width: 100%;
		}

		.metrics-grid,
		.strategy-grid,
		.trades-comparison {
			grid-template-columns: 1fr;
		}

		.form-grid {
			grid-template-columns: 1fr;
		}

		.results-header {
			grid-template-columns: 1fr 1fr;
		}
	}

	/* Market Browser Styles */
	.markets-container {
		margin-top: 1rem;
		border: 1px solid #334155;
		border-radius: 8px;
		overflow: hidden;
		background: #1a1f2e;
	}

	.markets-header {
		padding: 0.75rem 1rem;
		background: #0f1419;
		border-bottom: 1px solid #334155;
		font-size: 0.875rem;
		color: #94a3b8;
		font-weight: 500;
	}

	.markets-list {
		max-height: 400px;
		overflow-y: auto;
	}

	.market-item {
		width: 100%;
		padding: 1rem;
		background: #1a1f2e;
		border: none;
		border-bottom: 1px solid #334155;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		justify-content: space-between;
		align-items: center;
		text-align: left;
		color: white;
	}

	.market-item:hover {
		background: #252b3b;
	}

	.market-item.selected {
		background: #1e3a4a;
		border-left: 3px solid #10b981;
	}

	.market-info {
		flex: 1;
	}

	.market-question {
		font-size: 0.95rem;
		font-weight: 500;
		margin-bottom: 0.5rem;
		color: #e2e8f0;
	}

	.market-meta {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		font-size: 0.8rem;
		color: #94a3b8;
	}

	.market-category {
		background: #334155;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		font-weight: 500;
	}

	.market-selected-badge {
		padding: 0.5rem 1rem;
		background: #10b981;
		color: white;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.markets-loading,
	.markets-empty {
		padding: 2rem;
		text-align: center;
		color: #64748b;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.markets-overflow {
		padding: 1rem;
		text-align: center;
		color: #64748b;
		font-size: 0.85rem;
		background: #0f1419;
		border-top: 1px solid #334155;
	}

	.btn-secondary {
		background: #334155;
		color: white;
		border: none;
		border-radius: 8px;
		padding: 0.75rem 1.5rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-secondary:hover:not(:disabled) {
		background: #475569;
	}

	.btn-secondary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.link-button {
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		font: inherit;
		cursor: pointer;
		color: inherit;
	}

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

	.warning-box ul {
		margin: 0.75rem 0 0.75rem 1.5rem;
		color: #d1d5db;
		line-height: 1.8;
	}

	.warning-box li {
		margin-bottom: 0.5rem;
	}

	.warning-box strong {
		color: #fbbf24;
	}

	.btn-load-markets {
		width: 100%;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 8px;
		padding: 1rem 1.5rem;
		font-weight: 600;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.btn-load-markets:hover:not(:disabled) {
		background: #2563eb;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
	}

	.btn-load-markets:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.market-filters {
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid #334155;
	}

	.filter-results {
		margin-top: 0.75rem;
		padding: 0.75rem 1rem;
		background: #1a1f2e;
		border-radius: 6px;
		border: 1px solid #334155;
	}

.spinner-small {
	display: inline-block;
	width: 16px;
	height: 16px;
	border: 2px solid rgba(255, 255, 255, 0.3);
	border-top-color: white;
	border-radius: 50%;
	animation: spin 0.6s linear infinite;
}

/* ============= WIZARD STYLES ============= */
.wizard-container {
	background: #141824;
	border-radius: 12px;
	padding: 32px;
	max-width: 900px;
	margin: 0 auto;
}

.wizard-progress {
	margin-bottom: 40px;
}

.progress-bar {
	height: 4px;
	background: #1e2537;
	border-radius: 2px;
	overflow: hidden;
	margin-bottom: 16px;
}

.progress-fill {
	height: 100%;
	background: linear-gradient(90deg, #3b82f6, #6366f1);
	transition: width 0.3s ease;
}

.progress-steps {
	display: flex;
	justify-content: space-between;
	gap: 8px;
}

.progress-step {
	flex: 1;
	height: 40px;
	background: #1e2537;
	border: 2px solid transparent;
	border-radius: 8px;
	color: #64748b;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s;
}

.progress-step:hover {
	background: #252d42;
	border-color: #3b82f6;
}

.progress-step.active {
	background: #1e2537;
	color: white;
	border-color: #3b82f6;
}

.progress-step.completed {
	background: #1e2537;
	color: #8b92ab;
	border-color: #2a2f45;
}

.wizard-content {
	min-height: 400px;
}

.wizard-step {
	animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
	from { opacity: 0; transform: translateY(10px); }
	to { opacity: 1; transform: translateY(0); }
}

.step-header {
	text-align: center;
	margin-bottom: 32px;
}

.step-header h2 {
	font-size: 28px;
	font-weight: 700;
	color: #e8e8e8;
	margin: 0 0 8px 0;
}

.step-header p {
	font-size: 16px;
	color: #8b92ab;
	margin: 0;
}

.step-body {
	max-width: 700px;
	margin: 0 auto;
}

/* Date Range Step */
.date-inputs {
	display: flex;
	align-items: center;
	gap: 24px;
	margin-bottom: 24px;
}

.date-input-group {
	flex: 1;
}

.date-input-group label {
	display: block;
	font-size: 14px;
	font-weight: 600;
	color: #8b92ab;
	margin-bottom: 8px;
}

.date-input {
	width: 100%;
	padding: 12px 16px;
	background: #1e2537;
	border: 2px solid #2a2f45;
	border-radius: 8px;
	color: white;
	font-size: 16px;
	transition: all 0.2s;
}

.date-input:focus {
	outline: none;
	border-color: #3b82f6;
	background: #252d42;
}


.date-summary {
	text-align: center;
	padding: 12px;
	background: #1e2537;
	border-radius: 8px;
	color: #60a5fa;
	font-size: 14px;
	font-weight: 600;
}

/* Initial Capital Step */
.capital-input-wrapper {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-bottom: 24px;
	padding: 24px;
	background: #1e2537;
	border-radius: 12px;
	border: 2px solid #2a2f45;
}

.capital-input {
	flex: 1;
	background: transparent;
	border: none;
	color: white;
	font-size: 32px;
	font-weight: 700;
	outline: none;
	text-align: center;
}

.capital-input::placeholder {
	color: #4b5563;
}

.currency-label {
	font-size: 16px;
	font-weight: 600;
	color: #64748b;
}

.capital-presets {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 12px;
}

.preset-btn {
	padding: 12px 16px;
	background: #1e2537;
	border: 2px solid #2a2f45;
	border-radius: 8px;
	color: #8b92ab;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s;
}

.preset-btn:hover {
	background: #252d42;
	border-color: #3b82f6;
	color: white;
}

/* Market Selection Step */
.selected-market-display {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	margin-bottom: 24px;
	padding: 20px;
	background: #1e3a5f;
	border: 2px solid #3b82f6;
	border-radius: 8px;
}

.selected-market-info {
	flex: 1;
}

.selected-label {
	font-size: 12px;
	color: #8b92ab;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	margin-bottom: 8px;
}

.selected-market-title {
	font-size: 16px;
	font-weight: 600;
	color: white;
	line-height: 1.4;
}

.change-market-btn {
	padding: 10px 24px;
	background: transparent;
	border: 2px solid #3b82f6;
	border-radius: 8px;
	color: #3b82f6;
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s;
	white-space: nowrap;
}

.change-market-btn:hover {
	background: #3b82f6;
	color: white;
}

.category-filter-grid {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 8px;
	margin-bottom: 24px;
	padding: 16px;
	background: #1e2537;
	border-radius: 8px;
}

.category-chip {
	padding: 10px 18px;
	background: transparent;
	border: 2px solid #2a2f45;
	border-radius: 8px;
	color: #8b92ab;
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s;
	white-space: nowrap;
}

.category-chip:hover {
	background: #252d42;
	border-color: #3b82f6;
	color: white;
}

.category-chip.selected {
	background: #1e3a5f;
	border-color: #3b82f6;
	color: white;
}

.search-wrapper {
	margin-bottom: 16px;
}

.search-input {
	width: 100%;
	padding: 12px 16px;
	background: #1e2537;
	border: 2px solid #2a2f45;
	border-radius: 8px;
	color: white;
	font-size: 16px;
	margin-bottom: 8px;
}

.search-input:focus {
	outline: none;
	border-color: #3b82f6;
}

.search-results-count {
	font-size: 14px;
	color: #64748b;
	text-align: right;
}

.loading-state, .empty-state {
	text-align: center;
	padding: 60px 20px;
	color: #64748b;
}

.spinner {
	display: inline-block;
	width: 32px;
	height: 32px;
	border: 3px solid rgba(255, 255, 255, 0.1);
	border-top-color: #3b82f6;
	border-radius: 50%;
	animation: spin 0.6s linear infinite;
	margin-bottom: 16px;
}

.markets-grid {
	display: grid;
	gap: 12px;
	max-height: 400px;
	overflow-y: auto;
	padding: 4px;
	margin-bottom: 16px;
}

.market-card {
	width: 100%;
	text-align: left;
	padding: 16px;
	background: #1e2537;
	border: 2px solid #2a2f45;
	border-radius: 8px;
	cursor: pointer;
	transition: all 0.2s;
	position: relative;
}

.market-card:hover {
	background: #252d42;
	border-color: #3b82f6;
	transform: translateY(-2px);
}

.market-card.selected {
	background: #1e3a5f;
	border-color: #3b82f6;
}

.market-title {
	font-size: 14px;
	font-weight: 600;
	color: white;
	margin-bottom: 8px;
	line-height: 1.4;
}

.market-meta {
	display: flex;
	gap: 12px;
	align-items: center;
	flex-wrap: wrap;
}

.market-tag {
	font-size: 12px;
	padding: 4px 8px;
	background: #2a2f45;
	border-radius: 4px;
	color: #8b92ab;
}

.market-volume {
	font-size: 12px;
	color: #10b981;
	font-weight: 600;
}

.market-end-date {
	font-size: 12px;
	color: #64748b;
	margin-top: 8px;
}

.market-outcome {
	font-size: 12px;
	color: #8b92ab;
	margin-top: 4px;
	font-weight: 500;
}

.selected-badge {
	position: absolute;
	top: 12px;
	right: 12px;
	padding: 4px 12px;
	background: #3b82f6;
	color: white;
	border-radius: 12px;
	font-size: 12px;
	font-weight: 600;
}

.clear-selection-btn {
	width: 100%;
	padding: 12px;
	background: transparent;
	border: 2px dashed #2a2f45;
	border-radius: 8px;
	color: #64748b;
	cursor: pointer;
	transition: all 0.2s;
}

.clear-selection-btn:hover {
	border-color: #ef4444;
	color: #ef4444;
	background: rgba(239, 68, 68, 0.1);
}

/* Market Selection Filters */
.filter-section {
	margin-bottom: 24px;
}

.filter-section h3 {
	font-size: 16px;
	font-weight: 600;
	color: white;
	margin-bottom: 12px;
}

.filters-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 16px;
	margin-bottom: 16px;
}

.filter-item {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.filter-item label {
	font-size: 13px;
	font-weight: 600;
	color: #8b92ab;
	text-transform: uppercase;
	letter-spacing: 0.5px;
}

.filter-item-full {
	grid-column: 1 / -1;
}

.filter-input-uniform {
	width: 100%;
	padding: 12px 16px;
	background: #1e2537;
	border: 2px solid #2a2f45;
	border-radius: 8px;
	color: white;
	font-size: 14px;
	height: 44px;
	box-sizing: border-box;
	transition: all 0.2s;
}

.filter-input-uniform:focus {
	outline: none;
	border-color: #3b82f6;
	background: #252d42;
}

.filter-input-uniform::placeholder {
	color: #64748b;
}

.duration-display {
	width: 100%;
	padding: 12px 16px;
	background: #1e2537;
	border: 2px solid #2a2f45;
	border-radius: 8px;
	color: white;
	font-size: 14px;
	height: 44px;
	box-sizing: border-box;
	display: flex;
	align-items: center;
}

.advanced-filters-panel {
	margin-top: 16px;
	padding: 16px;
	background: #1e2537;
	border: 2px solid #2a2f45;
	border-radius: 8px;
}

.advanced-filters {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
	gap: 16px;
}

.filter-group {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.filter-group label {
	font-size: 13px;
	font-weight: 500;
	color: #8b92ab;
}

.filter-input {
	padding: 10px 12px;
	background: #1e2537;
	border: 2px solid #2a2f45;
	border-radius: 6px;
	color: white;
	font-size: 14px;
	transition: all 0.2s;
}

.filter-input:focus {
	outline: none;
	border-color: #3b82f6;
	background: #252d42;
}

.filter-input::placeholder {
	color: #64748b;
}

/* Markets Table */
.markets-table-container {
	margin-top: 20px;
}

.results-info {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 12px;
	font-size: 13px;
	color: #8b92ab;
}

.markets-table {
	width: 100%;
	border-collapse: collapse;
	background: transparent;
	border-radius: 8px;
	overflow: hidden;
}

.markets-table thead {
	background: transparent;
}

.markets-table th {
	padding: 16px;
	text-align: left;
	font-size: 12px;
	font-weight: 600;
	color: #8b92ab;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	border-bottom: 1px solid #2a2f45;
}

.event-header {
	width: 40%;
}

.sortable-header {
	cursor: pointer;
	user-select: none;
	transition: all 0.2s;
}

.sortable-header:hover {
	background: rgba(59, 130, 246, 0.1);
}

.sort-header-content {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.sort-indicator {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	height: 16px;
	color: #64748b;
	transition: all 0.2s;
	font-size: 14px;
	font-weight: 600;
}

.sort-indicator.active {
	color: #3b82f6;
}

.sort-indicator svg {
	width: 12px;
	height: 12px;
	opacity: 0.5;
	transition: opacity 0.2s;
}

.sortable-header:hover .sort-indicator svg {
	opacity: 1;
}

.sort-indicator.active svg {
	opacity: 0;
}

.markets-table tbody tr {
	border-bottom: 1px solid #2a2f45;
	transition: background 0.2s;
	cursor: pointer;
}

.markets-table tbody tr:last-child {
	border-bottom: none;
}

.markets-table tbody tr:hover {
	background: rgba(59, 130, 246, 0.05);
}

.markets-table tbody tr.selected {
	background: rgba(59, 130, 246, 0.1);
	border-left: 3px solid #3b82f6;
}

.markets-table td {
	padding: 16px;
	font-size: 14px;
	color: white;
	vertical-align: middle;
}

.event-cell {
	max-width: 400px;
}

.event-content {
	display: flex;
	align-items: center;
}

.event-info {
	flex: 1;
	min-width: 0;
}

.event-title {
	font-weight: 500;
	line-height: 1.4;
	color: #e8e8e8;
	font-size: 14px;
}

.volume-cell {
	font-weight: 600;
	color: #10b981;
	font-size: 14px;
}

.ends-cell {
	color: #8b92ab;
	font-size: 14px;
}

.tags-cell {
	padding: 16px;
}

.tags-container {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.tag-badge {
	display: inline-block;
	padding: 4px 10px;
	background: #2a2f45;
	border-radius: 4px;
	color: #8b92ab;
	font-size: 12px;
	font-weight: 500;
	white-space: nowrap;
}

.tag-more {
	color: #64748b;
	font-size: 12px;
	font-weight: 500;
}

/* Pagination */
.pagination-controls {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-top: 20px;
	padding: 16px;
	background: #1e2537;
	border-radius: 8px;
}

.pagination-buttons {
	display: flex;
	gap: 8px;
	align-items: center;
}

.pagination-btn {
	padding: 8px 16px;
	background: #252d42;
	border: 1px solid #2a2f45;
	border-radius: 6px;
	color: white;
	font-size: 13px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.2s;
}

.pagination-btn:hover:not(:disabled) {
	background: #2a2f45;
	border-color: #3b82f6;
}

.pagination-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.page-info {
	font-size: 14px;
	color: #8b92ab;
	margin: 0 12px;
}

.rows-per-page {
	display: flex;
	gap: 8px;
	align-items: center;
	font-size: 13px;
	color: #8b92ab;
}

.rows-per-page select {
	padding: 6px 12px;
	background: #252d42;
	border: 1px solid #2a2f45;
	border-radius: 6px;
	color: white;
	font-size: 13px;
	cursor: pointer;
}

.selected-market-meta {
	display: flex;
	gap: 16px;
	margin-top: 8px;
	font-size: 13px;
	color: #8b92ab;
}

.selected-market-meta span {
	padding: 4px 12px;
	background: #252d42;
	border-radius: 4px;
}

/* Entry Rules Step */
.form-section {
	margin-bottom: 24px;
}

.form-section label {
	display: block;
	font-size: 14px;
	font-weight: 600;
	color: #8b92ab;
	margin-bottom: 12px;
}

.entry-type-buttons {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 12px;
}

.entry-btn {
	padding: 12px 16px;
	background: #1e2537;
	border: 2px solid #2a2f45;
	border-radius: 8px;
	color: #8b92ab;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s;
}

.entry-btn:hover {
	background: #252d42;
	border-color: #3b82f6;
}

.entry-btn.active {
	background: #1e3a5f;
	border-color: #3b82f6;
	color: white;
}

.price-range {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.range-input-group {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 16px;
	background: #1e2537;
	border-radius: 8px;
}

.range-label {
	font-size: 14px;
	font-weight: 600;
	color: #8b92ab;
	min-width: 40px;
}

.price-slider {
	flex: 1;
	height: 6px;
	background: #2a2f45;
	border-radius: 3px;
	outline: none;
	-webkit-appearance: none;
}

.price-slider::-webkit-slider-thumb {
	-webkit-appearance: none;
	appearance: none;
	width: 18px;
	height: 18px;
	background: #3b82f6;
	border-radius: 50%;
	cursor: pointer;
}

.price-slider::-moz-range-thumb {
	width: 18px;
	height: 18px;
	background: #3b82f6;
	border-radius: 50%;
	cursor: pointer;
	border: none;
}

.range-value {
	font-size: 16px;
	font-weight: 700;
	color: white;
	min-width: 50px;
	text-align: right;
}

/* Exit Rules Step */
.exit-input {
	width: 100%;
	padding: 12px 16px;
	background: #1e2537;
	border: 2px solid #2a2f45;
	border-radius: 8px;
	color: white;
	font-size: 16px;
}

.exit-input:focus {
	outline: none;
	border-color: #3b82f6;
}

.checkbox-label {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 16px;
	background: #1e2537;
	border-radius: 8px;
	cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
	width: 20px;
	height: 20px;
	accent-color: #3b82f6;
}

.checkbox-label span {
	color: white;
	font-weight: 500;
}

/* Review & Run Step */
.config-summary {
	background: #1e2537;
	border-radius: 12px;
	padding: 24px;
	margin-bottom: 24px;
}

.config-summary h3 {
	font-size: 18px;
	font-weight: 700;
	color: white;
	margin: 0 0 20px 0;
}

.summary-grid {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 16px;
}

.summary-item {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.summary-label {
	font-size: 12px;
	color: #64748b;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.5px;
}

.summary-value {
	font-size: 16px;
	color: white;
	font-weight: 600;
}

.btn-run-backtest {
	width: 100%;
	padding: 16px 32px;
	background: #1e2537;
	border: 2px solid #2a2f45;
	border-radius: 8px;
	color: white;
	font-size: 18px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 12px;
}

.btn-run-backtest:hover:not(:disabled) {
	background: #252d42;
	border-color: #3b82f6;
}

.btn-run-backtest:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

/* Wizard Navigation */
.wizard-navigation {
	display: flex;
	justify-content: space-between;
	gap: 16px;
	margin-top: 32px;
	padding-top: 24px;
	border-top: 2px solid #2a2f45;
}

.nav-btn {
	padding: 12px 32px;
	background: #1e2537;
	border: 2px solid #2a2f45;
	border-radius: 8px;
	color: white;
	font-size: 16px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s;
}

.nav-btn:hover:not(:disabled) {
	background: #252d42;
	border-color: #3b82f6;
}

.nav-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.nav-next {
	margin-left: auto;
}
</style>
