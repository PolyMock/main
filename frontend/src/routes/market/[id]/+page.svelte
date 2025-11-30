<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { PolyMarket } from '$lib/polymarket';

	let marketId: string;
	let market: PolyMarket | null = null;
	let chartData: any[] = [];
	let selectedInterval = '1D';
	let selectedTab = 'Graph';
	let selectedOutcome = 'Yes';
	let tradeAmount = 100;
	let loading = true;
	let error = '';

	$: marketId = $page.params.id || '';
	$: yesPrice = market?.yesPrice || 0;
	$: noPrice = market?.noPrice || 0;
	$: currentPrice = selectedOutcome === 'Yes' ? yesPrice : noPrice;
	$: sharesToWin = tradeAmount / currentPrice;
	$: avgPriceFormatted = formatPrice(currentPrice);
	$: toWinAmount = sharesToWin;
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
		if (amount === -1) { // Max
			tradeAmount = 1000; 
		} else {
			tradeAmount += amount;
		}
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
	<title>{market?.question || 'Market Details'} - PolyPaper</title>
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
				<div class="market-date">{market.end_date_iso ? formatDate(market.end_date_iso) : 'November 30'}</div>
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
			</div>
		</div>

		<!-- Main Content -->
		<div class="market-content">
			<!-- Left Column -->
			<div class="left-column">
				{#if selectedTab === 'Graph'}
					<!-- Chart Header -->
					<div class="chart-header">
						<div class="price-display">
							<div class="current-price">{(currentPrice * 100).toFixed(0)}% chance</div>
							<div class="price-change {priceChangePercent < 0 ? 'negative' : 'positive'}">
								{priceChangePercent < 0 ? '▼' : '▲'}{Math.abs(priceChangePercent)}%
							</div>
						</div>
						<div class="chart-watermark">Polymarket</div>
					</div>

					<!-- Chart Container -->
					<div class="chart-container">
						<div class="chart-wrapper">
							{#if chartData.length > 0}
								<canvas id="priceChart" width="800" height="400"></canvas>
							{:else}
								<div class="chart-placeholder">
									<p>Loading chart data...</p>
								</div>
							{/if}
						</div>
					</div>

					<!-- Time Intervals -->
					<div class="time-intervals">
						{#each ['1H', '6H', '1D', '1W', '1M', 'ALL'] as interval}
							<button 
								class="interval-btn"
								class:active={selectedInterval === interval}
								on:click={() => handleIntervalChange(interval)}
							>
								{interval}
							</button>
						{/each}
					</div>

					<!-- Chart Toolbar -->
					<div class="chart-toolbar">
						<button class="toolbar-btn">
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
								<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
								<polyline points="16,6 12,2 8,6"/>
								<line x1="12" x2="12" y1="2" y2="15"/>
							</svg>
						</button>
						<button class="toolbar-btn">
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
								<path d="M3 6h18"/>
								<path d="M3 12h18"/>
								<path d="M3 18h18"/>
							</svg>
						</button>
						<button class="toolbar-btn">
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
								<polyline points="16,18 22,12 16,6"/>
								<polyline points="8,6 2,12 8,18"/>
							</svg>
						</button>
						<button class="toolbar-btn">
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
								<circle cx="12" cy="12" r="3"/>
								<path d="M12 1v6"/>
								<path d="M12 17v6"/>
								<path d="m4.22 4.22 4.24 4.24"/>
								<path d="m15.54 15.54 4.24 4.24"/>
								<path d="M1 12h6"/>
								<path d="M17 12h6"/>
								<path d="m4.22 19.78 4.24-4.24"/>
								<path d="m15.54 8.46 4.24-4.24"/>
							</svg>
						</button>
					</div>

					<!-- Terms -->
					<div class="terms-text">
						By trading, you agree to the <a href="#" class="terms-link">Terms of Use</a>.
					</div>

				{:else if selectedTab === 'Resolution'}
					<!-- Resolution Content -->
					<div class="resolution-content">
						<div class="resolution-section">
							<div class="section-header">
								<h3>Market Description</h3>
							</div>
							<div class="section-content">
								<p>{market.description || 'In the past week, significant developments have emerged regarding the potential release of Jeffrey Epstein-related files by the Trump administration. On November 19, 2025, reports surfaced indicating that the new administration is considering declassifying various documents...'}</p>
								<button class="show-more">Show more ▼</button>
							</div>
						</div>

						<div class="resolution-section">
							<div class="section-header">
								<h3>Rules</h3>
							</div>
							<div class="section-content">
								<p>This market will resolve to "Yes" if the Trump Administration publicly releases any files pertaining to the illegal activities of Jeffrey Epstein by the resolution date. The release must be official and accessible to the public...</p>
								<button class="show-more">Show more ▼</button>
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
						<div class="panel-date">{market.end_date_iso ? formatDate(market.end_date_iso) : 'November 30'}</div>
						<div class="trade-tabs">
							<button class="trade-tab active">Buy</button>
							<button class="trade-tab">Sell</button>
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
							on:click={() => selectedOutcome = 'Yes'}
						>
							<div class="outcome-label">Yes</div>
							<div class="outcome-price">{formatPrice(yesPrice)}</div>
						</button>
						<button 
							class="outcome-box"
							class:active={selectedOutcome === 'No'}
							on:click={() => selectedOutcome = 'No'}
						>
							<div class="outcome-label">No</div>
							<div class="outcome-price">{formatPrice(noPrice)}</div>
						</button>
					</div>

					<!-- Amount Input -->
					<div class="amount-section">
						<label class="amount-label">Amount</label>
						<div class="amount-input-wrapper">
							<input 
								type="number" 
								bind:value={tradeAmount}
								class="amount-input"
								min="1"
							/>
						</div>
						<div class="quick-amounts">
							<button class="quick-btn" on:click={() => handleQuickAmount(1)}>+$1</button>
							<button class="quick-btn" on:click={() => handleQuickAmount(20)}>+$20</button>
							<button class="quick-btn" on:click={() => handleQuickAmount(100)}>+$100</button>
							<button class="quick-btn" on:click={() => handleQuickAmount(-1)}>Max</button>
						</div>
					</div>

					<!-- To Win Section -->
					<div class="to-win-section">
						<div class="to-win-header">
							<span>To win 🟢</span>
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
					<button class="trade-button">Trade</button>

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

<style>
	.market-detail {
		min-height: 100vh;
		background: #0A0E27;
		color: #E8E8E8;
	}

	/* Header Section */
	.market-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 24px;
		border-bottom: 1px solid #2A2F45;
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

	/* Chart Section */
	.chart-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}

	.price-display {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.current-price {
		font-size: 32px;
		font-weight: 700;
		color: #00B4FF;
	}

	.price-change {
		font-size: 14px;
		font-weight: 500;
	}

	.price-change.positive {
		color: #00D084;
	}

	.price-change.negative {
		color: #FF4757;
	}

	.chart-watermark {
		font-size: 12px;
		color: #666666;
	}

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
	}

	.amount-input {
		width: 100%;
		background: transparent;
		border: none;
		border-bottom: 2px solid #2A2F45;
		padding: 8px 0;
		font-size: 28px;
		font-weight: 700;
		color: #E8E8E8;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		text-align: right;
	}

	.amount-input:focus {
		outline: none;
		border-bottom-color: #00B4FF;
	}

	.amount-input::before {
		content: '$';
		position: absolute;
		left: 0;
		top: 50%;
		transform: translateY(-50%);
		font-size: 28px;
		font-weight: 700;
		color: #E8E8E8;
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
</style>