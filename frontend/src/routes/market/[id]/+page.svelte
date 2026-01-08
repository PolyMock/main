<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { PolyMarket } from '$lib/polymarket';
	import { walletStore, refreshUserBalance } from '$lib/wallet/stores';
	import { polymarketService } from '$lib/solana/polymarket-service';
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

	// Modal state
	let showConfirmModal = false;
	let showSuccessModal = false;
	let showErrorModal = false;
	let modalTitle = '';
	let modalMessage = '';
	let modalDetails: any = null;
	let pendingTrade: (() => Promise<void>) | null = null;
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
	$: priceChangePercent = -27; 

	async function fetchMarketData(id: string): Promise<PolyMarket | null> {
		try {
			console.log('Fetching market data for ID:', id);
			const response = await fetch(`/api/markets/${id}`);
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`);
			}
			const data = await response.json();
			console.log('Market data received:', data);
			return data;
		} catch (err) {
			console.error('Failed to fetch market data:', err);
			return null;
		}
	}

	async function fetchChartData(id: string, interval: string): Promise<any[]> {
		try {
			console.log('Fetching chart data for:', id, 'interval:', interval);
			const response = await fetch(`/api/markets/${id}/chart?interval=${interval.toLowerCase()}`);
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`);
			}
			const data = await response.json();
			console.log('Chart data received:', data);
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
			showErrorModal = true;
			modalTitle = 'Wallet Not Connected';
			modalMessage = 'Please connect your wallet first!';
			return;
		}

		// Validate trade parameters
		if (!tradeAmount || tradeAmount <= 0) {
			showErrorModal = true;
			modalTitle = 'Invalid Amount';
			modalMessage = 'Please enter a valid trade amount';
			return;
		}

		// Check if user has sufficient balance
		if (tradeAmount > walletState.usdcBalance) {
			showErrorModal = true;
			modalTitle = 'Insufficient Balance';
			modalMessage = `You have ${formatDollar(walletState.usdcBalance)} available.`;
			return;
		}

		if (!selectedOutcome) {
			showErrorModal = true;
			modalTitle = 'No Outcome Selected';
			modalMessage = 'Please select an outcome (Yes or No)';
			return;
		}

		// Calculate trade details
		const price = selectedOutcome === 'Yes' ? yesPrice : noPrice;

		if (price <= 0) {
			showErrorModal = true;
			modalTitle = 'Invalid Price';
			modalMessage = 'Please refresh the page.';
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
				potentialWin: formatDollar(potentialWin)
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
							price
						);
					} else {
						txSignature = await polymarketService.buyNo(
							walletState.adapter,
							marketId,
							tradeAmount,
							price
						);
					}

					// Show success modal
					modalTitle = 'Trade Successful!';
					modalMessage = `Transaction: ${txSignature.slice(0, 20)}...`;
					showSuccessModal = true;

					// Refresh user balance after successful trade
					if (walletState.publicKey) {
						await refreshUserBalance(new PublicKey(walletState.publicKey.toString()));
					}

					// Reset trade amount
					tradeAmount = 100;
				} catch (error: any) {
					console.error('Trade failed:', error);
					showErrorModal = true;
					modalTitle = 'Trade Failed';
					modalMessage = error.message || 'Unknown error occurred';
				} finally {
					trading = false;
				}
			};
		} else {
			// Sell logic
			if (!selectedPosition) {
				showErrorModal = true;
				modalTitle = 'No Position Selected';
				modalMessage = 'Please select a position to sell.';
				return;
			}

			// TradeAmount is already in shares for sell mode
			const sharesToSell = tradeAmount;
			const remainingShares = selectedPosition.remainingShares;

			if (sharesToSell <= 0 || sharesToSell > remainingShares) {
				showErrorModal = true;
				modalTitle = 'Invalid Amount';
				modalMessage = `You can only sell up to ${remainingShares.toFixed(2)} shares.`;
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

					// Show success modal
					modalTitle = 'Sell Successful!';
					modalMessage = `Transaction: ${txSignature.slice(0, 20)}...`;
					showSuccessModal = true;

					// Refresh user balance and positions after successful sell
					if (walletState.publicKey) {
						await refreshUserBalance(new PublicKey(walletState.publicKey.toString()));
						await loadUserPositions();
					}

					// Reset trade amount
					tradeAmount = 100;
				} catch (error: any) {
					console.error('Sell failed:', error);
					showErrorModal = true;
					modalTitle = 'Sell Failed';
					modalMessage = error.message || 'Unknown error occurred';
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
		showSuccessModal = false;
		showErrorModal = false;
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
		ctx.fillStyle = '#151B2F';
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
		ctx.strokeStyle = '#00B4FF';
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
		ctx.fillStyle = '#00B4FF';
		chartData.forEach((point, index) => {
			const x = padding.left + (chartWidth / (chartData.length - 1)) * index;
			const y = padding.top + chartHeight - ((point.close - minPrice) / priceRange) * chartHeight;
			
			ctx.beginPath();
			ctx.arc(x, y, 3, 0, 2 * Math.PI);
			ctx.fill();
		});
	}

	onMount(() => {
		if (marketId) {
			loadMarketDetails();
		}
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
							{tradeMode === 'buy' ? 'Buy' : 'Sell'}
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
<div class="modal-overlay" on:click={cancelTrade}>
	<div class="modal-content" on:click|stopPropagation>
		<div class="modal-header">
			<h3>{modalTitle}</h3>
			<button class="modal-close" on:click={cancelTrade}>×</button>
		</div>
		<div class="modal-body">
			{#if modalDetails}
			<div class="trade-summary">
				<div class="summary-row">
					<span class="summary-label">Action:</span>
					<span class="summary-value">{modalDetails.action}</span>
				</div>
				<div class="summary-row">
					<span class="summary-label">Amount:</span>
					<span class="summary-value">{modalDetails.amount}</span>
				</div>
				<div class="summary-row">
					<span class="summary-label">Price:</span>
					<span class="summary-value">{modalDetails.price}</span>
				</div>
				<div class="summary-row">
					<span class="summary-label">Shares:</span>
					<span class="summary-value">{modalDetails.shares}</span>
				</div>
				<div class="summary-row highlight">
					<span class="summary-label">Potential Win:</span>
					<span class="summary-value">{modalDetails.potentialWin}</span>
				</div>
			</div>
			{/if}
		</div>
		<div class="modal-footer">
			<button class="modal-btn cancel-btn" on:click={cancelTrade}>Cancel</button>
			<button class="modal-btn confirm-btn" on:click={confirmTrade} disabled={trading}>
				{trading ? 'Processing...' : 'Confirm Trade'}
			</button>
		</div>
	</div>
</div>
{/if}

<!-- Success Modal -->
{#if showSuccessModal}
<div class="modal-overlay" on:click={closeModal}>
	<div class="modal-content success-modal" on:click|stopPropagation>
		<div class="modal-header">
			<h3>✓ {modalTitle}</h3>
			<button class="modal-close" on:click={closeModal}>×</button>
		</div>
		<div class="modal-body">
			<p class="modal-message">{modalMessage}</p>
		</div>
		<div class="modal-footer">
			<button class="modal-btn confirm-btn" on:click={closeModal}>Close</button>
		</div>
	</div>
</div>
{/if}

<!-- Error Modal -->
{#if showErrorModal}
<div class="modal-overlay" on:click={closeModal}>
	<div class="modal-content error-modal" on:click|stopPropagation>
		<div class="modal-header">
			<h3>⚠ {modalTitle}</h3>
			<button class="modal-close" on:click={closeModal}>×</button>
		</div>
		<div class="modal-body">
			<p class="modal-message">{modalMessage}</p>
		</div>
		<div class="modal-footer">
			<button class="modal-btn confirm-btn" on:click={closeModal}>Close</button>
		</div>
	</div>
</div>
{/if}

<style>
	.market-detail {
		min-height: 100vh;
		background: #0A0E27;
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
		background: #151B2F;
	}

	.market-image-placeholder {
		width: 64px;
		height: 64px;
		border-radius: 8px;
		background: #151B2F;
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
		background: #00B4FF;
		border-radius: 2px 2px 0 0;
	}

	/* Main Content */
	.market-content {
		display: grid;
		grid-template-columns: 1fr 340px;
		gap: 24px;
		padding: 24px;
		min-height: calc(100vh - 200px);
	}

	.left-column {
		display: flex;
		flex-direction: column;
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
		background: #151B2F;
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
		border-left: 3px solid #00B4FF;
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
		color: #00B4FF;
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
		background: #151B2F;
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
		border-color: #00B4FF;
		color: #CCCCCC;
	}

	.interval-btn.active {
		background: #00B4FF;
		border-color: #00B4FF;
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
		color: #00B4FF;
		text-decoration: none;
	}

	.terms-link:hover {
		text-decoration: underline;
	}

	/* Right Panel */
	.right-panel {
		position: sticky;
		top: 24px;
		height: fit-content;
	}

	.trading-interface {
		background: #151B2F;
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
		background: #00B4FF;
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
		border-bottom-color: #00B4FF;
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
		border-color: #00B4FF;
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
	.trade-button {
		width: 100%;
		padding: 14px 16px;
		background: #00B4FF;
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
		background: #151B2F;
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
		color: #00B4FF;
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
		background: rgba(0, 180, 255, 0.15);
		border-color: #00B4FF;
		color: #00B4FF;
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
		background: #151B2F;
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
		background: #00B4FF;
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
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.2s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal-content {
		background: #151B2F;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		min-width: 400px;
		max-width: 500px;
		animation: slideUp 0.3s ease-out;
	}

	@keyframes slideUp {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px;
		border-bottom: 1px solid #2A2F45;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		color: white;
	}

	.success-modal .modal-header h3 {
		color: #00D68F;
	}

	.error-modal .modal-header h3 {
		color: #FF6B6B;
	}

	.modal-close {
		background: none;
		border: none;
		color: #8B92AB;
		font-size: 28px;
		cursor: pointer;
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.2s;
	}

	.modal-close:hover {
		color: white;
	}

	.modal-body {
		padding: 24px 20px;
	}

	.trade-summary {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.summary-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px;
		background: #0A0E1A;
		border-radius: 8px;
	}

	.summary-row.highlight {
		background: rgba(0, 180, 255, 0.1);
		border: 1px solid #00B4FF;
	}

	.summary-label {
		color: #8B92AB;
		font-size: 14px;
	}

	.summary-value {
		color: white;
		font-weight: 600;
		font-size: 16px;
	}

	.modal-message {
		color: #E8E8E8;
		font-size: 14px;
		line-height: 1.6;
		margin: 0;
	}

	.modal-footer {
		display: flex;
		gap: 12px;
		padding: 20px;
		border-top: 1px solid #2A2F45;
		justify-content: flex-end;
	}

	.modal-btn {
		padding: 10px 20px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
	}

	.cancel-btn {
		background: #2A2F45;
		color: #E8E8E8;
	}

	.cancel-btn:hover {
		background: #3A3F55;
	}

	.confirm-btn {
		background: #00B4FF;
		color: white;
	}

	.confirm-btn:hover:not(:disabled) {
		background: #0094D6;
		transform: translateY(-1px);
	}

	.confirm-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>