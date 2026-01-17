<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { fade } from 'svelte/transition';
	import { walletStore } from '$lib/wallet/stores';
	import { polymarketService } from '$lib/solana/polymarket-service';
	import { polymarketClient } from '$lib/polymarket';
	import { PublicKey } from '@solana/web3.js';
	import type { BacktestResult } from '$lib/backtesting/types';
	import EquityCurveChart from '$lib/components/EquityCurveChart.svelte';
	import PnLDistributionChart from '$lib/components/PnLDistributionChart.svelte';

	// Main tab state - set based on URL parameter
	let activeMainTab: 'summary' | 'strategies' = 'summary';

	// Update tab based on URL parameter
	$: if (browser) {
		const tab = $page.url.searchParams.get('tab');
		if (tab === 'strategy') {
			activeMainTab = 'strategies';
		} else {
			activeMainTab = 'summary';
		}
	}

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
		closedPrice?: number; // Price when position was closed
		pnl: number;
		pnlPercentage: number;
		status: 'Active' | 'Closed';
		openedAt: Date;
		closedAt?: Date; // When position was closed
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
				const isClosed = !('active' in pos.status);

				// For closed positions, use averageSellPrice as the closed price
				const closedPrice = isClosed && pos.averageSellPrice
					? pos.averageSellPrice.toNumber() / 1_000_000
					: undefined;

				return {
					id: pos.positionId.toString(),
					marketId: pos.marketId,
					marketName: `Market ${pos.marketId.slice(0, 10)}...`,
					predictionType: (isYes ? 'Yes' : 'No') as 'Yes' | 'No',
					amountUsdc,
					shares,
					pricePerShare,
					currentPrice: pricePerShare,
					closedPrice,
					pnl: 0,
					pnlPercentage: 0,
					status: (isClosed ? 'Closed' : 'Active') as 'Active' | 'Closed',
					openedAt: new Date(pos.openedAt.toNumber() * 1000),
					closedAt: isClosed ? new Date(pos.closedAt.toNumber() * 1000) : undefined
				};
			});

			await Promise.all(
				initialPositions.map(async (pos) => {
					try {
						// For closed positions, use closedPrice instead of fetching current price
						if (pos.status === 'Closed' && pos.closedPrice !== undefined) {
							const closedValue = pos.shares * pos.closedPrice;
							pos.currentPrice = pos.closedPrice; // Set current price to closed price for display
							pos.pnl = closedValue - pos.amountUsdc;
							pos.pnlPercentage = (pos.pnl / pos.amountUsdc) * 100;
						} else {
							// For active positions, fetch current market price
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
						}
					} catch (error) {
						const currentValue = pos.shares * pos.pricePerShare;
						pos.pnl = currentValue - pos.amountUsdc;
						pos.pnlPercentage = (pos.pnl / pos.amountUsdc) * 100;
					}
				})
			);

			positions = initialPositions;
			calculateMetrics();
		} catch (error) {
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
		.filter((p) => p.status === 'Closed' && p.pnl > 0)
		.sort((a, b) => b.pnlPercentage - a.pnlPercentage)
		.slice(0, 5);

	$: worstTrades = [...positions]
		.filter((p) => p.status === 'Closed' && p.pnl < 0)
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
	let earliestEntryStr: string | undefined = undefined;
	let latestEntryStr: string | undefined = undefined;

	let config: any = {
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
		entryTimeConstraints: {
			earliestEntry: undefined,
			latestEntry: undefined
		},
		tradeFrequency: {
			maxTradesPerDay: undefined,
			cooldownHours: undefined
		},
		exitRules: {
			resolveOnExpiry: true,
			stopLoss: undefined,
			takeProfit: undefined,
			maxHoldTime: undefined,
			trailingStop: {
				enabled: false,
				activationPercent: undefined,
				trailPercent: undefined
			},
			partialExits: {
				enabled: false,
				takeProfit1: { percent: undefined, sellPercent: undefined },
				takeProfit2: { percent: undefined, sellPercent: undefined }
			}
		},
		positionSizing: {
			type: 'PERCENTAGE',
			fixedAmount: 100,
			percentageOfBankroll: 5,
			maxExposurePercent: undefined
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
	$: if (earliestEntryStr && config.entryTimeConstraints) {
		config.entryTimeConstraints.earliestEntry = parseDateFromInput(earliestEntryStr);
	}
	$: if (latestEntryStr && config.entryTimeConstraints) {
		config.entryTimeConstraints.latestEntry = parseDateFromInput(latestEntryStr);
	}

	let backtestResult: BacktestResult | null = null;
	// Removed showProMetrics - all metrics are now always visible

	// Save strategy state
	let showSaveModal = false;
	let showAuthModal = false;
	let strategyName = '';
	let savingStrategy = false;
	let saveError = '';
	let currentUser: any = null;
	let isAuthenticating = false;
	let showSuccessNotification = false;

	// Wizard state
	let currentStep = 0;
	const totalSteps = 5; // Markets (with date range & filters), Capital, Entry, Exit, Position Sizing

	// Market browser state
	let marketSelectionPhase: 1 | 2 = 1; // 1 = select market, 2 = select date range within market
	let marketStatus: 'closed' | 'open' = 'closed'; // closed = past, open = active
	let availableMarkets: any[] = [];
	let loadingMarkets = false;
	let marketSearchQuery = '';
	let selectedMarket: any | null = null; // Store the full selected market object

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

	// Event grouping
	let expandedEvents: Set<string> = new Set();
	let eventSortColumn: 'volume' | 'ends' | null = null;
	let eventSortDirection: 'asc' | 'desc' = 'desc';
	let eventsCurrentPage = 0;
	let eventsPerPage = 20;

	interface GroupedEvent {
		eventTitle: string;
		eventSlug: string;
		icon?: string;
		totalVolume: number;
		startDate: number;
		endDate: number;
		tags: string[];
		markets: any[];
	}

	// Sort events
	function sortEvents(column: 'volume' | 'ends') {
		if (eventSortColumn === column) {
			eventSortDirection = eventSortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			eventSortColumn = column;
			eventSortDirection = 'desc';
		}
	}

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

	// Fetch available markets for selection
	async function fetchMarkets() {
		loadingMarkets = true;
		availableMarkets = []; // Clear previous results
		selectedMarketId = null; // Clear selection

		try {
			const response = await fetch('/api/backtest/markets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					fetchMode: 'list', // Just get closed markets list
					status: 'closed',
					tag: selectedTag !== 'All' ? selectedTag : undefined,
					minVolume,
					maxVolume
				})
			});

			if (!response.ok) {
				throw new Error('Failed to fetch markets');
			}

			const data = await response.json();
			availableMarkets = data.markets || [];
		} catch (err: any) {
			availableMarkets = [];
		} finally {
			loadingMarkets = false;
		}
	}

	// Track previous values to detect actual changes
	let prevTag: string = '';
	let hasLoadedMarkets = false;

	// Auto-fetch markets when entering step 0 or tag changes (client-side only)
	$: if (browser && currentStep === 0 && marketSelectionPhase === 1) {
		const tagChanged = prevTag !== selectedTag;

		// Only fetch if tag changed or this is the first load
		if (!hasLoadedMarkets || tagChanged) {
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
				} else if (sortColumn === 'starts') {
					aVal = a.start_time || 0;
					bVal = b.start_time || 0;
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
		selectedMarket = market;
		if (!config.specificMarket) {
			config.specificMarket = {};
		}
		config.specificMarket.conditionId = market.condition_id;
		config.specificMarket.marketSlug = market.market_slug;

		// Set initial date range to market's full lifetime
		const marketStartTime = market.start_time ? new Date(market.start_time * 1000) : null;
		const marketEndTime = market.end_time
			? new Date(market.end_time * 1000)
			: (market.close_time ? new Date(market.close_time * 1000) : null);

		if (marketStartTime && marketEndTime) {
			startDateStr = formatDateForInput(marketStartTime);
			endDateStr = formatDateForInput(marketEndTime);
			config.startDate = marketStartTime;
			config.endDate = marketEndTime;

			// Auto-set entry time constraints to match market date range
			earliestEntryStr = formatDateForInput(marketStartTime);
			latestEntryStr = formatDateForInput(marketEndTime);
			config.entryTimeConstraints.earliestEntry = marketStartTime;
			config.entryTimeConstraints.latestEntry = marketEndTime;
		}

		// Move to phase 2
		marketSelectionPhase = 2;
	}

	// Toggle event expansion
	function toggleEvent(eventSlug: string) {
		expandedEvents = new Set(expandedEvents);
		if (expandedEvents.has(eventSlug)) {
			expandedEvents.delete(eventSlug);
		} else {
			expandedEvents.add(eventSlug);
		}
	}

	// Group markets by event
	$: groupedEvents = (() => {
		const eventMap = new Map<string, GroupedEvent>();

		filteredMarkets.forEach(market => {
			// Determine event identifier (prefer group_item_title, then event_slug, then title)
			const eventTitle = market.group_item_title || market.event_slug || market.title || 'Untitled Event';
			const eventSlug = market.event_slug || market.group_item_title?.toLowerCase().replace(/\s+/g, '-') || market.condition_id;

			if (!eventMap.has(eventSlug)) {
				eventMap.set(eventSlug, {
					eventTitle,
					eventSlug,
					icon: market.icon || market.image,
					totalVolume: 0,
					startDate: market.start_time || 0,
					endDate: market.end_time || market.close_time || 0,
					tags: market.tags || [],
					markets: []
				});
			}

			const event = eventMap.get(eventSlug)!;
			event.markets.push(market);

			// Aggregate volume
			const marketVolume = market.volume_total || market.volume || market.volume_24h || market.total_volume || 0;
			event.totalVolume += marketVolume;

			// Update start date (earliest)
			if (market.start_time && (event.startDate === 0 || market.start_time < event.startDate)) {
				event.startDate = market.start_time;
			}

			// Update end date (latest)
			const endTime = market.end_time || market.close_time || 0;
			if (endTime && endTime > event.endDate) {
				event.endDate = endTime;
			}

			// Merge tags (unique)
			if (market.tags) {
				market.tags.forEach((tag: string) => {
					if (!event.tags.includes(tag)) {
						event.tags.push(tag);
					}
				});
			}
		});

		// Get events array
		let events = Array.from(eventMap.values());

		// Apply sorting
		if (eventSortColumn === 'volume') {
			events.sort((a, b) => {
				return eventSortDirection === 'asc'
					? a.totalVolume - b.totalVolume
					: b.totalVolume - a.totalVolume;
			});
		} else if (eventSortColumn === 'ends') {
			events.sort((a, b) => {
				return eventSortDirection === 'asc'
					? a.endDate - b.endDate
					: b.endDate - a.endDate;
			});
		} else {
			// Default: sort by total volume (descending)
			events.sort((a, b) => b.totalVolume - a.totalVolume);
		}

		return events;
	})();

	// Paginated events
	$: eventsTotalPages = Math.ceil(groupedEvents.length / eventsPerPage);
	$: paginatedEvents = groupedEvents.slice(
		eventsCurrentPage * eventsPerPage,
		(eventsCurrentPage + 1) * eventsPerPage
	);

	// Reset to first page when filters change
	$: if (marketSearchQuery || selectedTag || eventSortColumn) {
		eventsCurrentPage = 0;
	}

	// Clear market selection
	function clearMarketSelection() {
		selectedMarketId = null;
		selectedMarket = null;
		marketSelectionPhase = 1;
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
	let sortColumn: 'volume' | 'starts' | 'ends' | null = null;
	let sortDirection: 'asc' | 'desc' = 'desc';

	function sortMarkets(column: 'volume' | 'starts' | 'ends') {
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

		} catch (err: any) {
			error = err.message || 'An error occurred';
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

	function formatDate(date: Date | string): string {
		return new Date(date).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	// Check if user is authenticated (either session or wallet)
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

	// Check if user can save (has session OR wallet connected)
	function canSave(): boolean {
		return currentUser !== null || $walletStore.connected;
	}

	// Authenticate with wallet
	async function authenticateWallet() {
		isAuthenticating = true;
		saveError = '';

		try {
			const wallet = $walletStore;

			if (!wallet.adapter || !wallet.publicKey) {
				throw new Error('Wallet not connected');
			}

			// Check if adapter supports signing
			if (typeof wallet.adapter.signMessage !== 'function') {
				throw new Error('Wallet does not support message signing');
			}

			const publicKey = wallet.publicKey.toBase58();

			// Create message to sign
			const message = `Sign this message to authenticate with Polymock.\n\nWallet: ${publicKey}\nTimestamp: ${Date.now()}`;
			const messageBytes = new TextEncoder().encode(message);

			// Request signature from wallet adapter
			const signature = await wallet.adapter.signMessage(messageBytes);

			// Send to backend
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

	// Show save modal or auth modal
	async function showSaveStrategyModal() {
		if (!canSave()) {
			showAuthModal = true;
			saveError = '';
			return;
		}

		// Always re-authenticate with wallet to ensure fresh session
		// This handles cases where the session cookie may have expired
		if ($walletStore.connected) {
			await authenticateWallet();
			return;
		}

		// If user is logged in with Google (has currentUser but no wallet)
		showSaveModal = true;
		strategyName = '';
		saveError = '';
	}

	// Save strategy to database
	async function saveStrategy() {
		if (!strategyName.trim()) {
			saveError = 'Please enter a strategy name';
			return;
		}

		if (!backtestResult || !selectedMarket) {
			saveError = 'Missing backtest data';
			return;
		}

		savingStrategy = true;
		saveError = '';

		try {
			const strategyData = {
				strategyName: strategyName,
				marketId: selectedMarket.condition_id,
				marketQuestion: selectedMarket.question,
				initialCapital: config.initialBankroll,
				startDate: config.startDate?.toISOString() || '',
				endDate: config.endDate?.toISOString() || '',

				// Entry rules
				entryType: config.entryType,
				entryConfig: {
					buyThreshold: config.buyThreshold,
					sellThreshold: config.sellThreshold,
					entryTimeConstraints: config.entryTimeConstraints
				},

				// Position sizing
				positionSizingType: config.positionSizing.type,
				positionSizingValue: config.positionSizing.type === 'PERCENTAGE'
					? config.positionSizing.percentageOfBankroll
					: config.positionSizing.fixedAmount,
				maxPositionSize: config.positionSizing.maxExposurePercent,

				// Exit rules
				stopLoss: config.exitRules.stopLoss,
				takeProfit: config.exitRules.takeProfit,
				timeBasedExit: config.exitRules.maxHoldTime,

				// Backtest results
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
				body: JSON.stringify(strategyData)
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to save strategy');
			}

			// Success - show notification
			showSaveModal = false;
			showSuccessNotification = true;

			// Auto-hide notification and redirect after 3 seconds
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

	// Check auth on mount
	onMount(() => {
		checkAuth();
	});

	$: sortedTrades = backtestResult?.trades
		? [...backtestResult.trades].sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime())
		: [];

	$: topTrades = backtestResult?.trades
		? [...backtestResult.trades].sort((a, b) => b.pnl - a.pnl).slice(0, 5)
		: [];

	$: worstBacktestTrades = backtestResult?.trades
		? [...backtestResult.trades].sort((a, b) => a.pnl - b.pnl).slice(0, 5)
		: [];

	// Enhanced results display variables
	let showAdvancedMetrics = false;
	let tradeSortColumn: 'entry' | 'exit' | 'pnl' | 'percent' | 'duration' | null = null;
	let tradeSortDirection: 'asc' | 'desc' = 'desc';
	let tradeSearchQuery = '';
	let tradeFilterSide: 'ALL' | 'YES' | 'NO' = 'ALL';
	let tradeFilterExitReason: string = 'ALL';

	// Pagination for trades table
	let tradesCurrentPage = 0;
	let tradesPerPage = 50;

	// Filtered and sorted trades for the table
	$: filteredTrades = backtestResult?.trades
		? backtestResult.trades.filter(trade => {
				// Search filter
				if (tradeSearchQuery && !trade.marketName.toLowerCase().includes(tradeSearchQuery.toLowerCase())) {
					return false;
				}
				// Side filter
				if (tradeFilterSide !== 'ALL' && trade.side !== tradeFilterSide) {
					return false;
				}
				// Exit reason filter
				if (tradeFilterExitReason !== 'ALL' && trade.exitReason !== tradeFilterExitReason) {
					return false;
				}
				return true;
		  })
		: [];

	$: sortedAndFilteredTrades = [...filteredTrades].sort((a, b) => {
		if (!tradeSortColumn) return 0;

		let aVal, bVal;
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
	});

	// Paginated trades
	$: paginatedTrades = sortedAndFilteredTrades.slice(
		tradesCurrentPage * tradesPerPage,
		(tradesCurrentPage + 1) * tradesPerPage
	);

	$: totalTradesPages = Math.ceil(sortedAndFilteredTrades.length / tradesPerPage);

	// Reset to page 0 when filters change
	$: if (tradeSearchQuery || tradeFilterSide || tradeFilterExitReason) {
		tradesCurrentPage = 0;
	}

	// P&L distribution data for professional histogram
	$: pnlDistribution = backtestResult?.trades
		? (() => {
				const trades = backtestResult.trades;
				if (trades.length === 0) return { buckets: [], stats: null };

				const pnls = trades.map(t => t.pnlPercentage);
				const minPnl = Math.min(...pnls);
				const maxPnl = Math.max(...pnls);

				// Use smart bucketing: more buckets for larger datasets
				const bucketCount = trades.length < 20 ? 5 : trades.length < 50 ? 8 : trades.length < 100 ? 10 : 15;

				// Round range to nice numbers
				const rawRange = maxPnl - minPnl;
				const bucketSize = rawRange / bucketCount;

				// Create histogram buckets
				const buckets = Array(bucketCount).fill(0).map((_, i) => ({
					min: minPnl + i * bucketSize,
					max: minPnl + (i + 1) * bucketSize,
					count: 0,
					trades: [] as number[]
				}));

				// Distribute trades into buckets
				trades.forEach(trade => {
					const pnl = trade.pnlPercentage;
					const bucketIndex = Math.min(
						Math.floor((pnl - minPnl) / bucketSize),
						bucketCount - 1
					);
					buckets[bucketIndex].count++;
					buckets[bucketIndex].trades.push(pnl);
				});

				// Calculate distribution statistics
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
		: { buckets: [], stats: null };

	// Available exit reasons for filter dropdown
	$: availableExitReasons = backtestResult?.trades
		? ['ALL', ...new Set(backtestResult.trades.map(t => t.exitReason).filter(Boolean))]
		: ['ALL'];

	function sortTradesBy(column: typeof tradeSortColumn) {
		if (tradeSortColumn === column) {
			tradeSortDirection = tradeSortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			tradeSortColumn = column;
			tradeSortDirection = 'desc';
		}
	}

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
	<!-- TRADE SUMMARY TAB -->
	{#if activeMainTab === 'summary'}
		{#if loading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>Loading analytics...</p>
			</div>
		{:else if !walletState.connected}
			<div class="empty-state">
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
						<!-- STEP 1: Market Selection (Two Phases) -->
						{#if currentStep === 0}
							<div class="wizard-step" transition:fade>
								{#if marketSelectionPhase === 1}
									<!-- Phase 1: Select a Closed Market -->
									<div class="step-header">
										<h2>Select a Past Market</h2>
										<p>Choose a closed market to backtest your strategy</p>
									</div>

									<div class="step-body market-selection-body">
										<!-- Search and Filters -->
										<div class="search-filters-section">
											<!-- Search Bar -->
											<div class="search-container">
												<input
													type="text"
													bind:value={marketSearchQuery}
													placeholder="Search markets..."
													class="search-input"
												/>
											</div>

											<!-- Filters Toggle Button -->
											<button class="filters-toggle-btn" on:click={() => showAdvancedFilters = !showAdvancedFilters}>
												<span>Advanced Filters</span>
												<span class="dropdown-arrow">{showAdvancedFilters ? '▼' : '▶'}</span>
											</button>

											<!-- Filters Panel (Below Search) -->
											{#if showAdvancedFilters}
												<div class="filters-panel">
													<!-- Category Filter -->
													<div class="filter-group">
														<label class="filter-group-label">Category</label>
														<select bind:value={selectedTag} class="filter-select">
															{#each availableTags as tag}
																<option value={tag}>
																	{tag === 'All' ? 'All Categories' : tag.charAt(0).toUpperCase() + tag.slice(1)}
																</option>
															{/each}
														</select>
													</div>

													<!-- Volume Filter -->
													<div class="filter-group">
														<label class="filter-group-label">Volume Range</label>
														<div class="volume-inputs-inline">
															<input
																type="number"
																bind:value={minVolume}
																placeholder="Min"
																class="volume-input-small"
																on:change={fetchMarkets}
															/>
															<span class="volume-separator">to</span>
															<input
																type="number"
																bind:value={maxVolume}
																placeholder="Max"
																class="volume-input-small"
																on:change={fetchMarkets}
															/>
														</div>
													</div>
												</div>
											{/if}
										</div>

										<!-- Markets Table -->
										{#if loadingMarkets}
											<div class="loading-state">
												<span class="spinner"></span>
												<p>Loading closed markets...</p>
											</div>
										{:else if availableMarkets.length === 0}
											<div class="empty-state">
												<p>No closed markets found matching your criteria</p>
												<small>Try adjusting your filters</small>
											</div>
										{:else}
											<div class="events-table-container">
												<div class="results-info">
													<span>{groupedEvents.length} events found ({filteredMarkets.length} markets total)</span>
													<span>Page {eventsCurrentPage + 1} of {eventsTotalPages || 1}</span>
												</div>

												<table class="events-table">
													<thead>
														<tr>
															<th class="event-header">Event</th>
															<th class="volume-header sortable-header" on:click={() => sortEvents('volume')}>
																<div class="sort-header-content">
																	<span>Volume</span>
																	<span class="sort-indicator" class:active={eventSortColumn === 'volume'}>
																		{#if eventSortColumn === 'volume'}
																			{eventSortDirection === 'asc' ? '↑' : '↓'}
																		{:else}
																			⇅
																		{/if}
																	</span>
																</div>
															</th>
															<th class="starts-header">Starts</th>
															<th class="ends-header sortable-header" on:click={() => sortEvents('ends')}>
																<div class="sort-header-content">
																	<span>Ends</span>
																	<span class="sort-indicator" class:active={eventSortColumn === 'ends'}>
																		{#if eventSortColumn === 'ends'}
																			{eventSortDirection === 'asc' ? '↑' : '↓'}
																		{:else}
																			⇅
																		{/if}
																	</span>
																</div>
															</th>
															<th class="tags-header">Tags</th>
														</tr>
													</thead>
													<tbody>
														{#each paginatedEvents as event}
															<!-- Event Row -->
															<tr class="event-row" on:click={() => event.markets.length > 1 ? toggleEvent(event.eventSlug) : selectMarket(event.markets[0])}>
																<td class="event-cell">
																	<div class="event-content">
																		{#if event.markets.length > 1}
																			<button class="expand-icon" class:expanded={expandedEvents.has(event.eventSlug)}>
																				{expandedEvents.has(event.eventSlug) ? '▼' : '▶'}
																			</button>
																		{/if}
																		{#if event.icon}
																			<img src={event.icon} alt={event.eventTitle} class="event-icon" />
																		{/if}
																		<div class="event-info">
																			<div class="event-title">{event.eventTitle}</div>
																			{#if event.markets.length > 1}
																				<div class="event-markets-count">({event.markets.length} markets)</div>
																			{/if}
																		</div>
																	</div>
																</td>
																<td class="volume-cell">
																	${(event.totalVolume / 1000000).toFixed(1)}M
																</td>
																<td class="starts-cell">
																	{#if event.startDate}
																		{formatMarketDate(event.startDate)}
																	{:else}
																		N/A
																	{/if}
																</td>
																<td class="ends-cell">
																	{#if event.endDate}
																		{formatMarketDate(event.endDate)}
																	{:else}
																		N/A
																	{/if}
																</td>
																<td class="tags-cell">
																	<div class="tags-container">
																		{#if event.tags && event.tags.length > 0}
																			{#each event.tags.slice(0, 2) as tag}
																				<span class="tag-badge">{tag}</span>
																			{/each}
																			{#if event.tags.length > 2}
																				<span class="tag-more">+{event.tags.length - 2}</span>
																			{/if}
																		{:else}
																			<span class="tag-badge">Other</span>
																		{/if}
																	</div>
																</td>
															</tr>

															<!-- Expanded Markets (Nested Table) -->
															{#if expandedEvents.has(event.eventSlug) && event.markets.length > 1}
																<tr class="markets-expanded-row">
																	<td colspan="5" class="markets-expanded-cell">
																		<div class="nested-markets-container">
																			<table class="nested-markets-table">
																				<thead>
																					<tr>
																						<th>Question</th>
																						<th>Volume</th>
																						<th>Ends</th>
																					</tr>
																				</thead>
																				<tbody>
																					{#each event.markets as market}
																						{@const marketVolume = market.volume_total || market.volume || market.volume_24h || market.total_volume || 0}
																						<tr class:selected={selectedMarketId === market.condition_id} on:click|stopPropagation={() => selectMarket(market)}>
																							<td class="market-question-cell">
																								{market.title || market.question || 'Untitled'}
																							</td>
																							<td class="market-volume-cell">
																								{#if marketVolume > 0}
																									${(marketVolume / 1000000).toFixed(1)}M
																								{:else}
																									$0.0M
																								{/if}
																							</td>
																							<td class="market-ends-cell">
																								{#if market.end_time || market.close_time}
																									{formatMarketDate(market.end_time || market.close_time)}
																								{:else}
																									N/A
																								{/if}
																							</td>
																						</tr>
																					{/each}
																				</tbody>
																			</table>
																		</div>
																	</td>
																</tr>
															{/if}
														{/each}
													</tbody>
												</table>

												<!-- Pagination Controls -->
												<div class="pagination-controls">
													<div class="pagination-buttons">
														<button
															class="pagination-btn"
															on:click={() => eventsCurrentPage = 0}
															disabled={eventsCurrentPage === 0}
														>
															First
														</button>
														<button
															class="pagination-btn"
															on:click={() => eventsCurrentPage--}
															disabled={eventsCurrentPage === 0}
														>
															Previous
														</button>
														<span class="page-info">
															Page {eventsCurrentPage + 1} of {eventsTotalPages || 1}
														</span>
														<button
															class="pagination-btn"
															on:click={() => eventsCurrentPage++}
															disabled={eventsCurrentPage >= eventsTotalPages - 1}
														>
															Next
														</button>
														<button
															class="pagination-btn"
															on:click={() => eventsCurrentPage = eventsTotalPages - 1}
															disabled={eventsCurrentPage >= eventsTotalPages - 1}
														>
															Last
														</button>
													</div>
												</div>
											</div>
										{/if}
									</div>

								{:else}
									<!-- Phase 2: Select Date Range within Market -->
									<div class="step-header">
										<h2>Select Date Range</h2>
										<p>Choose the timeframe for backtesting within this market</p>
									</div>

									<div class="step-body">
										<!-- Selected Market Display -->
										{#if selectedMarket}
											{@const selectedVolume = selectedMarket.volume_total || selectedMarket.volume || selectedMarket.volume_24h || selectedMarket.total_volume || 0}
											{@const marketStartTime = selectedMarket.start_time ? new Date(selectedMarket.start_time * 1000) : null}
											{@const marketEndTime = selectedMarket.end_time ? new Date(selectedMarket.end_time * 1000) : (selectedMarket.close_time ? new Date(selectedMarket.close_time * 1000) : null)}

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

											<!-- Market Timeline -->
											<div class="market-timeline">
												<h3>Market Timeline</h3>
												<div class="timeline-info">
													<div class="timeline-item">
														<span class="timeline-label">Created:</span>
														<span class="timeline-value">
															{#if marketStartTime}
																{marketStartTime.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
																at {marketStartTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
															{:else}
																N/A
															{/if}
														</span>
													</div>
													<div class="timeline-item">
														<span class="timeline-label">Finished:</span>
														<span class="timeline-value">
															{#if marketEndTime}
																{marketEndTime.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
																at {marketEndTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
															{:else}
																N/A
															{/if}
														</span>
													</div>
													<div class="timeline-item">
														<span class="timeline-label">Duration:</span>
														<span class="timeline-value">
															{#if marketStartTime && marketEndTime}
																{Math.floor((marketEndTime.getTime() - marketStartTime.getTime()) / (1000 * 60 * 60 * 24))} days
															{:else}
																N/A
															{/if}
														</span>
													</div>
												</div>
											</div>

											<!-- Date Range Selector -->
											<div class="date-range-selector">
												<h3>Select Backtest Date Range</h3>
												<p class="date-range-description">
													Choose a date range within the market's lifetime to backtest your strategy
												</p>
												<div class="filters-grid">
													<div class="filter-item">
														<label>Start Date</label>
														<input
															type="date"
															bind:value={startDateStr}
															min={marketStartTime ? formatDateForInput(marketStartTime) : ''}
															max={endDateStr}
															class="filter-input-uniform"
														/>
													</div>

													<div class="filter-item">
														<label>End Date</label>
														<input
															type="date"
															bind:value={endDateStr}
															min={startDateStr}
															max={marketEndTime ? formatDateForInput(marketEndTime) : ''}
															class="filter-input-uniform"
														/>
													</div>

													<div class="filter-item">
														<label>Backtest Duration</label>
														<div class="duration-display">
															{#if config.startDate && config.endDate}
																{Math.floor((config.endDate.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24))} days
															{:else}
																-
															{/if}
														</div>
													</div>
												</div>
											</div>
										{/if}
									</div>
								{/if}
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

									<!-- Position Sizing -->
									<div class="form-section" style="margin-top: 2rem;">
										<label>Position Sizing</label>
										<div class="position-sizing-controls">
											<div class="sizing-type-buttons">
												<button
													class="sizing-btn"
													class:active={config.positionSizing.type === 'FIXED'}
													on:click={() => config.positionSizing.type = 'FIXED'}
												>
													Fixed Amount
												</button>
												<button
													class="sizing-btn"
													class:active={config.positionSizing.type === 'PERCENTAGE'}
													on:click={() => config.positionSizing.type = 'PERCENTAGE'}
												>
													Percentage
												</button>
											</div>

											{#if config.positionSizing.type === 'FIXED'}
												<div class="sizing-input-group">
													<label>Amount per Trade (USDC)</label>
													<input
														type="number"
														bind:value={config.positionSizing.fixedAmount}
														min="10"
														step="10"
														placeholder="100"
														class="sizing-input"
													/>
												</div>
											{:else}
												<div class="sizing-input-group">
													<label>Percentage of Bankroll per Trade (%)</label>
													<input
														type="number"
														bind:value={config.positionSizing.percentageOfBankroll}
														min="1"
														max="100"
														step="1"
														placeholder="5"
														class="sizing-input"
													/>
												</div>
											{/if}

											<div class="sizing-input-group">
												<label>Max Total Exposure</label>
												<input
													type="number"
													bind:value={config.positionSizing.maxExposurePercent}
													min="1"
													max="100"
													step="5"
													placeholder="50"
													class="sizing-input"
												/>
												<p class="help-text-sm">Maximum % of bankroll in open positions simultaneously</p>
											</div>
										</div>
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

									<!-- Time Constraints -->
									<div class="form-section">
										<label>Entry Time Window</label>
										<div class="date-range-group">
											<div class="date-input-wrapper">
												<span class="date-label">Earliest Entry</span>
												<input
													type="date"
													bind:value={earliestEntryStr}
													class="date-input"
													placeholder="Backtest start date"
												/>
											</div>
											<div class="date-input-wrapper">
												<span class="date-label">Latest Entry</span>
												<input
													type="date"
													bind:value={latestEntryStr}
													class="date-input"
													placeholder="Backtest end date"
												/>
											</div>
										</div>
										<p class="help-text">Optional: Restrict when trades can be entered</p>
									</div>

									<!-- Trade Frequency Controls -->
									<div class="form-section">
										<label>Trade Frequency Limit</label>
										<div class="frequency-controls">
											<div class="frequency-input-group">
												<span class="input-label">Max Trades Per Day</span>
												<input
													type="number"
													bind:value={config.tradeFrequency.maxTradesPerDay}
													min="1"
													step="1"
													placeholder="Unlimited"
													class="frequency-input"
												/>
											</div>
										</div>
										<p class="help-text">Optional: Limit daily trade frequency to prevent overtrading</p>
									</div>
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
											placeholder="20"
											class="exit-input"
										/>
										<p class="help-text-sm">Exit when position loses this % (leave empty for none)</p>
									</div>

									<div class="form-section">
										<label>Take Profit (%)</label>
										<input
											type="number"
											bind:value={config.exitRules.takeProfit}
											min="0"
											max="500"
											step="1"
											placeholder="50"
											class="exit-input"
										/>
										<p class="help-text-sm">Exit when position gains this % (leave empty for none)</p>
									</div>

									<div class="form-section">
										<label>Max Hold Time (hours)</label>
										<input
											type="number"
											bind:value={config.exitRules.maxHoldTime}
											min="1"
											step="1"
											placeholder="168"
											class="exit-input"
										/>
										<p class="help-text-sm">Auto-exit after this duration (leave empty for none)</p>
									</div>
			
									<!-- Optional Features Toggle Section -->
									<div class="form-section">
										<label class="section-label">Optional Exit Features</label>
										<div class="optional-features">
											<button
												type="button"
												class="toggle-feature-btn"
												class:active={config.exitRules.resolveOnExpiry}
												on:click={() => config.exitRules.resolveOnExpiry = !config.exitRules.resolveOnExpiry}
											>
												<span class="toggle-icon">{config.exitRules.resolveOnExpiry ? '✓' : '+'}</span>
												<span class="toggle-text">Close at Resolution</span>
											</button>

											<button
												type="button"
												class="toggle-feature-btn"
												class:active={config.exitRules.trailingStop.enabled}
												on:click={() => config.exitRules.trailingStop.enabled = !config.exitRules.trailingStop.enabled}
											>
												<span class="toggle-icon">{config.exitRules.trailingStop.enabled ? '✓' : '+'}</span>
												<span class="toggle-text">Trailing Stop Loss</span>
											</button>

											<button
												type="button"
												class="toggle-feature-btn"
												class:active={config.exitRules.partialExits.enabled}
												on:click={() => config.exitRules.partialExits.enabled = !config.exitRules.partialExits.enabled}
											>
												<span class="toggle-icon">{config.exitRules.partialExits.enabled ? '✓' : '+'}</span>
												<span class="toggle-text">Partial Exits</span>
											</button>
										</div>
									</div>

									<!-- Trailing Stop Loss Config -->
									{#if config.exitRules.trailingStop.enabled}
										<div class="form-section feature-config">
											<h4 class="feature-config-title">Trailing Stop Loss Settings</h4>
											<div class="trailing-stop-config">
												<div class="trailing-input-group">
													<span class="input-label">Activation at Profit (%)</span>
													<input
														type="number"
														bind:value={config.exitRules.trailingStop.activationPercent}
														min="0"
														max="500"
														step="5"
														placeholder="20"
														class="trailing-input"
													/>
													<p class="help-text-sm">Activate trailing stop after reaching this % profit</p>
												</div>
												<div class="trailing-input-group">
													<span class="input-label">Trail by (%)</span>
													<input
														type="number"
														bind:value={config.exitRules.trailingStop.trailPercent}
														min="1"
														max="100"
														step="1"
														placeholder="10"
														class="trailing-input"
													/>
													<p class="help-text-sm">Exit if profit drops by this % from peak</p>
												</div>
											</div>
										</div>
									{/if}

									<!-- Partial Exits Config -->
									{#if config.exitRules.partialExits.enabled}
										<div class="form-section feature-config">
											<h4 class="feature-config-title">Partial Exits Settings</h4>
											<div class="partial-exits-config">
												<div class="partial-exit-row">
													<span class="partial-label">First Exit:</span>
													<div class="partial-inputs">
														<div class="partial-input-wrapper">
															<input
																type="number"
																bind:value={config.exitRules.partialExits.takeProfit1.percent}
																min="1"
																max="500"
																step="1"
																placeholder="Profit %"
																class="partial-input"
															/>
															<span class="unit-label">% profit</span>
														</div>
														<span class="arrow">→</span>
														<div class="partial-input-wrapper">
															<input
																type="number"
																bind:value={config.exitRules.partialExits.takeProfit1.sellPercent}
																min="1"
																max="100"
																step="5"
																placeholder="Sell %"
																class="partial-input"
															/>
															<span class="unit-label">% of position</span>
														</div>
													</div>
												</div>
												<div class="partial-exit-row">
													<span class="partial-label">Second Exit:</span>
													<div class="partial-inputs">
														<div class="partial-input-wrapper">
															<input
																type="number"
																bind:value={config.exitRules.partialExits.takeProfit2.percent}
																min="1"
																max="500"
																step="1"
																placeholder="Profit %"
																class="partial-input"
															/>
															<span class="unit-label">% profit</span>
														</div>
														<span class="arrow">→</span>
														<div class="partial-input-wrapper">
															<input
																type="number"
																bind:value={config.exitRules.partialExits.takeProfit2.sellPercent}
																min="1"
																max="100"
																step="5"
																placeholder="Sell %"
																class="partial-input"
															/>
															<span class="unit-label">% of remaining</span>
														</div>
													</div>
												</div>
												<p class="help-text">Take profits at multiple levels (e.g., sell 50% at +30%, then 50% at +60%)</p>
											</div>
										</div>
									{/if}
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
			<!-- ============= COMPREHENSIVE RESULTS DISPLAY ============= -->
			<div class="results-panel">

				<!-- Export Buttons -->
				<div class="export-actions">
					<button class="btn-save" on:click={showSaveStrategyModal}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
							<polyline points="17 21 17 13 7 13 7 21"/>
							<polyline points="7 3 7 8 15 8"/>
						</svg>
						Save Strategy
					</button>
					<button class="btn-export" on:click={exportToCSV}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
						</svg>
						Export CSV
					</button>
					<button class="btn-export" on:click={exportMetricsJSON}>
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
							<div class="capital-arrow">→</div>
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
						<h3>⚠️ No Trades Executed</h3>
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
										<th class="sortable" on:click={() => sortTradesBy('entry')}>
											Entry
											{#if tradeSortColumn === 'entry'}
												<span class="sort-indicator">{tradeSortDirection === 'asc' ? '↑' : '↓'}</span>
											{/if}
										</th>
										<th class="sortable" on:click={() => sortTradesBy('exit')}>
											Exit
											{#if tradeSortColumn === 'exit'}
												<span class="sort-indicator">{tradeSortDirection === 'asc' ? '↑' : '↓'}</span>
											{/if}
										</th>
										<th>Entry Price</th>
										<th>Exit Price</th>
										<th>Amount</th>
										<th>Shares</th>
										<th class="sortable" on:click={() => sortTradesBy('pnl')}>
											P&L ($)
											{#if tradeSortColumn === 'pnl'}
												<span class="sort-indicator">{tradeSortDirection === 'asc' ? '↑' : '↓'}</span>
											{/if}
										</th>
										<th class="sortable" on:click={() => sortTradesBy('percent')}>
											P&L (%)
											{#if tradeSortColumn === 'percent'}
												<span class="sort-indicator">{tradeSortDirection === 'asc' ? '↑' : '↓'}</span>
											{/if}
										</th>
										<th>Exit Reason</th>
										<th class="sortable" on:click={() => sortTradesBy('duration')}>
											Duration
											{#if tradeSortColumn === 'duration'}
												<span class="sort-indicator">{tradeSortDirection === 'asc' ? '↑' : '↓'}</span>
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
									on:click={() => tradesCurrentPage = Math.max(0, tradesCurrentPage - 1)}
									disabled={tradesCurrentPage === 0}
								>
									← Previous
								</button>
								<span class="pagination-info">
									Page {tradesCurrentPage + 1} of {totalTradesPages}
									(Showing {paginatedTrades.length} of {sortedAndFilteredTrades.length} trades)
								</span>
								<button
									class="pagination-btn"
									on:click={() => tradesCurrentPage = Math.min(totalTradesPages - 1, tradesCurrentPage + 1)}
									disabled={tradesCurrentPage >= totalTradesPages - 1}
								>
									Next →
								</button>
							</div>
						{/if}
					</div>

				{/if}
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
			<button on:click={() => showSuccessNotification = false} class="close-notification">
				<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
					<path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/>
				</svg>
			</button>
		</div>
	</div>
{/if}

<!-- Authentication Required Modal -->
{#if showAuthModal}
	<div class="modal-overlay" on:click={() => (showAuthModal = false)}>
		<div class="modal-content auth-modal" on:click={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>Authentication Required</h2>
				<button class="modal-close" on:click={() => (showAuthModal = false)}>
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
						<button class="auth-option" on:click={authenticateWallet} disabled={isAuthenticating}>
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
	<div class="modal-overlay" on:click={() => (showSaveModal = false)}>
		<div class="modal-content" on:click={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>Save Strategy</h2>
				<button class="modal-close" on:click={() => (showSaveModal = false)}>
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
						on:click={() => (showSaveModal = false)}
						disabled={savingStrategy}
					>
						Cancel
					</button>
					<button
						class="btn-save-confirm"
						on:click={saveStrategy}
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
	.backtesting-container {
		min-height: 100vh;
		background: #0a0e1a;
		color: white;
		padding: 40px 20px;
		max-width: 1600px;
		margin: 0 auto;
	}

	/* Strategy Backtesting - Full Width */
	.strategy-backtesting {
		width: 100%;
		max-width: 100%;
		margin: 0 -20px;
		padding: 0 20px;
	}

	:global(.light-mode) .backtesting-container {
		background: #FFFFFF;
		color: #1A1A1A;
	}

	:global(.light-mode) .page-header h1 {
		color: #1A1A1A;
	}

	:global(.light-mode) .subtitle {
		color: #666;
	}

	:global(.light-mode) .section {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .section h2 {
		color: #1A1A1A;
	}

	:global(.light-mode) .metrics-grid,
	:global(.light-mode) .metric-card {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .metric-label {
		color: #666;
	}

	:global(.light-mode) .metric-value {
		color: #1A1A1A;
	}

	:global(.light-mode) .metric-value.positive {
		color: #00B570;
	}

	:global(.light-mode) .metric-value.negative {
		color: #FF6B6B;
	}

	:global(.light-mode) .metric-sublabel {
		color: #999;
	}

	:global(.light-mode) .metric-progress {
		background: #E0E0E0;
	}

	:global(.light-mode) .progress-bar {
		background: linear-gradient(90deg, #00B570 0%, #00D68F 100%);
	}

	:global(.light-mode) .chart-container {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .trade-history {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .trade-list {
		background: #FFFFFF;
	}

	:global(.light-mode) .trade-item {
		border-color: #E0E0E0;
	}

	:global(.light-mode) .trade-item:hover {
		background: #FAFAFA;
	}

	:global(.light-mode) .trade-market {
		color: #1A1A1A;
	}

	:global(.light-mode) .trade-side {
		background: rgba(0, 181, 112, 0.1);
		color: #00B570;
	}

	:global(.light-mode) .trade-side.no {
		background: rgba(255, 107, 107, 0.1);
		color: #FF6B6B;
	}

	:global(.light-mode) .trade-details {
		color: #666;
	}

	:global(.light-mode) .trade-detail-label {
		color: #999;
	}

	:global(.light-mode) .trade-detail-value {
		color: #1A1A1A;
	}

	:global(.light-mode) .trade-pnl {
		color: #1A1A1A;
	}

	:global(.light-mode) .trade-pnl.positive {
		color: #00B570;
	}

	:global(.light-mode) .trade-pnl.negative {
		color: #FF6B6B;
	}

	:global(.light-mode) .empty-state {
		color: #999;
	}

	:global(.light-mode) .empty-icon {
		background: #F5F5F5;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .loading-state {
		color: #666;
	}

	:global(.light-mode) .spinner {
		border-color: #E0E0E0;
		border-top-color: #00B570;
	}

	:global(.light-mode) .trades-comparison {
		background: transparent;
	}

	:global(.light-mode) .trades-panel {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .trades-panel h2 {
		color: #1A1A1A;
		border-bottom-color: #E0E0E0;
	}

	:global(.light-mode) .trades-list {
		background: #FFFFFF;
	}

	:global(.light-mode) .trade-info {
		color: #1A1A1A;
	}

	:global(.light-mode) .trade-type {
		background: rgba(0, 181, 112, 0.1);
		color: #00B570;
	}

	:global(.light-mode) .trade-type.no {
		background: rgba(255, 107, 107, 0.1);
		color: #FF6B6B;
	}

	:global(.light-mode) .trade-result {
		color: #1A1A1A;
	}

	:global(.light-mode) .trade-result.positive {
		color: #00B570;
	}

	:global(.light-mode) .trade-result.negative {
		color: #FF6B6B;
	}

	:global(.light-mode) .no-trades {
		color: #999;
	}

	:global(.light-mode) .insights-grid {
		background: transparent;
	}

	:global(.light-mode) .insight-card {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .insight-card p {
		color: #333;
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

	/* Removed .metric-card.pro styling - all metrics use default style */

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
		background: #3b82f6;
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

	/* Removed pro-section, pro-header, and btn-unlock styles - no longer needed */

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

	.warning-box .debug-section {
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		padding: 1rem;
		margin: 1rem 0;
	}

	.warning-box .debug-section h4 {
		color: #60a5fa;
		margin: 0 0 0.75rem 0;
		font-size: 0.95rem;
	}

	.warning-box .debug-section ul {
		margin: 0 0 0 1.25rem;
		font-family: 'Courier New', monospace;
		font-size: 0.9rem;
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
	max-width: 100%;
	margin: 0;
	width: 100%;
	box-sizing: border-box;
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
	background: #3b82f6;
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

/* Override for market selection - full width */
.market-selection-body {
	max-width: 100% !important;
	margin: 0 !important;
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

/* Events Table */
.events-table-container {
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

.events-table {
	width: 100%;
	border-collapse: collapse;
	background: transparent;
	border-radius: 8px;
	overflow: hidden;
}

.events-table thead {
	background: rgba(20, 24, 36, 0.5);
}

.events-table th {
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
	gap: 8px;
}

.sort-indicator {
	display: flex;
	align-items: center;
	justify-content: center;
	color: #64748b;
	transition: all 0.2s;
	font-size: 12px;
	font-weight: 600;
}

.sort-indicator.active {
	color: #3b82f6;
}

/* Event Row Styling */
.event-row {
	border-bottom: 1px solid #2a2f45;
	transition: background 0.2s;
	cursor: pointer;
	background: rgba(20, 24, 36, 0.3);
}

.event-row:hover {
	background: rgba(59, 130, 246, 0.08);
}

.event-row td {
	padding: 16px;
	font-size: 14px;
	color: white;
	vertical-align: middle;
}

.event-cell {
	max-width: 500px;
}

.event-content {
	display: flex;
	align-items: center;
	gap: 12px;
}

.expand-icon {
	background: none;
	border: none;
	color: #3b82f6;
	font-size: 14px;
	cursor: pointer;
	padding: 4px 8px;
	border-radius: 4px;
	transition: all 0.2s;
	display: flex;
	align-items: center;
	justify-content: center;
	min-width: 24px;
}

.expand-icon:hover {
	background: rgba(59, 130, 246, 0.1);
}

.expand-icon.expanded {
	color: #10b981;
}

.event-icon {
	width: 36px;
	height: 36px;
	border-radius: 50%;
	object-fit: cover;
	border: 2px solid #2a2f45;
}

.event-info {
	flex: 1;
	min-width: 0;
}

.event-title {
	font-weight: 600;
	line-height: 1.4;
	color: #e8e8e8;
	font-size: 15px;
}

.event-markets-count {
	font-size: 12px;
	color: #64748b;
	margin-top: 2px;
}

.volume-cell {
	font-weight: 600;
	color: #10b981;
	font-size: 14px;
}

.starts-cell {
	color: #8b92ab;
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

/* Nested Markets Table (Expanded Events) */
.markets-expanded-row {
	background: rgba(10, 14, 27, 0.5);
	border-bottom: 1px solid #2a2f45;
}

.markets-expanded-cell {
	padding: 0 !important;
}

.nested-markets-container {
	padding: 16px 16px 16px 56px; /* Extra left padding for indentation */
	background: rgba(20, 24, 36, 0.3);
}

.nested-markets-table {
	width: 100%;
	border-collapse: collapse;
	background: rgba(30, 37, 55, 0.5);
	border-radius: 6px;
	overflow: hidden;
}

.nested-markets-table thead {
	background: rgba(20, 24, 36, 0.8);
}

.nested-markets-table th {
	padding: 12px 16px;
	text-align: left;
	font-size: 11px;
	font-weight: 600;
	color: #64748b;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	border-bottom: 1px solid #2a2f45;
}

.nested-markets-table tbody tr {
	border-bottom: 1px solid rgba(42, 47, 69, 0.5);
	transition: background 0.2s;
	cursor: pointer;
}

.nested-markets-table tbody tr:last-child {
	border-bottom: none;
}

.nested-markets-table tbody tr:hover {
	background: rgba(59, 130, 246, 0.08);
}

.nested-markets-table tbody tr.selected {
	background: rgba(59, 130, 246, 0.15);
	border-left: 3px solid #3b82f6;
}

.nested-markets-table td {
	padding: 12px 16px;
	font-size: 13px;
	color: #e8e8e8;
	vertical-align: middle;
}

.market-question-cell {
	max-width: 400px;
	font-weight: 400;
	color: #d1d5db;
}

.market-volume-cell {
	font-weight: 500;
	color: #10b981;
	font-size: 13px;
	min-width: 100px;
}

.market-ends-cell {
	color: #8b92ab;
	font-size: 13px;
	min-width: 120px;
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

/* Optional Feature Toggle Buttons */
.section-label {
	display: block;
	font-size: 14px;
	font-weight: 600;
	color: #8b92ab;
	margin-bottom: 12px;
}

.optional-features {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
	gap: 12px;
}

.toggle-feature-btn {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 14px 16px;
	background: #1e2537;
	border: 2px solid #2a2f45;
	border-radius: 8px;
	color: #8b92ab;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s;
	font-size: 14px;
}

.toggle-feature-btn:hover {
	background: #252d42;
	border-color: #3b82f6;
}

.toggle-feature-btn.active {
	background: #1e3a5f;
	border-color: #3b82f6;
	color: white;
}

.toggle-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 20px;
	height: 20px;
	border-radius: 4px;
	background: #2a2f45;
	font-size: 14px;
	transition: all 0.2s;
}

.toggle-feature-btn.active .toggle-icon {
	background: #3b82f6;
	color: white;
}

.toggle-text {
	flex: 1;
}

/* Feature Configuration Sections */
.feature-config {
	margin-top: 16px;
	padding: 20px;
	background: #141824;
	border: 1px solid #2a2f45;
	border-radius: 8px;
}

.feature-config-title {
	font-size: 15px;
	font-weight: 600;
	color: white;
	margin-bottom: 16px;
}

/* New V1 Features Styles */
.date-range-group {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 16px;
}

.date-input-wrapper {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.date-label {
	font-size: 14px;
	color: #9ca3af;
	font-weight: 500;
}

.date-input {
	width: 100%;
	padding: 12px 16px;
	background: #1e2537;
	border: 1px solid #2d3548;
	border-radius: 8px;
	color: white;
	font-size: 15px;
}

.date-input:focus {
	outline: none;
	border-color: #3b82f6;
}

.help-text {
	font-size: 13px;
	color: #8b92ab;
	margin-top: 8px;
}

.help-text-sm {
	font-size: 12px;
	color: #8b92ab;
	margin-top: 4px;
}

.frequency-controls {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 16px;
}

.frequency-input-group {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.input-label {
	font-size: 14px;
	color: #9ca3af;
	font-weight: 500;
}

.frequency-input {
	width: 100%;
	padding: 12px 16px;
	background: #1e2537;
	border: 1px solid #2d3548;
	border-radius: 8px;
	color: white;
	font-size: 15px;
}

.frequency-input:focus {
	outline: none;
	border-color: #3b82f6;
}

.trailing-stop-config {
	display: flex;
	flex-direction: column;
	gap: 16px;
	margin-top: 16px;
	padding: 16px;
	background: #141824;
	border-radius: 8px;
}

.trailing-input-group {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.trailing-input {
	width: 100%;
	padding: 12px 16px;
	background: #1e2537;
	border: 1px solid #2d3548;
	border-radius: 8px;
	color: white;
	font-size: 15px;
}

.trailing-input:focus {
	outline: none;
	border-color: #3b82f6;
}

.partial-exits-config {
	margin-top: 16px;
	padding: 16px;
	background: #141824;
	border-radius: 8px;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.partial-exit-row {
	display: flex;
	align-items: center;
	gap: 16px;
}

.partial-label {
	min-width: 90px;
	font-size: 14px;
	color: #9ca3af;
	font-weight: 500;
}

.partial-inputs {
	display: flex;
	align-items: center;
	gap: 12px;
	flex: 1;
}

.partial-input-wrapper {
	display: flex;
	align-items: center;
	gap: 8px;
	flex: 1;
}

.partial-input {
	flex: 1;
	padding: 10px 12px;
	background: #1e2537;
	border: 1px solid #2d3548;
	border-radius: 6px;
	color: white;
	font-size: 14px;
}

.partial-input:focus {
	outline: none;
	border-color: #3b82f6;
}

.unit-label {
	font-size: 13px;
	color: #6b7280;
	white-space: nowrap;
}

.arrow {
	font-size: 18px;
	color: #6b7280;
}

.position-sizing-controls {
	display: flex;
	flex-direction: column;
	gap: 20px;
}

.sizing-type-buttons {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 12px;
}

.sizing-btn {
	padding: 12px 24px;
	background: #1e2537;
	border: 2px solid #2d3548;
	border-radius: 8px;
	color: #9ca3af;
	cursor: pointer;
	transition: all 0.2s;
	font-weight: 500;
}

.sizing-btn:hover {
	border-color: #3b82f6;
	color: white;
}

.sizing-btn.active {
	background: #3b82f6;
	border-color: #3b82f6;
	color: white;
}

.sizing-input-group {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.sizing-input {
	width: 100%;
	padding: 12px 16px;
	background: #1e2537;
	border: 1px solid #2d3548;
	border-radius: 8px;
	color: white;
	font-size: 15px;
}

.sizing-input:focus {
	outline: none;
	border-color: #3b82f6;
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

/* Market Timeline Styles */
.market-timeline {
	background: #1a1f2e;
	border: 1px solid #2d3748;
	border-radius: 8px;
	padding: 24px;
	margin: 24px 0;
}

.market-timeline h3 {
	font-size: 18px;
	font-weight: 600;
	color: #e2e8f0;
	margin: 0 0 16px 0;
}

.timeline-info {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.timeline-item {
	display: flex;
	align-items: center;
	padding: 12px;
	background: #0f1419;
	border-radius: 6px;
	border: 1px solid #2d3748;
}

.timeline-label {
	font-weight: 600;
	color: #94a3b8;
	min-width: 100px;
	font-size: 14px;
}

.timeline-value {
	color: #e2e8f0;
	font-size: 14px;
	flex: 1;
}

/* Date Range Selector Styles */
.date-range-selector {
	background: #1a1f2e;
	border: 1px solid #2d3748;
	border-radius: 8px;
	padding: 24px;
	margin: 24px 0;
}

.date-range-selector h3 {
	font-size: 18px;
	font-weight: 600;
	color: #e2e8f0;
	margin: 0 0 8px 0;
}

.date-range-description {
	font-size: 14px;
	color: #94a3b8;
	margin: 0 0 20px 0;
}

/* Search and Filters Section */
.search-filters-section {
	margin-bottom: 24px;
}

.search-container {
	margin-bottom: 16px;
}

.search-input {
	width: 100%;
	padding: 14px 20px;
	background: #1a1f2e;
	border: 2px solid #2d3748;
	border-radius: 12px;
	color: #e2e8f0;
	font-size: 16px;
	transition: all 0.2s ease;
	box-sizing: border-box;
}

.search-input:focus {
	outline: none;
	border-color: #3b82f6;
	background: #0f1419;
}

.search-input::placeholder {
	color: #64748b;
}

/* Filters Toggle Button */
.filters-toggle-btn {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 20px;
	background: #1a1f2e;
	border: 2px solid #2d3748;
	border-radius: 12px;
	color: #e2e8f0;
	font-size: 14px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.2s ease;
	margin-bottom: 16px;
	box-sizing: border-box;
}

.filters-toggle-btn:hover {
	border-color: #3b82f6;
	background: #0f1419;
}

.dropdown-arrow {
	color: #64748b;
	font-size: 12px;
}

/* Filters Panel (Below) */
.filters-panel {
	background: #1a1f2e;
	border: 2px solid #2d3748;
	border-radius: 12px;
	padding: 20px;
	margin-bottom: 16px;
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
	gap: 20px;
	box-sizing: border-box;
}

.filter-group {
	display: flex;
	flex-direction: column;
}

.filter-group-label {
	display: block;
	font-size: 12px;
	font-weight: 600;
	color: #8b92ab;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	margin-bottom: 8px;
}

.filter-select {
	width: 100%;
	padding: 10px 14px;
	background: #0f1419;
	border: 1px solid #2d3748;
	border-radius: 8px;
	color: #e2e8f0;
	font-size: 14px;
	cursor: pointer;
	transition: all 0.2s;
	box-sizing: border-box;
}

.filter-select:focus {
	outline: none;
	border-color: #3b82f6;
}

.volume-inputs-inline {
	display: flex;
	align-items: center;
	gap: 8px;
}

.volume-input-small {
	flex: 1;
	padding: 10px 14px;
	background: #0f1419;
	border: 1px solid #2d3748;
	border-radius: 8px;
	color: #e2e8f0;
	font-size: 14px;
	transition: all 0.2s;
	box-sizing: border-box;
}

.volume-input-small:focus {
	outline: none;
	border-color: #3b82f6;
}

.volume-input-small::placeholder {
	color: #64748b;
}

.volume-separator {
	color: #64748b;
	font-size: 13px;
}

.filter-icon {
	font-size: 12px;
	transition: transform 0.2s ease;
}

.volume-inputs {
	display: flex;
	gap: 16px;
	margin-top: 12px;
	padding: 16px;
	background: #0f1419;
	border: 1px solid #2d3748;
	border-radius: 8px;
}

.volume-input-group {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.volume-input-group label {
	font-size: 13px;
	color: #94a3b8;
	font-weight: 500;
}

.volume-input {
	padding: 10px 14px;
	background: #1a1f2e;
	border: 1px solid #2d3748;
	border-radius: 6px;
	color: #e2e8f0;
	font-size: 14px;
	transition: all 0.2s ease;
}

.volume-input:focus {
	outline: none;
	border-color: #3b82f6;
}

.volume-input::placeholder {
	color: #64748b;
}

/* ============= NEW RESULTS DISPLAY STYLES ============= */

/* Export Actions */
.export-actions {
	display: flex;
	gap: 12px;
	margin-bottom: 24px;
	justify-content: flex-end;
}

.btn-export svg {
	margin-right: 6px;
}

/* Save Strategy Button */
.btn-save {
	background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
	border: 1px solid #3b82f6;
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
	background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
	transform: translateY(-2px);
	box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.btn-save svg {
	flex-shrink: 0;
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
	border: 1px solid #2a2f45;
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
	border-bottom: 1px solid #2a2f45;
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
	background: #0a0e1a;
	border: 1px solid #2a2f45;
	border-radius: 8px;
	padding: 12px 16px;
	color: white;
	font-size: 15px;
	transition: all 0.2s;
	box-sizing: border-box;
}

.form-group input:focus {
	outline: none;
	border-color: #3b82f6;
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
	border: 1px solid #2a2f45;
	color: #8b92ab;
	padding: 12px 28px;
	border-radius: 8px;
	cursor: pointer;
	font-size: 14px;
	font-weight: 600;
	transition: all 0.2s;
}

.btn-cancel:hover:not(:disabled) {
	border-color: #3f455f;
	background: rgba(59, 130, 246, 0.05);
	color: white;
}

.btn-cancel:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.btn-save-confirm {
	background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
	border: none;
	color: white;
	padding: 12px 32px;
	border-radius: 8px;
	cursor: pointer;
	font-size: 14px;
	font-weight: 600;
	transition: all 0.2s;
	box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.btn-save-confirm:hover:not(:disabled) {
	background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
	transform: translateY(-1px);
	box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
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
	background: #0a0e1a;
	border: 2px solid #2a2f45;
	border-radius: 12px;
	cursor: pointer;
	transition: all 0.2s;
	text-decoration: none;
	color: inherit;
}

.auth-option:hover:not(.disabled) {
	border-color: #3b82f6;
	background: #141824;
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

/* Hero Summary Section */
.hero-summary {
	background: linear-gradient(135deg, #1a1f2e 0%, #141824 100%);
	border-radius: 16px;
	padding: 32px;
	margin-bottom: 32px;
	border: 1px solid #2d3748;
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

.hero-stats {
	display: flex;
	gap: 16px;
	flex-wrap: wrap;
}

.stat-pill {
	background: #0a0e1a;
	border: 1px solid #2d3748;
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

/* Advanced Metrics Title */
.advanced-metrics-title {
	font-size: 16px;
	font-weight: 600;
	color: white;
	margin: 0 0 20px 0;
}

/* Section Header Toggle */
.section-header-toggle {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 20px;
}

.toggle-btn {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 16px;
	background: #1a1f2e;
	border: 1px solid #2d3748;
	border-radius: 8px;
	color: #e2e8f0;
	font-size: 14px;
	cursor: pointer;
	transition: all 0.2s ease;
}

.toggle-btn:hover {
	background: #242b3d;
	border-color: #3b82f6;
}

.toggle-btn svg {
	transition: transform 0.3s ease;
}

.toggle-btn svg.rotated {
	transform: rotate(180deg);
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
	background: #1a1f2e;
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
	border-bottom: 1px solid #2d3748;
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
	background: #0a0e1a;
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
	background: #1a1f2e;
	border-radius: 12px;
	padding: 24px;
	border: 1px solid #2d3748;
}

.trades-panel h3 {
	margin: 0 0 20px 0;
	font-size: 18px;
	font-weight: 600;
	color: white;
	padding-bottom: 12px;
	border-bottom: 1px solid #2d3748;
}

.comparison-trade-item {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 12px;
	background: #141824;
	border-radius: 8px;
	margin-bottom: 12px;
	border: 1px solid #2d3748;
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
	background: #1a1f2e;
	border: 1px solid #2d3748;
	border-radius: 8px;
	color: #e2e8f0;
	font-size: 14px;
	transition: all 0.2s ease;
}

.table-search:focus {
	outline: none;
	border-color: #3b82f6;
}

.table-search::placeholder {
	color: #64748b;
}

.table-filter-select {
	padding: 10px 14px;
	background: #1a1f2e;
	border: 1px solid #2d3748;
	border-radius: 8px;
	color: #e2e8f0;
	font-size: 14px;
	cursor: pointer;
	transition: all 0.2s ease;
}

.table-filter-select:hover {
	border-color: #3b82f6;
}

.table-filter-select:focus {
	outline: none;
	border-color: #3b82f6;
}

/* Enhanced Trade Table */
.trades-table-wrapper {
	overflow-x: auto;
	background: #1a1f2e;
	border-radius: 12px;
	border: 1px solid #2d3748;
}

.trades-table {
	width: 100%;
	border-collapse: collapse;
}

.trades-table thead {
	background: #141824;
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
	border-bottom: 2px solid #2d3748;
	white-space: nowrap;
}

.trades-table th.sortable {
	cursor: pointer;
	user-select: none;
	transition: all 0.2s ease;
}

.trades-table th.sortable:hover {
	color: #3b82f6;
	background: #1a1f2e;
}

.sort-indicator {
	display: inline-block;
	margin-left: 6px;
	font-size: 12px;
	color: #3b82f6;
	font-weight: bold;
}

.trades-table td {
	padding: 14px 12px;
	font-size: 13px;
	color: #e2e8f0;
	border-bottom: 1px solid #2d3748;
}

.trades-table tbody tr {
	transition: background 0.2s ease;
}

.trades-table tbody tr:hover {
	background: #1e2537;
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
	background: #141824;
	border-top: 1px solid #2d3748;
	border-radius: 0 0 12px 12px;
}

.pagination-btn {
	padding: 8px 16px;
	background: #1a1f2e;
	border: 1px solid #2d3748;
	border-radius: 8px;
	color: #e2e8f0;
	font-size: 14px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.2s ease;
}

.pagination-btn:hover:not(:disabled) {
	background: #2d3748;
	border-color: #3b82f6;
	color: #3b82f6;
}

.pagination-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.pagination-info {
	font-size: 14px;
	color: #9ca3af;
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
	background: #141824;
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
</style>
