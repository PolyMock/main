<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import PriceChart from '$lib/components/PriceChart.svelte';
	import MarketInfoPanel from '$lib/components/MarketInfoPanel.svelte';
	import TimeIntervalSelector from '$lib/components/TimeIntervalSelector.svelte';
	import type { PolyMarket } from '$lib/polymarket';

	let marketId: string;
	let market: PolyMarket | null = null;
	let chartData: any[] = [];
	let selectedInterval = '1h';
	let loading = true;
	let error = '';
	let selectedOutcome = 'Yes';

	$: marketId = $page.params.id;

	async function fetchMarketData(id: string): Promise<PolyMarket | null> {
		try {
			const response = await fetch(`/api/markets/${id}`);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const data = await response.json();
			return data;
		} catch (err) {
			console.error('Failed to fetch market data:', err);
			return null;
		}
	}

	async function fetchChartData(id: string, interval: string): Promise<any[]> {
		try {
			const response = await fetch(`/api/markets/${id}/chart?interval=${interval}`);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
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

	onMount(() => {
		if (marketId) {
			loadMarketDetails();
		}
	});

	$: if (marketId) {
		loadMarketDetails();
	}
</script>

<svelte:head>
	<title>{market?.question || 'Market Details'} - PolyPaper</title>
</svelte:head>

<div class="market-detail">
	<!-- Header -->
	<div class="market-header">
		<button class="back-button" on:click={handleBack}>
			← Back
		</button>
		<h1 class="market-title">
			{#if loading}
				Loading...
			{:else if market}
				{market.question || 'Unknown Market'}
			{:else}
				Market Not Found
			{/if}
		</h1>
		<div class="header-actions">
			<button class="info-button">⋮</button>
		</div>
	</div>

	{#if error}
		<div class="error-state">
			<p>{error}</p>
			<button on:click={loadMarketDetails}>Retry</button>
		</div>
	{:else if loading}
		<div class="loading-skeleton">
			<div class="skeleton-chart"></div>
			<div class="skeleton-panel"></div>
		</div>
	{:else if market}
		<!-- Main Content -->
		<div class="market-content">
			<!-- Left Column - Chart -->
			<div class="chart-section">
				<div class="chart-container">
					<PriceChart 
						data={chartData} 
						outcome={selectedOutcome}
						loading={loading}
					/>
					
					<TimeIntervalSelector 
						{selectedInterval}
						onIntervalChange={handleIntervalChange}
					/>
				</div>

				<!-- Outcome Selector -->
				<div class="outcome-selector">
					<button 
						class="outcome-btn yes-btn"
						class:active={selectedOutcome === 'Yes'}
						on:click={() => selectedOutcome = 'Yes'}
					>
						YES
					</button>
					<button 
						class="outcome-btn no-btn"
						class:active={selectedOutcome === 'No'}
						on:click={() => selectedOutcome = 'No'}
					>
						NO
					</button>
				</div>
			</div>

			<!-- Right Column - Market Info -->
			<div class="info-section">
				<MarketInfoPanel {market} />
			</div>
		</div>
	{:else}
		<div class="error-state">
			<p>Market not found</p>
			<button on:click={handleBack}>Go Back</button>
		</div>
	{/if}
</div>

<style>
	.market-detail {
		min-height: 100vh;
		background: #0A0E27;
		color: #E8E8E8;
	}

	.market-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 24px;
		border-bottom: 1px solid #2A2F45;
		background: #151B2F;
	}

	.back-button {
		background: transparent;
		border: 1px solid #2A2F45;
		color: #E8E8E8;
		padding: 8px 16px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 14px;
		transition: all 200ms ease-out;
	}

	.back-button:hover {
		border-color: #00D084;
		background: rgba(0, 208, 132, 0.1);
	}

	.market-title {
		flex: 1;
		margin: 0 24px;
		font-size: 20px;
		font-weight: 600;
		text-align: center;
	}

	.info-button {
		background: transparent;
		border: 1px solid #2A2F45;
		color: #A0A0A0;
		padding: 8px 12px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 16px;
		transition: all 200ms ease-out;
	}

	.info-button:hover {
		color: #E8E8E8;
		border-color: #3A4055;
	}

	.market-content {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 24px;
		padding: 24px;
		min-height: calc(100vh - 80px);
	}

	.chart-section {
		display: flex;
		flex-direction: column;
	}

	.chart-container {
		background: #151B2F;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		padding: 24px;
		flex: 1;
		min-height: 400px;
	}

	.outcome-selector {
		display: flex;
		gap: 8px;
		margin-top: 16px;
	}

	.outcome-btn {
		flex: 1;
		padding: 12px;
		border: 1px solid;
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.2);
		cursor: pointer;
		font-weight: 600;
		font-size: 14px;
		transition: all 200ms ease-out;
	}

	.yes-btn {
		border-color: #00D084;
		color: #00D084;
	}

	.yes-btn:hover, .yes-btn.active {
		background: rgba(0, 208, 132, 0.1);
	}

	.no-btn {
		border-color: #FF4757;
		color: #FF4757;
	}

	.no-btn:hover, .no-btn.active {
		background: rgba(255, 71, 87, 0.1);
	}

	.info-section {
		display: flex;
		flex-direction: column;
	}

	.loading-skeleton {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 24px;
		padding: 24px;
	}

	.skeleton-chart {
		background: #151B2F;
		border-radius: 12px;
		height: 500px;
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	.skeleton-panel {
		background: #151B2F;
		border-radius: 12px;
		height: 600px;
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.7;
		}
	}

	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 400px;
		text-align: center;
		color: #A0A0A0;
	}

	.error-state button {
		margin-top: 16px;
		background: #00D084;
		color: #ffffff;
		border: none;
		padding: 12px 24px;
		border-radius: 6px;
		cursor: pointer;
		font-weight: 600;
		transition: all 200ms ease-out;
	}

	.error-state button:hover {
		background: #00B570;
		transform: scale(1.02);
	}

	/* Responsive */
	@media (max-width: 1024px) {
		.market-content {
			grid-template-columns: 1fr;
		}
		
		.info-section {
			order: -1;
		}
	}

	@media (max-width: 768px) {
		.market-header {
			padding: 16px;
		}
		
		.market-title {
			font-size: 16px;
			margin: 0 16px;
		}
		
		.market-content {
			padding: 16px;
			gap: 16px;
		}
	}
</style>