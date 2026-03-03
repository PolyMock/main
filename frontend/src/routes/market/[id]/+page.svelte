<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { PolyMarket } from '$lib/polymarket';
	import { walletStore, refreshUserBalance } from '$lib/wallet/stores';
	import { polymarketService } from '$lib/solana/polymarket-service';
	import { sessionKeyManager } from '$lib/solana/session-keys';
	import { PublicKey } from '@solana/web3.js';
	import MarketChat from '$lib/components/MarketChat.svelte';

	let marketId: string;
	let market: PolyMarket | null = null;
	let chartData: any[] = [];
	let selectedInterval = '1D';
	let selectedTab = 'Graph';
	let selectedOutcome = 'Yes';
	let tradeAmount = 100; // For buy: USD amount, For sell: shares count
	let tradeMode: 'buy' | 'sell' = 'buy';
	let loading = true;
	let error = '';
	let walletState = $walletStore;
	let trading = false;

	// Stop Loss / Take Profit
	let stopLoss = 0;
	let takeProfit = 0;

	// Modal state
	let showConfirmModal = false;
	let showSessionRequiredModal = false;
	let modalTitle = '';
	let modalMessage = '';
	let modalDetails: any = null;
	let pendingTrade: (() => Promise<void>) | null = null;

	// Toast state
	let showToast = false;
	let toastType: 'success' | 'error' = 'success';
	let toastMessage = '';
	let toastTimer: ReturnType<typeof setTimeout>;

	function showToastNotification(type: 'success' | 'error', message: string) {
		clearTimeout(toastTimer);
		toastType = type;
		toastMessage = message;
		showToast = true;
		toastTimer = setTimeout(() => { showToast = false; }, 4000);
	}
	let userPositions: any[] = [];
	let selectedPosition: any = null;
	let loadingPositions = false;

	// Subscribe to wallet state
	walletStore.subscribe(value => {
		walletState = value;
		if (value.connected && value.publicKey && tradeMode === 'sell') {
			loadUserPositions();
		}
	});

	// Load positions when switching to sell mode or when outcome changes
	$: if (walletState.connected && walletState.publicKey && tradeMode === 'sell' && market) {
		loadUserPositions();
	}

	$: marketId = $page.params.id || '';
	$: yesPrice = market?.yesPrice || 0;
	$: noPrice = market?.noPrice || 0;
	$: currentPrice = selectedOutcome === 'Yes' ? yesPrice : noPrice;
	$: sharesToWin = tradeAmount / currentPrice;
	$: avgPriceFormatted = formatPrice(currentPrice);
	$: toWinAmount = tradeMode === 'buy' ? sharesToWin : tradeAmount * currentPrice;
	$: volume = market?.volume_24hr || market?.volume || 0;
	$: hasActiveSession = walletState.connected && sessionKeyManager.isSessionActive();
	$: priceChangePercent = -27; 

	async function fetchMarketData(id: string): Promise<PolyMarket | null> {
		try {
			const response = await fetch(`/api/markets/${id}`);
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`);
			}
			const data = await response.json();
			return data;
		} catch (err) {
			console.error('Failed to fetch market data:', err);
			return null;
		}
	}

	async function fetchChartData(id: string, interval: string): Promise<any[]> {
		try {
			const response = await fetch(`/api/markets/${id}/chart?interval=${interval.toLowerCase()}`);
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`);
			}
			const data = await response.json();
			return data.history || [];
		} catch (err) {
			console.error('Failed to fetch chart data:', err);
			return [];
		}
	}

	async function loadMarketDetails() {
		loading = true;
		error = '';

		try {
			const [marketData, chartDataResult] = await Promise.all([
				fetchMarketData(marketId),
				fetchChartData(marketId, selectedInterval)
			]);

			if (marketData) {
				market = marketData;
			} else {
				error = 'Failed to load market data';
			}

			chartData = chartDataResult;
		} catch (err) {
			error = 'Failed to load market details';
		} finally {
			loading = false;
		}
	}

	async function handleIntervalChange(interval: string) {
		selectedInterval = interval;
		const newChartData = await fetchChartData(marketId, interval);
		chartData = newChartData;
	}

	function handleBack() {
		goto('/');
	}

	function formatPrice(price: number): string {
		const cents = price * 100;
		return `${cents.toFixed(1)}¢`;
	}

	function formatDollar(value: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2
		}).format(value);
	}

	function formatVolume(volume: number): string {
		if (volume >= 1000000) {
			return `$${(volume / 1000000).toFixed(1)}M`;
		} else if (volume >= 1000) {
			return `$${Math.round(volume / 1000)}K`;
		}
		return `$${volume.toFixed(0)}`;
	}

	function handleQuickAmount(amount: number) {
		if (tradeMode === 'buy') {
			if (amount === -1) { // Max
				tradeAmount = walletState.usdcBalance || 0;
			} else {
				const newAmount = tradeAmount + amount;
				// Don't exceed user's balance
				tradeAmount = Math.min(newAmount, walletState.usdcBalance || 0);
			}
		}
	}

	async function loadUserPositions() {
		if (!walletState.connected || !walletState.publicKey || !market) {
			userPositions = [];
			return;
		}

		loadingPositions = true;
		try {
			const userPublicKey = new PublicKey(walletState.publicKey.toString());
			const blockchainPositions = await polymarketService.getUserPositions(userPublicKey);

			// Filter positions for the selected market and outcome
			userPositions = blockchainPositions
				.filter(pos => {
					const isYes = 'yes' in pos.predictionType;
					const matchesMarket = pos.marketId === market.id;
					const matchesOutcome = (selectedOutcome === 'Yes' && isYes) || (selectedOutcome === 'No' && !isYes);
					const isActive = 'active' in pos.status || 'partiallySold' in pos.status;
					return matchesMarket && matchesOutcome && isActive;
				})
				.map(pos => {
					const isYes = 'yes' in pos.predictionType;
					const remainingShares = pos.remainingShares.toNumber() / 1_000_000;
					const shares = pos.shares.toNumber() / 1_000_000;
					const pricePerShare = pos.pricePerShare.toNumber() / 1_000_000;
					
					return {
						positionId: pos.positionId.toNumber(),
						marketId: pos.marketId,
						predictionType: isYes ? 'Yes' : 'No',
						shares,
						remainingShares,
						pricePerShare,
						amountUsdc: pos.amountUsdc.toNumber() / 1_000_000
					};
				});

			// Auto-select first position if available (for sell mode)
			if (userPositions.length > 0) {
				selectedPosition = userPositions[0];
				// Don't auto-set amount, let user choose
				if (tradeAmount === 0 || tradeAmount === 100) {
					tradeAmount = 0;
				}
			} else {
				selectedPosition = null;
				tradeAmount = 0;
			}
		} catch (error) {
			console.error('Error loading user positions:', error);
			userPositions = [];
		} finally {
			loadingPositions = false;
		}
	}

	function handleBuyYes() {
		selectedOutcome = 'Yes';
		// Scroll to trading panel
		const tradingPanel = document.querySelector('.trading-interface');
		if (tradingPanel) {
			tradingPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	}

	function handleBuyNo() {
		selectedOutcome = 'No';
		// Scroll to trading panel
		const tradingPanel = document.querySelector('.trading-interface');
		if (tradingPanel) {
			tradingPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	}

	async function handleTrade() {
		// Check wallet connection
		if (!walletState.connected || !walletState.adapter) {
			showToastNotification('error', 'Please connect your wallet first!');
			return;
		}

		// Check session key
		if (!sessionKeyManager.isSessionActive()) {
			showSessionRequiredModal = true;
			return;
		}

		// Validate trade parameters
		if (!tradeAmount || tradeAmount <= 0) {
			showToastNotification('error', 'Please enter a valid trade amount');
			return;
		}

		// Check if user has sufficient balance
		if (tradeAmount > walletState.usdcBalance) {
			showToastNotification('error', `Insufficient balance. You have ${formatDollar(walletState.usdcBalance)} available.`);
			return;
		}

		if (!selectedOutcome) {
			showToastNotification('error', 'Please select an outcome (Yes or No)');
			return;
		}

		// Calculate trade details
		const price = selectedOutcome === 'Yes' ? yesPrice : noPrice;

		if (price <= 0) {
			showToastNotification('error', 'Invalid price. Please refresh the page.');
			return;
		}

		if (tradeMode === 'buy') {
			// Calculate and show confirmation modal for buy
			const shares = tradeAmount / price;
			const potentialWin = shares;

			modalTitle = `Buy ${selectedOutcome}`;
			modalDetails = {
				action: `Buy ${selectedOutcome}`,
				amount: formatDollar(tradeAmount),
				price: formatPrice(price),
				shares: shares.toFixed(2),
				potentialWin: formatDollar(potentialWin),
				stopLoss: stopLoss > 0 ? `${stopLoss.toFixed(2)}¢` : null,
				takeProfit: takeProfit > 0 ? `${takeProfit.toFixed(2)}¢` : null
			};
			showConfirmModal = true;

			// Store the actual trade execution
			pendingTrade = async () => {
				trading = true;
				try {
					// Execute the trade on Solana
					let txSignature: string;

					if (selectedOutcome === 'Yes') {
						txSignature = await polymarketService.buyYes(
							walletState.adapter,
							marketId,
							tradeAmount,
							price,
							stopLoss,
							takeProfit
						);
					} else {
						txSignature = await polymarketService.buyNo(
							walletState.adapter,
							marketId,
							tradeAmount,
							price,
							stopLoss,
							takeProfit
						);
					}

					showToastNotification('success', `Trade successful! Tx: ${txSignature.slice(0, 20)}...`);

					// Refresh user balance after successful trade
					if (walletState.publicKey) {
						await refreshUserBalance(new PublicKey(walletState.publicKey.toString()));
					}

					// Reset trade amount
					tradeAmount = 100;
				} catch (error: any) {
					console.error('Trade failed:', error);
					showToastNotification('error', error.message || 'Trade failed');
				} finally {
					trading = false;
				}
			};
		} else {
			// Sell logic
			if (!selectedPosition) {
				showToastNotification('error', 'Please select a position to sell.');
				return;
			}

			// TradeAmount is already in shares for sell mode
			const sharesToSell = tradeAmount;
			const remainingShares = selectedPosition.remainingShares;

			if (sharesToSell <= 0 || sharesToSell > remainingShares) {
				showToastNotification('error', `You can only sell up to ${remainingShares.toFixed(2)} shares.`);
				return;
			}

			const payout = sharesToSell * price;

			modalTitle = `Sell ${selectedOutcome}`;
			modalDetails = {
				action: `Sell ${selectedOutcome}`,
				shares: sharesToSell.toFixed(2),
				price: formatPrice(price),
				amount: `${sharesToSell.toFixed(2)} shares`,
				potentialWin: formatDollar(payout)
			};
			showConfirmModal = true;

			// Store the actual trade execution
			pendingTrade = async () => {
				trading = true;
				try {
					// Execute the sell on Solana
					let txSignature: string;

					if (selectedOutcome === 'Yes') {
						txSignature = await polymarketService.sellYes(
							walletState.adapter,
							selectedPosition.positionId,
							sharesToSell,
							price
						);
					} else {
						txSignature = await polymarketService.sellNo(
							walletState.adapter,
							selectedPosition.positionId,
							sharesToSell,
							price
						);
					}

					showToastNotification('success', `Sell successful! Tx: ${txSignature.slice(0, 20)}...`);

					// Refresh user balance and positions after successful sell
					if (walletState.publicKey) {
						await refreshUserBalance(new PublicKey(walletState.publicKey.toString()));
						await loadUserPositions();
					}

					// Reset trade amount
					tradeAmount = 100;
				} catch (error: any) {
					console.error('Sell failed:', error);
					showToastNotification('error', error.message || 'Sell failed');
				} finally {
					trading = false;
				}
			};
		}
	}

	async function confirmTrade() {
		showConfirmModal = false;
		if (pendingTrade) {
			await pendingTrade();
			pendingTrade = null;
		}
	}

	function cancelTrade() {
		showConfirmModal = false;
		pendingTrade = null;
	}

	function closeModal() {
		showConfirmModal = false;
		modalDetails = null;
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'long',
			day: 'numeric'
		});
	}

	function drawChart() {
		const canvas = document.getElementById('priceChart') as HTMLCanvasElement;
		if (!canvas || !chartData.length) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Set canvas size
		const rect = canvas.getBoundingClientRect();
		canvas.width = rect.width;
		canvas.height = rect.height;

		// Clear canvas
		ctx.fillStyle = '#000000';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Chart dimensions
		const padding = { top: 20, right: 60, bottom: 40, left: 20 };
		const chartWidth = canvas.width - padding.left - padding.right;
		const chartHeight = canvas.height - padding.top - padding.bottom;

		// Find price bounds
		const prices = chartData.map(d => d.close);
		const maxPrice = Math.max(...prices);
		const minPrice = Math.min(...prices);
		const priceRange = maxPrice - minPrice || 0.1;

		// Draw grid lines
		ctx.strokeStyle = '#1F2333';
		ctx.lineWidth = 1;
		ctx.setLineDash([3, 3]);

		// Horizontal grid lines (price levels)
		for (let i = 0; i <= 6; i++) {
			const y = padding.top + (chartHeight / 6) * i;
			ctx.beginPath();
			ctx.moveTo(padding.left, y);
			ctx.lineTo(padding.left + chartWidth, y);
			ctx.stroke();

			// Price labels (right side)
			const price = maxPrice - (priceRange / 6) * i;
			const percentage = (price * 100).toFixed(0) + '%';
			ctx.fillStyle = '#A0A0A0';
			ctx.font = '12px Inter, sans-serif';
			ctx.textAlign = 'left';
			ctx.fillText(percentage, padding.left + chartWidth + 10, y + 4);
		}

		// Vertical grid lines (time)
		const timeStep = Math.ceil(chartData.length / 6);
		for (let i = 0; i < chartData.length; i += timeStep) {
			const x = padding.left + (chartWidth / (chartData.length - 1)) * i;
			ctx.beginPath();
			ctx.moveTo(x, padding.top);
			ctx.lineTo(x, padding.top + chartHeight);
			ctx.stroke();

			// Time labels (bottom)
			if (chartData[i]) {
				ctx.fillStyle = '#A0A0A0';
				ctx.font = '12px Inter, sans-serif';
				ctx.textAlign = 'center';
				const date = new Date(chartData[i].timestamp * 1000);
				const timeLabel = date.toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric'
				});
				ctx.fillText(timeLabel, x, padding.top + chartHeight + 20);
			}
		}

		// Draw price line
		ctx.setLineDash([]);
		ctx.strokeStyle = '#F97316';
		ctx.lineWidth = 2;
		ctx.beginPath();

		chartData.forEach((point, index) => {
			const x = padding.left + (chartWidth / (chartData.length - 1)) * index;
			const y = padding.top + chartHeight - ((point.close - minPrice) / priceRange) * chartHeight;

			if (index === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
		});

		ctx.stroke();

		// Draw data points
		ctx.fillStyle = '#F97316';
		chartData.forEach((point, index) => {
			const x = padding.left + (chartWidth / (chartData.length - 1)) * index;
			const y = padding.top + chartHeight - ((point.close - minPrice) / priceRange) * chartHeight;
			
			ctx.beginPath();
			ctx.arc(x, y, 3, 0, 2 * Math.PI);
			ctx.fill();
		});
	}

	function matchPanelHeights() {
		const tradingInterface = document.querySelector('.trading-interface');
		const leftColumn = document.querySelector('.left-column');

		if (tradingInterface && leftColumn) {
			const tradingHeight = tradingInterface.offsetHeight;
			(leftColumn as HTMLElement).style.height = `${tradingHeight}px`;
			(leftColumn as HTMLElement).style.minHeight = `${tradingHeight}px`;
			(leftColumn as HTMLElement).style.maxHeight = `${tradingHeight}px`;
		}
	}

	onMount(() => {
		if (marketId) {
			loadMarketDetails();
		}

		// Match heights after content loads
		setTimeout(matchPanelHeights, 100);

		// Watch for changes in trading panel only
		const observer = new MutationObserver(matchPanelHeights);
		const tradingInterface = document.querySelector('.trading-interface');
		if (tradingInterface) {
			observer.observe(tradingInterface, { childList: true, subtree: true });
		}

		return () => observer.disconnect();
	});

	$: if (marketId) {
		loadMarketDetails();
	}

	$: if (chartData.length > 0) {
		setTimeout(drawChart, 100);
	}
