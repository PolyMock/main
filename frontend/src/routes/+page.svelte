<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { HermesClient } from '@pythnetwork/hermes-client';
	import { polymarketClient, type PolyMarket } from '$lib/polymarket';
	import WalletButton from '$lib/wallet/WalletButton.svelte';
	import { walletStore } from '$lib/wallet/stores';

	const hermesClient = new HermesClient('https://hermes.pyth.network', {});

	const PYTH_FEEDS = {
		SOL: { id: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', name: 'SOL/USD' },
	};

	type PriceData = {
		price: number;
		change: number;
		confidence: number;
		emaPrice: number;
		publishTime: number;
		spread: number;
	};

	let news: any[] = [];
	let polymarkets: PolyMarket[] = [];
	let prices: Record<string, PriceData> = {
		SOL: { price: 0, change: 0, confidence: 0, emaPrice: 0, publishTime: 0, spread: 0 },
	};
	let previousPrices: Record<string, number> = {};
	let command = '';
	let selectedTab = 'MARKETS';
	let currentTime = new Date().toLocaleTimeString();
	let newsLoading = true;
	let showAllNews = false;
	let pythUpdateInterval: any = null;
	let pythLastUpdate = 0;
	let polymarketsLoading = true;
	let selectedMarket: PolyMarket | null = null;
	let connectedWallet: any = null;

	// Subscribe to wallet changes
	walletStore.subscribe(wallet => {
		connectedWallet = wallet;
	});

	function updateTime() {
		currentTime = new Date().toLocaleTimeString();
	}

	async function fetchNews() {
		newsLoading = true;
		try {
			const response = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=BTC,ETH,SOL');

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();

			if (data.Data && data.Data.length > 0) {
				news = data.Data.slice(0, 30);
			} else {
			}
		} catch (error) {
			news = [];
		} finally {
			newsLoading = false;
		}
	}

	async function fetchPolymarkets() {
		polymarketsLoading = true;
		try {
			polymarkets = await polymarketClient.fetchMarkets(10);
			if (polymarkets.length > 0) {
				selectedMarket = polymarkets[0];
			}
		} catch (error) {
			console.error('Error fetching Polymarket markets:', error);
		} finally {
			polymarketsLoading = false;
		}
	}

	async function fetchPythPrices() {
		try {
			const priceIds = Object.values(PYTH_FEEDS).map(f => f.id);

			const priceUpdates = await hermesClient.getLatestPriceUpdates(priceIds);

			if (priceUpdates?.parsed) {

				for (const priceData of priceUpdates.parsed) {
					const symbol = Object.keys(PYTH_FEEDS).find(
						key => PYTH_FEEDS[key as keyof typeof PYTH_FEEDS].id === '0x' + priceData.id
					);

					if (symbol) {
						const price = parseFloat(priceData.price.price) * Math.pow(10, priceData.price.expo);
						const confidence = parseFloat(priceData.price.conf) * Math.pow(10, priceData.price.expo);
						const emaPrice = parseFloat(priceData.ema_price.price) * Math.pow(10, priceData.ema_price.expo);
						const publishTime = priceData.price.publish_time;

						const prevPrice = previousPrices[symbol] || price;
						const change = prevPrice !== 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;

						const spread = price !== 0 ? (confidence / price) * 100 : 0;

						prices[symbol] = {
							price,
							change,
							confidence,
							emaPrice,
							publishTime,
							spread
						};

						previousPrices[symbol] = price;

					}
				}

				prices = prices;
				pythLastUpdate = Date.now();
			}
		} catch (error: any) {
			console.error('Error fetching Pyth prices:', error);
		}
	}

	function startPythPriceUpdates() {
		fetchPythPrices(); // Initial fetch
		pythUpdateInterval = setInterval(fetchPythPrices, 5000); // Update every 5 seconds
	}

	function executeCommand() {
		const cmd = command.toUpperCase();
		if (cmd.includes('MARKETS')) switchTab('MARKETS');
		else if (cmd.includes('NEWS')) switchTab('NEWS');
		command = '';
	}

	function switchTab(newTab: string) {
		selectedTab = newTab;
	}

	function selectMarket(market: PolyMarket) {
		selectedMarket = market;
		// Navigate to market detail page
		goto(`/market/${market.id}`);
	}

	onMount(() => {
		fetchNews();
		fetchPolymarkets();
		startPythPriceUpdates();
		updateTime();

		setInterval(fetchNews, 300000); // 5 minutes
		setInterval(fetchPolymarkets, 10000); // 10 seconds  
		setInterval(updateTime, 1000);

		return () => {
			if (pythUpdateInterval) {
				clearInterval(pythUpdateInterval);
			}
		};
	});
</script>

<div class="polyMock">
	<div class="command-bar">
		<a href="/" class="logo">POLYMOCK</a>
		<div class="nav-links">
			<a href="/" class="nav-link active">TERMINAL</a>
		</div>
		<input
			type="text"
			bind:value={command}
			on:keydown={(e) => e.key === 'Enter' && executeCommand()}
			placeholder="Type command and press GO"
			class="command-input"
		/>
		<button class="go-button" on:click={executeCommand}>GO</button>
		<WalletButton />
		<div class="command-bar-right">
			<div class="pyth-status">
				<span class="status-label">SOL PRICE:</span>
				<span class="status-value">${prices.SOL.price.toFixed(2)}</span>
				{#if pythLastUpdate > 0}
					<span class="status-age">{Math.floor((Date.now() - pythLastUpdate) / 1000)}s ago</span>
				{/if}
			</div>
			<div class="clock">{currentTime}</div>
		</div>
	</div>

	<div class="ticker-bar">
		<div class="ticker-item">
			SOL/USD <span class="price">${prices.SOL.price.toFixed(2)}</span>
			<span class={prices.SOL.change >= 0 ? 'change-up' : 'change-down'}>
				{prices.SOL.change >= 0 ? '▲' : '▼'} {Math.abs(prices.SOL.change).toFixed(2)}%
			</span>
			<span class="confidence" title="Confidence Interval">±{prices.SOL.confidence.toFixed(4)}</span>
		</div>
	</div>

	<div class="tabs">
		<button class="tab" class:active={selectedTab === 'MARKETS'} on:click={() => switchTab('MARKETS')}>POLYMARKET</button>
		<button class="tab" class:active={selectedTab === 'NEWS'} on:click={() => switchTab('NEWS')}>NEWS</button>
	</div>

	<div class="main-grid">
		<div class="panel news-panel">
			<div class="panel-header">
				TOP NEWS - CRYPTO
				{#if !newsLoading && news.length > 7}
					<button class="news-toggle" on:click={() => showAllNews = !showAllNews}>
						{showAllNews ? '▲ COLLAPSE' : '▼ SHOW ALL'}
					</button>
				{/if}
			</div>
			<div class="news-list">
				{#if newsLoading}
					<div class="loading-state">Loading news from CryptoCompare API...</div>
				{:else if news.length === 0}
					<div class="error-state">Failed to load news. Check console for details.</div>
				{:else}
					{@const displayedNews = showAllNews ? news : news.slice(0, 7)}
					{#each displayedNews as article, i}
						<a href={article.url} target="_blank" rel="noopener noreferrer" class="news-item">
							<div class="news-meta">
								<span class="news-number">{i + 1}</span>
								<span class="news-time">{new Date(article.published_on * 1000).toLocaleTimeString()}</span>
								<span class="news-source">{article.source}</span>
							</div>
							<div class="news-title">{article.title}</div>
						</a>
					{/each}
					{#if !showAllNews && news.length > 7}
						<div class="news-more">
							<button class="show-more-btn" on:click={() => showAllNews = true}>
								Show {news.length - 7} more articles ▼
							</button>
						</div>
					{/if}
				{/if}
			</div>
		</div>

		<div class="panel main-panel">
			{#if selectedTab === 'MARKETS'}
				<div class="panel-header">
					POLYMARKET PREDICTION MARKETS
				</div>
				<div class="markets-container">
					{#if polymarketsLoading}
						<div class="loading-state">Loading Polymarket markets...</div>
					{:else if polymarkets.length === 0}
						<div class="error-state">Failed to load markets from Polymarket API.</div>
					{:else}
						<div class="markets-grid">
							{#each polymarkets as market}
								<button class="market-card" class:selected={selectedMarket?.id === market.id} on:click={() => selectMarket(market)}>
									{#if market.tags && market.tags[0]}
										<div class="market-category">{market.tags[0]}</div>
									{/if}
									{#if market.image}
										<div class="market-image-corner">
											<img src={market.image} alt="Market" />
										</div>
									{/if}
									<div class="market-question">{market.question || 'Unknown Question'}</div>
									
									<!-- Yes/No Price Options -->
									<div class="market-outcomes">
										<div class="outcome-option yes-option">
											<span class="outcome-label">YES</span>
											<span class="outcome-price">{market.yesPrice ? `${(market.yesPrice * 100).toFixed(1)}¢` : 'N/A'}</span>
											{#if market.yesPrice}
												<span class="outcome-percentage">{(market.yesPrice * 100).toFixed(0)}%</span>
											{/if}
										</div>
										<div class="outcome-option no-option">
											<span class="outcome-label">NO</span>
											<span class="outcome-price">{market.noPrice ? `${(market.noPrice * 100).toFixed(1)}¢` : 'N/A'}</span>
											{#if market.noPrice}
												<span class="outcome-percentage">{(market.noPrice * 100).toFixed(0)}%</span>
											{/if}
										</div>
									</div>

									<div class="market-volume-bar" style="--yes-percentage: {market.yesPrice ? (market.yesPrice * 100).toFixed(0) : 50}%"></div>
									
									<div class="market-stats">
										<div class="market-volume">
											{market.volume_24hr ? `$${(market.volume_24hr / 1000000).toFixed(1)}M` : (market.volume ? `$${(market.volume / 1000000).toFixed(1)}M` : 'No volume')}
										</div>
										<div class="market-end">
											{market.end_date_iso ? new Date(market.end_date_iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date'}
										</div>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{:else if selectedTab === 'NEWS'}
				<div class="panel-header">NEWS DETAILS</div>
				<div class="news-details">
					<p>Click on any news article in the left panel to read more details.</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: #0A0E27;
		color: #E8E8E8;
		font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		overflow: auto;
	}

	.polyMock {
		min-height: 100vh;
		background: #0A0E27;
		display: flex;
		flex-direction: column;
	}

	.command-bar {
		background: #151B2F;
		padding: 16px 24px;
		display: flex;
		align-items: center;
		gap: 16px;
		border-bottom: 1px solid #2A2F45;
		flex-wrap: wrap;
		min-height: 64px;
	}

	.logo {
		font-size: 20px;
		font-weight: 700;
		color: #E8E8E8;
		letter-spacing: 1px;
		text-decoration: none;
	}

	.nav-links {
		display: flex;
		gap: 15px;
	}

	.nav-link {
		color: #666;
		text-decoration: none;
		font-size: 13px;
		padding: 4px 10px;
		border: 1px solid transparent;
		transition: all 0.2s;
	}

	.nav-link:hover {
		color: #fff;
		border-color: #333;
	}

	.nav-link.active {
		color: #4785ff;
		border-color: #4785ff;
	}

	.command-input {
		flex: 1;
		background: #0A0E27;
		border: 1px solid #2A2F45;
		color: #E8E8E8;
		padding: 8px 12px;
		font-family: Inter, sans-serif;
		font-size: 14px;
		border-radius: 6px;
		transition: border-color 200ms ease-out;
	}

	.command-input:focus {
		outline: none;
		border-color: #00D084;
	}

	.command-input::placeholder {
		color: #A0A0A0;
	}

	.go-button {
		background: #00D084;
		color: #ffffff;
		border: none;
		padding: 8px 20px;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		font-family: Inter, sans-serif;
		border-radius: 6px;
		transition: all 200ms ease-out;
	}

	.go-button:hover {
		background: #00B570;
		transform: scale(1.02);
	}

	.pyth-status {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #A0A0A0;
		font-size: 11px;
		padding: 6px 12px;
		background: #1E2139;
		border: 1px solid #2A2F45;
		border-radius: 6px;
		flex-shrink: 0;
		min-width: 140px;
	}

	.status-label {
		color: #666;
		font-size: 10px;
		letter-spacing: 0.5px;
	}

	.status-value {
		color: #00D084;
		font-weight: 600;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
	}

	.status-age {
		color: #999;
		font-size: 9px;
	}

	.command-bar-right {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-left: auto;
		flex-shrink: 0;
	}

	.clock {
		color: #A0A0A0;
		font-size: 12px;
		min-width: 80px;
		text-align: right;
		flex-shrink: 0;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
	}

	.ticker-bar {
		background: #151B2F;
		padding: 12px 24px;
		display: flex;
		gap: 40px;
		border-bottom: 1px solid #2A2F45;
	}

	.ticker-item {
		font-size: 13px;
		color: #A0A0A0;
		display: flex;
		gap: 12px;
		align-items: center;
	}

	.price {
		color: #E8E8E8;
		font-weight: 600;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
	}

	.change-up {
		color: #00D084;
		font-size: 12px;
		font-weight: 500;
	}

	.change-down {
		color: #FF4757;
		font-size: 12px;
		font-weight: 500;
	}

	.confidence {
		color: #666;
		font-size: 10px;
		font-style: italic;
	}

	.tabs {
		background: #151B2F;
		display: flex;
		gap: 4px;
		padding: 0 24px;
		border-bottom: 1px solid #2A2F45;
	}

	.tab {
		background: transparent;
		color: #A0A0A0;
		border: none;
		padding: 12px 20px;
		font-family: Inter, sans-serif;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		transition: all 200ms ease-out;
	}

	.tab.active {
		color: #E8E8E8;
		border-bottom-color: #00D084;
	}

	.tab:hover {
		color: #E8E8E8;
	}

	.main-grid {
		display: grid;
		grid-template-columns: 320px 1fr;
		gap: 24px;
		background: #0A0E27;
		flex: 1;
		overflow: hidden;
		min-height: 0;
		align-items: start;
		padding: 24px;
	}

	.panel {
		background: #151B2F;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.news-panel {
		height: 650px;
		max-height: 650px;
	}

	.main-panel {
		min-height: 650px;
	}


	.panel-header {
		background: transparent;
		color: #E8E8E8;
		padding: 20px 24px 16px 24px;
		font-size: 16px;
		font-weight: 600;
		letter-spacing: 0;
		border-bottom: 1px solid #2A2F45;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.news-list {
		overflow-y: auto;
		padding: 24px;
		flex: 1;
		height: 100%;
		max-height: calc(100vh - 20px);
	}

	.loading-state,
	.error-state {
		padding: 20px;
		text-align: center;
		color: #666;
		font-size: 12px;
	}

	.error-state {
		color: #ff0000;
	}

	.news-item {
		display: block;
		padding: 16px 0;
		border-bottom: 1px solid #2A2F45;
		transition: all 200ms ease-out;
		cursor: pointer;
		text-decoration: none;
		color: inherit;
		border-radius: 4px;
		margin: 0 -8px;
		padding-left: 8px;
		padding-right: 8px;
	}

	.news-item:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.news-meta {
		display: flex;
		gap: 12px;
		margin-bottom: 6px;
		font-size: 11px;
		color: #A0A0A0;
	}

	.news-number {
		color: #00D084;
		font-weight: 600;
	}

	.news-title {
		color: #E8E8E8;
		font-size: 13px;
		line-height: 1.4;
		font-weight: 400;
	}

	.news-toggle {
		color: #00ff00;
		cursor: pointer;
		font-size: 9px;
		font-weight: bold;
		transition: all 0.2s ease;
		padding: 2px 6px;
		border: 1px solid #00ff00;
		background: rgba(0, 255, 0, 0.1);
		font-family: 'Courier New', monospace;
	}

	.news-toggle:hover {
		background: #00ff00;
		color: #000;
		transform: scale(1.05);
	}

	.news-more {
		text-align: center;
		padding: 15px;
		border-top: 1px solid #333;
		margin-top: 10px;
	}

	.show-more-btn {
		background: #1a1a1a;
		color: #4785ff;
		border: 1px solid #4785ff;
		padding: 8px 16px;
		font-family: 'Courier New', monospace;
		font-size: 11px;
		font-weight: bold;
		cursor: pointer;
		transition: all 0.2s ease;
		letter-spacing: 0.5px;
	}

	.show-more-btn:hover {
		background: #4785ff;
		color: #000;
		transform: scale(1.05);
	}

	.markets-container {
		padding: 24px;
		overflow-y: auto;
		flex: 1;
	}

	.markets-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 20px;
		max-width: 100%;
	}

	@media (max-width: 1024px) {
		.markets-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 768px) {
		.markets-grid {
			grid-template-columns: 1fr;
		}
		.main-grid {
			grid-template-columns: 1fr;
			padding: 16px;
		}
	}

	.market-card {
		background: #1E2139;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		padding: 20px;
		cursor: pointer;
		transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
		width: 100%;
		text-align: left;
		font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		color: #E8E8E8;
		box-shadow: none;
		position: relative;
		min-height: 280px;
		display: flex;
		flex-direction: column;
	}

	.market-card:hover {
		border-color: #3A4055;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		transform: scale(1.02);
		background: rgba(255, 255, 255, 0.05);
	}

	.market-card.selected {
		border-color: #00D084;
		box-shadow: 0 0 0 1px rgba(0, 208, 132, 0.3);
	}

	.market-category {
		color: #A0A0A0;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 8px;
	}

	.market-question {
		color: #E8E8E8;
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 16px;
		margin-top: 8px;
		padding-left: 60px;
		padding-top: 8px;
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		flex: 1;
	}

	.market-outcomes {
		display: flex;
		gap: 8px;
		margin-bottom: 12px;
	}

	.outcome-option {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 12px 14px;
		border: 1px solid;
		border-radius: 6px;
		transition: all 200ms ease-out;
		cursor: pointer;
		background: rgba(0, 0, 0, 0.2);
	}

	.yes-option {
		border-color: #00D084;
	}

	.yes-option:hover {
		border-color: #00D084;
		background: rgba(0, 208, 132, 0.1);
		transform: scale(1.02);
	}

	.no-option {
		border-color: #FF4757;
	}

	.no-option:hover {
		border-color: #FF4757;
		background: rgba(255, 71, 87, 0.1);
		transform: scale(1.02);
	}

	.outcome-label {
		font-size: 11px;
		font-weight: 500;
		margin-bottom: 4px;
		letter-spacing: 0.5px;
		text-transform: uppercase;
	}

	.yes-option .outcome-label {
		color: #00D084;
	}

	.no-option .outcome-label {
		color: #FF4757;
	}

	.outcome-price {
		font-size: 22px;
		font-weight: 700;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
	}

	.yes-option .outcome-price {
		color: #00D084;
	}

	.no-option .outcome-price {
		color: #FF4757;
	}

	.outcome-percentage {
		font-size: 12px;
		font-weight: 400;
		color: #A0A0A0;
		margin-top: 2px;
	}

	.market-image-corner {
		position: absolute;
		top: 16px;
		left: 16px;
		width: 48px;
		height: 48px;
		border-radius: 8px;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid #2A2F45;
		z-index: 1;
	}

	.market-image-corner img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.market-details {
		margin-bottom: 10px;
	}

	.market-volume-bar {
		height: 4px;
		width: 100%;
		background: linear-gradient(90deg, #00D084 0%, #00D084 var(--yes-percentage, 50%), #FF4757 var(--yes-percentage, 50%), #FF4757 100%);
		border-radius: 2px;
		margin-bottom: 12px;
	}

	.market-stats {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: auto;
	}

	.market-volume,
	.market-end {
		color: #A0A0A0;
		font-size: 12px;
		font-weight: 400;
	}



	.news-details {
		padding: 40px;
		text-align: center;
		color: #666;
		font-size: 14px;
	}

	::-webkit-scrollbar {
		width: 8px;
	}

	::-webkit-scrollbar-track {
		background: #000;
	}

	::-webkit-scrollbar-thumb {
		background: #333;
	}

	::-webkit-scrollbar-thumb:hover {
		background: #4785ff;
	}
</style>