</script>

<svelte:head>
	<title>{market?.question || 'Market Details'} - PolyMock</title>
</svelte:head>

<div class="market-detail">
	{#if error}
		<div class="error-state">
			<p>{error}</p>
			<button on:click={loadMarketDetails} class="retry-btn">Retry</button>
		</div>
	{:else if loading}
		<div class="loading-skeleton">
			<div class="skeleton-header"></div>
			<div class="skeleton-content"></div>
		</div>
	{:else if market}
		<!-- Header Section -->
		<div class="market-header">
			<button class="back-button" on:click={handleBack}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M19 12H5M12 19l-7-7 7-7"/>
				</svg>
				Back to Markets
			</button>

			<div class="header-left">
				<div class="market-info">
					{#if market.image}
						<img src={market.image} alt="Market" class="market-image" />
					{:else}
						<div class="market-image-placeholder"></div>
					{/if}
					<div class="market-title-section">
						<h1 class="market-title">{market.question || 'Unknown Market'}</h1>
						<p class="market-volume">{formatVolume(volume)} Vol.</p>
					</div>
				</div>
			</div>

			<div class="header-right">
				<div class="market-date">{market.endDate ? formatDate(market.endDate) : 'TBD'}</div>
				<div class="header-icons">
					<button class="icon-btn">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<path d="m9 12 2 2 4-4"/>
							<path d="M21 12c.552 0 1-.448 1-1s-.448-1-1-1-1 .448-1 1 .448 1 1 1z"/>
							<path d="M17 7l-10 10"/>
							<path d="m8 12 2 2 4-4"/>
						</svg>
					</button>
					<button class="icon-btn">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>
						</svg>
					</button>
				</div>
				<div class="polymarket-watermark">Polymarket</div>
			</div>
		</div>

		<!-- Tabs Section -->
		<div class="tabs-section">
			<div class="tabs">
				<button
					class="tab"
					class:active={selectedTab === 'Graph'}
					on:click={() => selectedTab = 'Graph'}
				>
					Graph
				</button>
				<button
					class="tab"
					class:active={selectedTab === 'Resolution'}
					on:click={() => selectedTab = 'Resolution'}
				>
					Resolution
				</button>
				<button
					class="tab"
					class:active={selectedTab === 'Chat'}
					on:click={() => selectedTab = 'Chat'}
				>
					Chat
				</button>
			</div>
		</div>

		<!-- Main Content -->
		<div class="market-content">
			<!-- Left Column -->
			<div class="left-column">
				{#if selectedTab === 'Graph'}
					<!-- Outcomes Header -->
					<div class="outcomes-header">
						<h2>Market Outcomes</h2>
						<div class="chart-watermark">Polymarket</div>
					</div>

					<!-- Binary YES/NO Outcomes -->
					<div class="outcomes-container">
						<div class="outcomes-list">
							<!-- YES Outcome -->
							<div class="outcome-row">
								<div class="outcome-info">
									<div class="outcome-title">Yes</div>
									<div class="outcome-volume">${((market?.volume_24hr || 0) / 2).toFixed(0)} Vol.</div>
								</div>
								<div class="outcome-stats">
									<div class="outcome-percentage-large">{((yesPrice || 0) * 100).toFixed(0)}%</div>
									<div class="outcome-change">
										<span class="change-indicator {priceChangePercent < 0 ? 'negative' : 'positive'}">
											{priceChangePercent < 0 ? '▼' : '▲'}{Math.abs(priceChangePercent)}%
										</span>
									</div>
								</div>
								<div class="outcome-actions">
									<button class="buy-yes-btn" on:click={handleBuyYes}>Buy Yes {formatPrice(yesPrice)}</button>
								</div>
							</div>

							<!-- NO Outcome -->
							<div class="outcome-row">
								<div class="outcome-info">
									<div class="outcome-title">No</div>
									<div class="outcome-volume">${((market?.volume_24hr || 0) / 2).toFixed(0)} Vol.</div>
								</div>
								<div class="outcome-stats">
									<div class="outcome-percentage-large">{((noPrice || 0) * 100).toFixed(0)}%</div>
									<div class="outcome-change">
										<span class="change-indicator {-priceChangePercent < 0 ? 'negative' : 'positive'}">
											{-priceChangePercent < 0 ? '▼' : '▲'}{Math.abs(-priceChangePercent)}%
										</span>
									</div>
								</div>
								<div class="outcome-actions">
									<button class="buy-no-btn" on:click={handleBuyNo}>Buy No {formatPrice(noPrice)}</button>
								</div>
							</div>
						</div>
					</div>

					<!-- Terms -->
					<div class="terms-text">
						By trading, you agree to the <a href="#" class="terms-link">Terms of Use</a>.
					</div>

				{:else if selectedTab === 'Chat'}
					<!-- Chat Content -->
					<MarketChat {marketId} />

				{:else if selectedTab === 'Resolution'}
					<!-- Resolution Content -->
					<div class="resolution-content">
						<!-- Resolution Outcome -->
						{#if market.closed}
							<div class="resolution-section outcome-section">
								<div class="section-header">
									<h3>🎯 Resolution Outcome</h3>
								</div>
								<div class="section-content">
									<div class="outcome-result">
										{#if market.resolvedOutcome}
											<div class="resolved-badge resolved-{market.resolvedOutcome.toLowerCase()}">
												Resolved: {market.resolvedOutcome}
											</div>
										{:else}
											<div class="resolved-badge resolved-pending">
												Market Closed - Awaiting Resolution
											</div>
										{/if}
									</div>
									{#if market.resolvedAt}
										<p class="resolution-date">
											Resolved on: {new Date(market.resolvedAt).toLocaleDateString('en-US', {
												month: 'long',
												day: 'numeric',
												year: 'numeric',
												hour: '2-digit',
												minute: '2-digit'
											})}
										</p>
									{/if}
								</div>
							</div>
						{:else}
							<div class="resolution-section outcome-section">
								<div class="section-header">
									<h3>📊 Market Status</h3>
								</div>
								<div class="section-content">
									<div class="outcome-result">
										<div class="resolved-badge resolved-active">
											Market Active - Trading Open
										</div>
									</div>
									<p class="resolution-info">
										This market is currently active and accepting trades. It will resolve when the outcome is determined.
									</p>
								</div>
							</div>
						{/if}

						<div class="resolution-section">
							<div class="section-header">
								<h3>Market Description</h3>
							</div>
							<div class="section-content">
								<p>{market.description || 'In the past week, significant developments have emerged regarding the potential release of Jeffrey Epstein-related files by the Trump administration. On November 19, 2025, reports surfaced indicating that the new administration is considering declassifying various documents...'}</p>
							</div>
						</div>

						<div class="resolution-section">
							<div class="section-header">
								<h3>Resolution Rules</h3>
							</div>
							<div class="section-content">
								<p>{market.rules || 'This market will resolve based on the outcome of the specified event. The resolution criteria will be determined by official sources and verified information.'}</p>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Right Panel -->
			<div class="right-panel">
				<div class="trading-interface">
					<!-- Date & Tabs -->
					<div class="panel-header">
						<div class="panel-date">{market.endDate ? formatDate(market.endDate) : 'TBD'}</div>
						<div class="trade-tabs">
							<button
								class="trade-tab"
								class:active={tradeMode === 'buy'}
								on:click={() => tradeMode = 'buy'}
							>
								Buy
							</button>
							<button
								class="trade-tab"
								class:active={tradeMode === 'sell'}
								on:click={() => tradeMode = 'sell'}
							>
								Sell
							</button>
							<button class="trade-tab dropdown">
								Market
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polyline points="6,9 12,15 18,9"></polyline>
								</svg>
							</button>
						</div>
					</div>

					<!-- YES/NO Price Boxes -->
					<div class="outcome-boxes">
						<button 
							class="outcome-box"
							class:active={selectedOutcome === 'Yes'}
							on:click={() => { selectedOutcome = 'Yes'; selectedPosition = null; tradeAmount = 0; }}
						>
							<div class="outcome-label">Yes</div>
							<div class="outcome-price">{formatPrice(yesPrice)}</div>
						</button>
						<button 
							class="outcome-box"
							class:active={selectedOutcome === 'No'}
							on:click={() => { selectedOutcome = 'No'; selectedPosition = null; tradeAmount = 0; }}
						>
							<div class="outcome-label">No</div>
							<div class="outcome-price">{formatPrice(noPrice)}</div>
						</button>
					</div>

					<!-- Amount Input -->
					<div class="amount-section">
						<label class="amount-label">{tradeMode === 'buy' ? 'Amount' : 'Shares'}</label>
						<div class="amount-input-wrapper">
							{#if tradeMode === 'buy'}
								<span class="amount-currency">$</span>
							{/if}
							<input
								type="number"
								bind:value={tradeAmount}
								class="amount-input"
								class:sell-mode={tradeMode === 'sell'}
								min="0"
								step={tradeMode === 'buy' ? '0.01' : '0.01'}
								max={tradeMode === 'buy' ? (walletState.usdcBalance || 10000) : (selectedPosition ? selectedPosition.remainingShares : 0)}
								placeholder={tradeMode === 'buy' ? `Max: ${formatDollar(walletState.usdcBalance || 0)}` : (selectedPosition ? `${selectedPosition.remainingShares.toFixed(2)} shares max` : 'No position')}
							/>
							{#if tradeMode === 'sell'}
								<span class="amount-suffix">shares</span>
							{/if}
						</div>
						<div class="quick-amounts">
							{#if tradeMode === 'buy'}
								<button class="quick-btn" on:click={() => handleQuickAmount(1)}>+$1</button>
								<button class="quick-btn" on:click={() => handleQuickAmount(20)}>+$20</button>
								<button class="quick-btn" on:click={() => handleQuickAmount(100)}>+$100</button>
								<button class="quick-btn" on:click={() => handleQuickAmount(-1)}>Max</button>
							{:else if selectedPosition}
								<button class="quick-btn" on:click={() => {
									tradeAmount = selectedPosition.remainingShares * 0.25;
								}}>25%</button>
								<button class="quick-btn" on:click={() => {
									tradeAmount = selectedPosition.remainingShares * 0.5;
								}}>50%</button>
								<button class="quick-btn" on:click={() => {
									tradeAmount = selectedPosition.remainingShares * 0.75;
								}}>75%</button>
								<button class="quick-btn" on:click={() => {
									tradeAmount = selectedPosition.remainingShares;
								}}>Max</button>
							{/if}
						</div>
					</div>

					<!-- Advanced Settings (SL/TP) - Only for Buy Mode -->
					{#if tradeMode === 'buy'}
					<div class="advanced-section">
						<div class="advanced-header">
							<span class="advanced-title">Stop Loss / Take Profit</span>
							<span class="advanced-subtitle">Automated exit conditions</span>
						</div>

						<div class="advanced-content">
							<div class="sltp-info">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<circle cx="12" cy="12" r="10"/>
									<path d="M12 16v-4M12 8h.01"/>
								</svg>
								<span>Set automated exit prices. Bot will close your position when price reaches these levels.</span>
							</div>

							<div class="sltp-grid">
								<div class="sltp-input-group">
									<label class="sltp-label">
										<span class="sltp-label-text">Stop Loss</span>
										<span class="sltp-label-badge sl-badge">SL</span>
									</label>
									<div class="sltp-input-wrapper">
										<input
											type="number"
											bind:value={stopLoss}
											class="sltp-input"
											min="0"
											max={currentPrice * 100}
											step="0.01"
											placeholder="45.5"
										/>
										<span class="sltp-currency">¢</span>
									</div>
									<span class="sltp-description">Exit if price drops to this level</span>
								</div>

								<div class="sltp-input-group">
									<label class="sltp-label">
										<span class="sltp-label-text">Take Profit</span>
										<span class="sltp-label-badge tp-badge">TP</span>
									</label>
									<div class="sltp-input-wrapper">
										<input
											type="number"
											bind:value={takeProfit}
											class="sltp-input"
											min={currentPrice * 100}
											max="100"
											step="0.01"
											placeholder="75.5"
										/>
										<span class="sltp-currency">¢</span>
									</div>
									<span class="sltp-description">Exit if price rises to this level</span>
								</div>
							</div>

							<div class="sltp-active-summary">
								<div class="sltp-active-title">Active Conditions:</div>
								<div class="sltp-active-items">
									<div class="sltp-active-item sl">
										<span class="sltp-badge sl-badge">SL</span>
										<span class="sltp-active-value">{stopLoss > 0 ? `${stopLoss.toFixed(2)}¢` : 'No'}</span>
									</div>
									<div class="sltp-active-item tp">
										<span class="sltp-badge tp-badge">TP</span>
										<span class="sltp-active-value">{takeProfit > 0 ? `${takeProfit.toFixed(2)}¢` : 'No'}</span>
									</div>
								</div>
							</div>
						</div>
					</div>
					{/if}

					<!-- To Win/Receive Section -->
					<div class="to-win-section">
						<div class="to-win-header">
							<span>{tradeMode === 'buy' ? 'To win 🟢' : 'To receive 💵'}</span>
						</div>
						<div class="avg-price-row">
							<span>Avg. Price {avgPriceFormatted}</span>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="info-icon">
								<circle cx="12" cy="12" r="10"/>
								<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
								<path d="M12 17h.01"/>
							</svg>
						</div>
						<div class="to-win-amount">{formatDollar(toWinAmount)}</div>
					</div>

					<!-- Trade Button -->
					{#if hasActiveSession}
						<div class="session-indicator">
							<span class="session-dot-sm"></span> One-Click Trading Active
						</div>
					{/if}
					<button
						class="trade-button"
						on:click={handleTrade}
						disabled={!walletState.connected || tradeAmount <= 0 || trading || (tradeMode === 'sell' && (!selectedPosition || userPositions.length === 0))}
					>
						{#if !walletState.connected}
							Connect Wallet
						{:else if tradeMode === 'sell' && (!selectedPosition || userPositions.length === 0)}
							No {selectedOutcome} Position
						{:else if trading}
							Processing...
						{:else}
							{hasActiveSession ? '⚡ ' : ''}{tradeMode === 'buy' ? 'Buy' : 'Sell'}
						{/if}
					</button>

					<!-- Footer -->
					<div class="panel-footer">
						By trading, you agree to the <a href="#" class="terms-link">Terms of Use</a>.
					</div>
				</div>
			</div>
		</div>
	{:else}
		<div class="error-state">
			<p>Market not found</p>
			<button on:click={handleBack} class="retry-btn">Go Back</button>
		</div>
	{/if}
</div>

<!-- Confirmation Modal -->
{#if showConfirmModal}
<div class="pm-overlay" on:click={cancelTrade} on:keydown={(e) => e.key === 'Escape' && cancelTrade()} role="button" tabindex="0">
	<div class="pm-modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" tabindex="-1">
		<h3 class="pm-title">{modalTitle}</h3>
		{#if modalDetails}
		<div class="pm-details">
			<div class="pm-row">
				<span class="pm-label">Action</span>
				<span class="pm-value">{modalDetails.action}</span>
			</div>
			<div class="pm-row">
				<span class="pm-label">Amount</span>
				<span class="pm-value">{modalDetails.amount}</span>
			</div>
			<div class="pm-row">
				<span class="pm-label">Price</span>
				<span class="pm-value">{modalDetails.price}</span>
			</div>
			<div class="pm-row">
				<span class="pm-label">Shares</span>
				<span class="pm-value">{modalDetails.shares}</span>
			</div>
			<div class="pm-row highlight">
				<span class="pm-label">Potential Win</span>
				<span class="pm-value highlight-value">{modalDetails.potentialWin}</span>
			</div>
			{#if modalDetails.stopLoss || modalDetails.takeProfit}
			{#if modalDetails.stopLoss}
			<div class="pm-row">
				<span class="pm-label">Stop Loss</span>
				<span class="pm-value sl-value">{modalDetails.stopLoss}</span>
			</div>
			{/if}
			{#if modalDetails.takeProfit}
			<div class="pm-row">
				<span class="pm-label">Take Profit</span>
				<span class="pm-value tp-value">{modalDetails.takeProfit}</span>
			</div>
			{/if}
			{/if}
		</div>
		{/if}
		<div class="pm-actions">
			<button class="pm-btn secondary" on:click={cancelTrade}>Cancel</button>
			<button class="pm-btn primary" on:click={confirmTrade} disabled={trading}>
				{trading ? 'Processing...' : 'Confirm Trade'}
			</button>
		</div>
	</div>
</div>
{/if}

<!-- Session Required Modal -->
{#if showSessionRequiredModal}
<div class="pm-overlay" on:keydown={(e) => e.key === 'Escape' && e.preventDefault()} role="dialog" tabindex="0">
	<div class="pm-modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" tabindex="-1">
		<h3 class="pm-title">Session Required</h3>
		<p class="pm-desc">
			You need an active session to trade. Enable one-click trading from the session button in the navbar to sign once and trade instantly.
		</p>
		<button class="pm-btn primary" on:click={() => showSessionRequiredModal = false}>Got it</button>
	</div>
</div>
{/if}

<!-- Toast Notification -->
{#if showToast}
<div class="toast {toastType}">
	<div class="toast-header">
		<span class="toast-icon">{toastType === 'success' ? '✓' : '✕'}</span>
		<span class="toast-title">{toastType === 'success' ? 'ORDER EXECUTED' : 'ERROR'}</span>
		<button class="toast-close" on:click={() => showToast = false} aria-label="Close">&times;</button>
	</div>
	<p class="toast-msg">{toastMessage}</p>
</div>
{/if}

<style>
	.market-detail {
		min-height: 100vh;
		background: #000000;
		color: #E8E8E8;
	}

	:global(.light-mode) .market-detail {
		background: #FFFFFF;
		color: #1A1A1A;
	}

	:global(.light-mode) .market-header {
		border-bottom-color: #E0E0E0;
	}

	:global(.light-mode) .market-title {
		color: #1A1A1A;
	}

	:global(.light-mode) .market-info {
		color: #666;
	}

	:global(.light-mode) .market-image {
		border-color: #E0E0E0;
	}

	:global(.light-mode) .category-badge {
		background: #F5F5F5;
		color: #666;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .trade-section {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .trade-options {
		background: #FFFFFF;
	}

	:global(.light-mode) .trade-option {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .trade-option:hover {
		background: #FAFAFA;
	}

	:global(.light-mode) .trade-option.selected {
		border-color: #00B570;
		background: rgba(0, 181, 112, 0.05);
	}

	:global(.light-mode) .option-label {
		color: #666;
	}

	:global(.light-mode) .option-price {
		color: #1A1A1A;
	}

	:global(.light-mode) .option-percentage {
		color: #666;
	}

	:global(.light-mode) .input-group label {
		color: #666;
	}

	:global(.light-mode) .input-group input {
		background: #FFFFFF;
		border-color: #E0E0E0;
		color: #1A1A1A;
	}

	:global(.light-mode) .trade-summary {
		background: #F5F5F5;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .summary-row {
		color: #666;
	}

	:global(.light-mode) .summary-label {
		color: #999;
	}

	:global(.light-mode) .summary-value {
		color: #1A1A1A;
	}

	:global(.light-mode) .place-trade-btn {
		background: #00B570;
	}

	:global(.light-mode) .place-trade-btn:hover {
		background: #009560;
	}

	:global(.light-mode) .chart-panel {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .chart-header h2 {
		color: #1A1A1A;
	}

	:global(.light-mode) .stats-grid {
		background: #FFFFFF;
	}

	:global(.light-mode) .stat-item {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .stat-label {
		color: #999;
	}

	:global(.light-mode) .stat-value {
		color: #1A1A1A;
	}

	:global(.light-mode) .loading-spinner {
		border-color: #E0E0E0;
		border-top-color: #00B570;
	}

	/* Header Section */
	.market-header {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: flex-start;
		padding: 24px;
		border-bottom: 1px solid #2A2F45;
		gap: 16px;
	}

	.back-button {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		background: transparent;
		border: 1px solid #2A2F45;
		border-radius: 8px;
		color: #A0A0A0;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 200ms ease-out;
		font-family: Inter, sans-serif;
	}

	.back-button:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: #00D084;
		color: #00D084;
		transform: translateX(-4px);
	}

	.back-button svg {
		transition: transform 200ms ease-out;
	}

	.back-button:hover svg {
		transform: translateX(-2px);
	}

	.header-left {
		flex: 1;
	}

	.market-info {
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}

	.market-image {
		width: 64px;
		height: 64px;
		border-radius: 8px;
		object-fit: cover;
		background: #000000;
	}

	.market-image-placeholder {
		width: 64px;
		height: 64px;
		border-radius: 8px;
		background: #000000;
		border: 1px solid #2A2F45;
	}

	.market-title-section {
		flex: 1;
	}

	.market-title {
		font-size: 24px;
		font-weight: 600;
		color: #E8E8E8;
		margin: 0 0 4px 0;
		line-height: 1.3;
	}

	.market-volume {
		font-size: 14px;
		color: #A0A0A0;
		margin: 0;
	}

	.header-right {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 8px;
	}

	.market-date {
		font-size: 16px;
		font-weight: 600;
		color: #E8E8E8;
	}

	.header-icons {
		display: flex;
		gap: 8px;
	}

	.icon-btn {
		width: 32px;
		height: 32px;
		background: transparent;
		border: 1px solid #3A4055;
		border-radius: 6px;
		color: #999999;
		cursor: pointer;
		transition: all 200ms ease-out;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-btn:hover {
		color: #CCCCCC;
		border-color: #4A5065;
	}

	.polymarket-watermark {
		font-size: 12px;
		color: #666666;
		font-weight: 400;
	}

	/* Tabs Section */
	.tabs-section {
		border-bottom: 1px solid #2A2F45;
	}

	.tabs {
		display: flex;
		padding: 0 24px;
		gap: 32px;
	}

	.tab {
		background: none;
		border: none;
		padding: 16px 0;
		font-size: 14px;
		font-weight: 500;
		color: #999999;
		cursor: pointer;
		position: relative;
		transition: color 200ms ease-out;
	}

	.tab:hover {
		color: #CCCCCC;
	}

	.tab.active {
		color: #E8E8E8;
	}

	.tab.active::after {
		content: '';
		position: absolute;
		bottom: -1px;
		left: 0;
		right: 0;
		height: 3px;
		background: #F97316;
		border-radius: 2px 2px 0 0;
	}

	/* Main Content */
	.market-content {
		display: grid;
		grid-template-columns: 1fr 340px;
		gap: 24px;
		padding: 24px;
		align-items: start;
	}

	.left-column {
		display: flex;
		flex-direction: column;
		overflow-y: auto;
	}

	/* Outcomes Section */
	.outcomes-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
	}

	.outcomes-header h2 {
		font-size: 20px;
		font-weight: 600;
		color: #E8E8E8;
		margin: 0;
	}

	.chart-watermark {
		font-size: 12px;
		color: #666666;
	}

	.outcomes-container {
		background: #000000;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		padding: 24px;
		margin-bottom: 16px;
		min-height: 400px;
	}

	.outcomes-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.outcome-row {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 24px;
		align-items: center;
		padding: 20px;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 8px;
		border-left: 3px solid #F97316;
		transition: all 200ms ease-out;
	}

	.outcome-row:hover {
		background: rgba(255, 255, 255, 0.06);
		border-left-color: #00D084;
	}

	.outcome-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.outcome-title {
		font-size: 18px;
		font-weight: 600;
		color: #E8E8E8;
	}

	.outcome-volume {
		font-size: 13px;
		color: #A0A0A0;
	}

	.outcome-stats {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}

	.outcome-percentage-large {
		font-size: 32px;
		font-weight: 700;
		color: #F97316;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
	}

	.outcome-change {
		font-size: 12px;
	}

	.change-indicator {
		font-weight: 500;
	}

	.change-indicator.positive {
		color: #00D084;
	}

	.change-indicator.negative {
		color: #FF4757;
	}

	.outcome-actions {
		display: flex;
		gap: 12px;
	}

	.buy-yes-btn,
	.buy-no-btn {
		padding: 12px 20px;
		border-radius: 6px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: all 200ms ease-out;
		white-space: nowrap;
	}

	.buy-yes-btn {
		background: #00D084;
		color: #ffffff;
	}

	.buy-yes-btn:hover {
		background: #00B570;
		transform: scale(1.02);
	}

	.buy-no-btn {
		background: rgba(255, 71, 87, 0.2);
		color: #FF4757;
		border: 1px solid #FF4757;
	}

	.buy-no-btn:hover {
		background: rgba(255, 71, 87, 0.3);
		transform: scale(1.02);
	}

	/* Legacy chart styles (kept for compatibility) */
	.chart-container {
		background: #000000;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		padding: 20px;
		margin-bottom: 16px;
		height: 450px;
	}

	.chart-wrapper {
		width: 100%;
		height: 100%;
		position: relative;
	}

	#priceChart {
		width: 100%;
		height: 100%;
	}

	.chart-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #A0A0A0;
	}

	/* Time Intervals */
	.time-intervals {
		display: flex;
		gap: 8px;
		margin-bottom: 16px;
	}

	.interval-btn {
		padding: 6px 12px;
		background: transparent;
		border: 1px solid #3A4055;
		border-radius: 6px;
		color: #999999;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 200ms ease-in-out;
	}

	.interval-btn:hover {
		border-color: #F97316;
		color: #CCCCCC;
	}

	.interval-btn.active {
		background: #F97316;
		border-color: #F97316;
		color: #ffffff;
	}

	/* Chart Toolbar */
	.chart-toolbar {
		display: flex;
		gap: 8px;
		margin-bottom: 16px;
	}

	.toolbar-btn {
		padding: 8px;
		background: transparent;
		border: none;
		color: #999999;
		cursor: pointer;
		border-radius: 6px;
		transition: all 200ms ease-out;
	}

	.toolbar-btn:hover {
		background: #1F2339;
		color: #CCCCCC;
	}

	.terms-text {
		font-size: 12px;
		color: #999999;
		text-align: center;
		margin-top: auto;
	}

	.terms-link {
		color: #F97316;
		text-decoration: none;
	}

	.terms-link:hover {
		text-decoration: underline;
	}

	/* Right Panel */
	.right-panel {
		display: flex;
		flex-direction: column;
	}

	.trading-interface {
		background: #000000;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.panel-header {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.panel-date {
		font-size: 16px;
		font-weight: 600;
		color: #E8E8E8;
	}

	.trade-tabs {
		display: flex;
		gap: 16px;
	}

	.trade-tab {
		background: none;
		border: none;
		padding: 8px 0;
		font-size: 14px;
		font-weight: 500;
		color: #999999;
		cursor: pointer;
		position: relative;
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.trade-tab.active {
		color: #E8E8E8;
	}

	.trade-tab.active::after {
		content: '';
		position: absolute;
		bottom: -2px;
		left: 0;
		right: 0;
		height: 2px;
		background: #F97316;
	}

	.trade-tab.dropdown svg {
		width: 12px;
		height: 12px;
	}

	/* Outcome Boxes */
	.outcome-boxes {
		display: flex;
		gap: 12px;
	}

	.outcome-box {
		flex: 1;
		background: transparent;
		border: 2px solid #3A4055;
		border-radius: 8px;
		padding: 12px 16px;
		cursor: pointer;
		transition: all 200ms ease-out;
		text-align: center;
	}

	.outcome-box:hover {
		border-color: #4A5065;
	}

	.outcome-box.active {
		border-color: #00D084;
		background: rgba(0, 208, 132, 0.05);
	}

	.outcome-label {
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		color: #999999;
		display: block;
		margin-bottom: 4px;
	}

	.outcome-box.active .outcome-label {
		color: #00D084;
	}

	.outcome-price {
		font-size: 18px;
		font-weight: 700;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		color: #E8E8E8;
	}

	.outcome-box.active .outcome-price {
		color: #00D084;
	}

	/* Amount Section */
	.amount-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.amount-label {
		font-size: 12px;
		font-weight: 600;
		color: #999999;
	}

	.amount-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.amount-input {
		width: 100%;
		background: transparent;
		border: none;
		border-bottom: 2px solid #2A2F45;
		padding: 8px 0;
		padding-left: 20px;
		font-size: 28px;
		font-weight: 700;
		color: #E8E8E8;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		text-align: right;
	}

	.amount-input.sell-mode {
		padding-left: 0;
	}

	.amount-input:focus {
		outline: none;
		border-bottom-color: #F97316;
	}

	.amount-currency {
		position: absolute;
		left: 0;
		font-size: 28px;
		font-weight: 700;
		color: #E8E8E8;
		pointer-events: none;
	}

	.amount-suffix {
		font-size: 14px;
		font-weight: 600;
		color: #999999;
		white-space: nowrap;
	}

	.quick-amounts {
		display: flex;
		gap: 8px;
	}

	.quick-btn {
		flex: 1;
		padding: 6px 10px;
		background: #0F1621;
		border: 1px solid #3A4055;
		border-radius: 6px;
		color: #999999;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 200ms ease-out;
	}

	.quick-btn:hover {
		border-color: #F97316;
		color: #CCCCCC;
	}

	/* To Win Section */
	.to-win-section {
		background: rgba(128, 128, 128, 0.1);
		border-radius: 8px;
		padding: 16px;
	}

	.to-win-header {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 8px;
	}

	.to-win-header span {
		font-size: 13px;
		font-weight: 600;
		color: #E8E8E8;
	}

	.avg-price-row {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 8px;
	}

	.avg-price-row span {
		font-size: 11px;
		color: #999999;
	}

	.info-icon {
		color: #999999;
		cursor: help;
	}

	.to-win-amount {
		font-size: 28px;
		font-weight: 700;
		color: #00D084;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		text-align: right;
	}

	/* Trade Button */
	.session-indicator {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: #10b981;
		font-weight: 600;
		margin-bottom: 8px;
		justify-content: center;
	}

	.session-dot-sm {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #10b981;
		animation: sessionPulse 2s ease-in-out infinite;
	}

	@keyframes sessionPulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.trade-button {
		width: 100%;
		padding: 14px 16px;
		background: #F97316;
		border: none;
		border-radius: 8px;
		color: #ffffff;
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
		transition: all 200ms ease-out;
	}

	.trade-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		background: #3A4055;
	}

	.trade-button:hover {
		background: #0088DD;
		transform: scale(1.02);
	}

	.trade-button:active {
		background: #0077CC;
	}

	.panel-footer {
		font-size: 11px;
		color: #666666;
		text-align: center;
	}

	/* Resolution Content */
	.resolution-content {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.resolution-section {
		background: #000000;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		padding: 16px;
	}

	.section-header h3 {
		font-size: 16px;
		font-weight: 600;
		color: #E8E8E8;
		margin: 0 0 12px 0;
	}

	.section-content p {
		font-size: 14px;
		line-height: 1.6;
		color: #CCCCCC;
		margin: 0 0 12px 0;
	}

	.show-more {
		background: none;
		border: none;
		color: #F97316;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		padding: 0;
	}

	.show-more:hover {
		text-decoration: underline;
	}

	/* Resolution Outcome Styles */
	.outcome-section {
		background: linear-gradient(135deg, #1E2139 0%, #252A45 100%);
		border: 1px solid #3A4055;
	}

	.outcome-result {
		margin-bottom: 16px;
	}

	.resolved-badge {
		display: inline-block;
		padding: 12px 20px;
		border-radius: 8px;
		font-size: 16px;
		font-weight: 700;
		border: 2px solid;
		text-align: center;
	}

	.resolved-badge.resolved-yes {
		background: rgba(0, 208, 132, 0.15);
		border-color: #00D084;
		color: #00D084;
	}

	.resolved-badge.resolved-no {
		background: rgba(255, 71, 87, 0.15);
		border-color: #FF4757;
		color: #FF4757;
	}

	.resolved-badge.resolved-pending {
		background: rgba(249, 115, 22, 0.15);
		border-color: #F97316;
		color: #F97316;
	}

	.resolved-badge.resolved-active {
		background: rgba(0, 208, 132, 0.15);
		border-color: #00D084;
		color: #00D084;
	}

	.resolution-date,
	.resolution-info {
		color: #A0A0A0;
		font-size: 14px;
		margin: 8px 0 0 0;
		line-height: 1.6;
	}

	/* Loading States */
	.loading-skeleton {
		padding: 24px;
	}

	.skeleton-header,
	.skeleton-content {
		background: #000000;
		border-radius: 12px;
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	.skeleton-header {
		height: 100px;
		margin-bottom: 24px;
	}

	.skeleton-content {
		height: 600px;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.7;
		}
	}

	/* Error States */
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 400px;
		text-align: center;
		color: #A0A0A0;
		gap: 16px;
	}

	.retry-btn {
		background: #F97316;
		color: #ffffff;
		border: none;
		padding: 12px 24px;
		border-radius: 6px;
		cursor: pointer;
		font-weight: 600;
		transition: all 200ms ease-out;
	}

	.retry-btn:hover {
		background: #0088DD;
		transform: scale(1.02);
	}

	/* Responsive */
	@media (max-width: 1024px) {
		.market-content {
			grid-template-columns: 1fr;
		}
		
		.right-panel {
			position: static;
			order: -1;
		}
	}

	@media (max-width: 768px) {
		.market-header {
			flex-direction: column;
			gap: 16px;
			align-items: flex-start;
		}
		
		.header-right {
			width: 100%;
			flex-direction: row;
			justify-content: space-between;
			align-items: center;
		}
		
		.market-title {
			font-size: 20px;
		}
		
		.current-price {
			font-size: 28px;
		}
		
		.chart-container {
			height: 300px;
		}
		
		.market-content {
			padding: 16px;
			gap: 16px;
		}
	}

	/* Modal Styles */
	/* Polymock Modal System */
	.pm-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1001;
		animation: pmFadeIn 0.2s ease-out;
	}

	@keyframes pmFadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.pm-modal {
		background: #0a0a0a;
		border: 1px solid #2a2a2a;
		border-radius: 20px;
		padding: 36px 32px;
		max-width: 420px;
		width: 90vw;
		text-align: center;
		animation: pmSlideUp 0.3s ease-out;
	}

	@keyframes pmSlideUp {
		from { opacity: 0; transform: translateY(20px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.pm-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		margin: 0 auto 20px auto;
	}

	.pm-dot.pending {
		background: #F97316;
		box-shadow: 0 0 16px rgba(249, 115, 22, 0.4);
		animation: pmPulse 2s ease-in-out infinite;
	}

	.pm-dot.success {
		background: #10b981;
		box-shadow: 0 0 16px rgba(16, 185, 129, 0.5);
		animation: pmPulse 2s ease-in-out infinite;
	}

	.pm-dot.error {
		background: #ef4444;
		box-shadow: 0 0 16px rgba(239, 68, 68, 0.5);
		animation: pmPulse 2s ease-in-out infinite;
	}

	@keyframes pmPulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.pm-title {
		color: #ffffff;
		font-size: 22px;
		font-weight: 700;
		margin: 0 0 12px 0;
		letter-spacing: -0.5px;
	}

	.pm-title.success-title { color: #10b981; }
	.pm-title.error-title { color: #ef4444; }

	.pm-desc {
		color: #8b92ab;
		font-size: 14px;
		line-height: 1.6;
		margin: 0 0 24px 0;
	}

	.pm-details {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		padding: 16px;
		margin-bottom: 24px;
		text-align: left;
	}

	.pm-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 6px 0;
	}

	.pm-row + .pm-row {
		border-top: 1px solid #1a1a1a;
		margin-top: 6px;
		padding-top: 12px;
	}

	.pm-row.highlight {
		padding: 10px;
		margin: 6px -8px 0;
		background: rgba(249, 115, 22, 0.08);
		border: 1px solid rgba(249, 115, 22, 0.25);
		border-radius: 8px;
	}

	.pm-label {
		color: #666;
		font-size: 13px;
	}

	.pm-value {
		color: #ccc;
		font-size: 13px;
		font-weight: 600;
	}

	.pm-value.highlight-value { color: #F97316; }
	.pm-value.sl-value { color: #ef4444; }
	.pm-value.tp-value { color: #10b981; }

	.pm-actions {
		display: flex;
		gap: 12px;
	}

	.pm-btn {
		flex: 1;
		padding: 14px;
		border: none;
		border-radius: 12px;
		font-size: 15px;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s;
		letter-spacing: -0.3px;
	}

	.pm-btn.primary {
		background: #F97316;
		color: #000;
		width: 100%;
	}

	.pm-btn.primary:hover:not(:disabled) {
		background: #ea580c;
	}

	.pm-btn.primary:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.pm-btn.secondary {
		background: transparent;
		color: #8b92ab;
		border: 1px solid #2a2a2a;
	}

	.pm-btn.secondary:hover {
		border-color: #444;
		color: #ccc;
	}

	.pm-btn.success-btn {
		background: transparent;
		color: #10b981;
		border: 1px solid #10b981;
	}

	.pm-btn.success-btn:hover {
		background: rgba(16, 185, 129, 0.1);
	}

	.pm-btn.error-btn {
		background: transparent;
		color: #ef4444;
		border: 1px solid #ef4444;
	}

	.pm-btn.error-btn:hover {
		background: rgba(239, 68, 68, 0.1);
	}

	/* Advanced Settings (SL/TP) Styles */
	.advanced-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.advanced-header {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-bottom: 8px;
		border-bottom: 1px solid #2A2F45;
	}

	.advanced-title {
		font-size: 13px;
		font-weight: 600;
		color: #E8E8E8;
		letter-spacing: 0.01em;
	}

	.advanced-subtitle {
		font-size: 11px;
		color: #666666;
		font-weight: 400;
	}

	.advanced-content {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.sltp-info {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 10px;
		background: rgba(249, 115, 22, 0.1);
		border-left: 3px solid #F97316;
		border-radius: 4px;
		font-size: 12px;
		color: #A0A0A0;
		line-height: 1.5;
	}

	.sltp-info svg {
		flex-shrink: 0;
		margin-top: 2px;
		color: #F97316;
	}

	.sltp-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.sltp-input-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.sltp-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}

	.sltp-label-text {
		font-size: 11px;
		font-weight: 700;
		color: #999999;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.sltp-label-badge {
		display: inline-block;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.05em;
	}

	.sl-badge {
		background: rgba(255, 71, 87, 0.15);
		color: #FF4757;
		border: 1px solid rgba(255, 71, 87, 0.3);
	}

	.tp-badge {
		background: rgba(0, 208, 132, 0.15);
		color: #00D084;
		border: 1px solid rgba(0, 208, 132, 0.3);
	}

	.sltp-description {
		font-size: 10px;
		color: #666666;
		line-height: 1.4;
	}

	.sltp-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.sltp-input {
		width: 100%;
		background: #000000;
		border: 1px solid #3A4055;
		border-radius: 6px;
		padding: 10px 32px 10px 12px;
		font-size: 16px;
		font-weight: 600;
		color: #E8E8E8;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
	}

	.sltp-input:focus {
		outline: none;
		border-color: #F97316;
	}

	.sltp-input::placeholder {
		color: #4A5065;
		font-weight: 400;
	}

	.sltp-currency {
		position: absolute;
		right: 12px;
		font-size: 14px;
		font-weight: 600;
		color: #999999;
		pointer-events: none;
	}

	.sltp-active-summary {
		padding: 12px;
		background: rgba(249, 115, 22, 0.05);
		border: 1px solid rgba(249, 115, 22, 0.2);
		border-radius: 6px;
	}

	.sltp-active-title {
		font-size: 11px;
		font-weight: 700;
		color: #999999;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 10px;
	}

	.sltp-active-items {
		display: flex;
		gap: 12px;
	}

	.sltp-active-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 6px;
	}

	.sltp-badge {
		display: inline-block;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.05em;
	}

	.sltp-active-value {
		font-size: 13px;
		font-weight: 700;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
	}

	.sltp-active-item.sl .sltp-active-value {
		color: #FF4757;
	}

	.sltp-active-item.tp .sltp-active-value {
		color: #00D084;
	}

	/* Toast Notification */
	.toast {
		position: fixed;
		top: 16px;
		right: 16px;
		z-index: 10000;
		width: 320px;
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 4px;
		padding: 12px 14px;
		animation: toast-in 0.25s ease-out forwards;
	}

	.toast.success {
		border-left: 3px solid #00D084;
	}

	.toast.error {
		border-left: 3px solid #FF4757;
	}

	.toast-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}

	.toast-icon {
		font-size: 14px;
		font-weight: 700;
		line-height: 1;
	}

	.toast.success .toast-icon {
		color: #00D084;
	}

	.toast.error .toast-icon {
		color: #FF4757;
	}

	.toast-title {
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.03em;
	}

	.toast.success .toast-title {
		color: #00D084;
	}

	.toast.error .toast-title {
		color: #FF4757;
	}

	.toast-close {
		margin-left: auto;
		background: none;
		border: none;
		color: #666;
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
		padding: 0 2px;
	}

	.toast-close:hover {
		color: #fff;
	}

	.toast-msg {
		font-size: 12px;
		font-weight: 400;
		color: #ccc;
		line-height: 1.4;
		margin: 0;
		padding-left: 22px;
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateX(20px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	:global(.light-mode) .toast {
		background: #fff;
		border-color: #e0e0e0;
	}

	:global(.light-mode) .toast-close {
		color: #999;
	}

	:global(.light-mode) .toast-close:hover {
		color: #333;
	}

	:global(.light-mode) .toast-msg {
		color: #555;
	}
</style>