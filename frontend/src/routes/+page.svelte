<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { HermesClient } from '@pythnetwork/hermes-client';
	import { polymarketClient, type PolyMarket, type PolyEvent } from '$lib/polymarket';
	import NewsTicker from '$lib/components/NewsTicker.svelte';

	const hermesClient = new HermesClient('https://hermes.pyth.network', {});

	const PYTH_FEEDS = {
		BTC: { id: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', name: 'BTC/USD' },
		ETH: { id: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', name: 'ETH/USD' },
		BNB: { id: '0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f', name: 'BNB/USD' },
		SOL: { id: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', name: 'SOL/USD' },
		XRP: { id: '0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8', name: 'XRP/USD' },
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
	let polyevents: PolyEvent[] = [];
	let prices: Record<string, PriceData> = {
		BTC: { price: 0, change: 0, confidence: 0, emaPrice: 0, publishTime: 0, spread: 0 },
		ETH: { price: 0, change: 0, confidence: 0, emaPrice: 0, publishTime: 0, spread: 0 },
		BNB: { price: 0, change: 0, confidence: 0, emaPrice: 0, publishTime: 0, spread: 0 },
		SOL: { price: 0, change: 0, confidence: 0, emaPrice: 0, publishTime: 0, spread: 0 },
		XRP: { price: 0, change: 0, confidence: 0, emaPrice: 0, publishTime: 0, spread: 0 },
	};
	let previousPrices: Record<string, number> = {};
	let command = '';
	let pythUpdateInterval: any = null;
	let pythLastUpdate = 0;
	let polymarketsLoading = true;
	let newsLoading = true;
	let showAllNews = false;
	let selectedMarket: PolyMarket | null = null;
	let selectedEvent: PolyEvent | null = null;
	let searchQuery = '';
	let offset = 0;
	let hasMore = true;
	let isLoadingMore = false;
	let scrollContainer: HTMLElement;
	let searchResults: PolyEvent[] = [];
	let isSearching = false;
	let searchTimeout: any = null;

	// Debounced search function that fetches ALL events from API
	async function performSearch(query: string) {
		if (!query.trim()) {
			searchResults = [];
			isSearching = false;
			return;
		}

		isSearching = true;
		try {
			// Use the new searchAllEvents method to get comprehensive results
			// This searches across active, closed, and all events
			// @ts-ignore - searchAllEvents exists but TypeScript may not have picked it up yet
			const allEvents = await polymarketClient.searchAllEvents(200);

			// Filter the results based on search query
			const query_lower = query.toLowerCase();
			searchResults = allEvents.filter((event: PolyEvent) => {
				// Search in event title
				if (event.title?.toLowerCase().includes(query_lower)) return true;
				// Search in event subtitle
				if (event.subtitle?.toLowerCase().includes(query_lower)) return true;
				// Search in market questions
				return event.markets?.some((market: PolyMarket) =>
					market.question?.toLowerCase().includes(query_lower)
				);
			});
		} catch (error) {
			console.error('Error searching events:', error);
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	// Reactive statement to trigger search with debounce
	$: {
		if (searchQuery) {
			// Clear existing timeout
			if (searchTimeout) {
				clearTimeout(searchTimeout);
			}
			// Set new timeout for debounced search
			searchTimeout = setTimeout(() => {
				performSearch(searchQuery);
			}, 300);
		} else {
			// Clear search results when search query is empty
			searchResults = [];
			isSearching = false;
		}
	}

	// Reactive filtered events - use search results when searching, otherwise use loaded events
	$: filteredEvents = searchQuery ? searchResults : polyevents;

	async function fetchNews() {
		newsLoading = true;
		try {
			const response = await fetch('/api/news?lang=EN');

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();

			if (data.Data && data.Data.length > 0) {
				news = data.Data.slice(0, 10);
			}
		} catch (error) {
			console.error('Error fetching news:', error);
			news = [];
		} finally {
			newsLoading = false;
		}
	}

	async function fetchPolymarkets(append = false) {
		if (append) {
			isLoadingMore = true;
		} else {
			polymarketsLoading = true;
			offset = 0;
			hasMore = true;
		}

		try {
			const limit = 20; // Fetch 20 events at a time
			// @ts-ignore - fetchEvents accepts 3 parameters (limit, fetchPrices, offset)
			const response = await polymarketClient.fetchEvents(limit, false, offset);

			if (append) {
				polyevents = [...polyevents, ...response];
			} else {
				polyevents = response;
			}

			// Check if we got fewer events than requested - means we've reached the end
			if (response.length < limit) {
				hasMore = false;
			}

			offset += response.length;

			// After appending more events, check if we still need more to fill the viewport
			if (append) {
				setTimeout(checkIfNeedsMore, 300);
			}
		} catch (error) {
			console.error('Error fetching Polymarket events:', error);
			hasMore = false;
		} finally {
			polymarketsLoading = false;
			isLoadingMore = false;
		}
	}

	function handleScroll(e: Event) {
		const target = e.target as HTMLElement;
		const scrollHeight = target.scrollHeight;
		const scrollTop = target.scrollTop;
		const clientHeight = target.clientHeight;
		const scrolledToBottom = scrollHeight - scrollTop <= clientHeight + 200;

		console.log('Scroll event:', { scrollHeight, scrollTop, clientHeight, scrolledToBottom, isLoadingMore, hasMore });

		if (scrolledToBottom && !isLoadingMore && hasMore && !searchQuery) {
			console.log('Fetching more events...');
			fetchPolymarkets(true);
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
		pythUpdateInterval = setInterval(fetchPythPrices, 15000); // Update every 15 seconds
	}

	function selectEvent(event: PolyEvent) {
		// Navigate to event detail page
		goto(`/event/${event.slug}`);
	}

	function selectMarket(market: PolyMarket, event: PolyEvent) {
		selectedMarket = market;
		selectedEvent = event;
		// Navigate to market detail page
		goto(`/market/${market.id}`);
	}

	let checkAttempts = 0;
	const MAX_CHECK_ATTEMPTS = 3; // Prevent infinite loading

	// Check if we need to load more events to fill the viewport
	function checkIfNeedsMore() {
		if (scrollContainer && !isLoadingMore && hasMore && !searchQuery && checkAttempts < MAX_CHECK_ATTEMPTS) {
			const scrollHeight = scrollContainer.scrollHeight;
			const clientHeight = scrollContainer.clientHeight;

			console.log('Checking if needs more:', { scrollHeight, clientHeight, canScroll: scrollHeight > clientHeight, attempts: checkAttempts });

			// If content doesn't exceed viewport height, load more
			if (scrollHeight <= clientHeight + 50) {
				console.log('Container not scrollable, loading more events...');
				checkAttempts++;
				fetchPolymarkets(true);
			}
		}
	}

	onMount(() => {
		fetchNews();
		fetchPolymarkets().then(() => {
			// After initial load, check if we need more events to fill the viewport
			setTimeout(checkIfNeedsMore, 500);
		});
		startPythPriceUpdates();

		setInterval(fetchNews, 300000); // 5 minutes
		setInterval(fetchPolymarkets, 300000); // 5 minutes

		return () => {
			if (pythUpdateInterval) {
				clearInterval(pythUpdateInterval);
			}
		};
	});
</script>

<div class="polyMock">
	<div class="command-bar">
		<input
			type="text"
			bind:value={searchQuery}
			placeholder="Search markets..."
			class="search-input"
		/>

		<div class="command-bar-right">
			<div class="pyth-status">
				<span class="status-label">BTC/USD</span>
				<span class="status-value">${prices.BTC.price.toFixed(0)}</span>
				<span class={prices.BTC.change >= 0 ? 'status-change-up' : 'status-change-down'}>
					{prices.BTC.change >= 0 ? '▲' : '▼'} {Math.abs(prices.BTC.change).toFixed(2)}%
				</span>
				<span class="status-confidence" title="Confidence Interval">±{prices.BTC.confidence.toFixed(2)}</span>
			</div>
			<div class="pyth-status">
				<span class="status-label">ETH/USD</span>
				<span class="status-value">${prices.ETH.price.toFixed(0)}</span>
				<span class={prices.ETH.change >= 0 ? 'status-change-up' : 'status-change-down'}>
					{prices.ETH.change >= 0 ? '▲' : '▼'} {Math.abs(prices.ETH.change).toFixed(2)}%
				</span>
				<span class="status-confidence" title="Confidence Interval">±{prices.ETH.confidence.toFixed(2)}</span>
			</div>
			<div class="pyth-status">
				<span class="status-label">BNB/USD</span>
				<span class="status-value">${prices.BNB.price.toFixed(0)}</span>
				<span class={prices.BNB.change >= 0 ? 'status-change-up' : 'status-change-down'}>
					{prices.BNB.change >= 0 ? '▲' : '▼'} {Math.abs(prices.BNB.change).toFixed(2)}%
				</span>
				<span class="status-confidence" title="Confidence Interval">±{prices.BNB.confidence.toFixed(2)}</span>
			</div>
			<div class="pyth-status">
				<span class="status-label">SOL/USD</span>
				<span class="status-value">${prices.SOL.price.toFixed(2)}</span>
				<span class={prices.SOL.change >= 0 ? 'status-change-up' : 'status-change-down'}>
					{prices.SOL.change >= 0 ? '▲' : '▼'} {Math.abs(prices.SOL.change).toFixed(2)}%
				</span>
				<span class="status-confidence" title="Confidence Interval">±{prices.SOL.confidence.toFixed(4)}</span>
			</div>
			<div class="pyth-status">
				<span class="status-label">XRP/USD</span>
				<span class="status-value">${prices.XRP.price.toFixed(2)}</span>
				<span class={prices.XRP.change >= 0 ? 'status-change-up' : 'status-change-down'}>
					{prices.XRP.change >= 0 ? '▲' : '▼'} {Math.abs(prices.XRP.change).toFixed(2)}%
				</span>
				<span class="status-confidence" title="Confidence Interval">±{prices.XRP.confidence.toFixed(4)}</span>
			</div>
		</div>
	</div>

	<div class="ticker-bar">
		<NewsTicker />
	</div>

	<div class="main-grid">
		<!-- News Panel -->
		<div class="panel news-panel">
			<div class="panel-header">
				<span>TOP NEWS - CRYPTO</span>
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

		<!-- Markets Panel -->
		<div class="panel main-panel">
			<div class="panel-header">
				POLYMARKET PREDICTION MARKETS
			</div>
			<div class="markets-container" on:scroll={handleScroll} bind:this={scrollContainer}>
				{#if polymarketsLoading && !searchQuery}
					<div class="loading-state">Loading Polymarket markets...</div>
				{:else if isSearching}
					<div class="loading-state">
						<div class="loading-spinner"></div>
						<span>Searching all markets for "{searchQuery}"...</span>
					</div>
				{:else if filteredEvents.length === 0}
					<div class="error-state">
						{searchQuery ? `No markets found for "${searchQuery}"` : 'Failed to load markets from Polymarket API.'}
					</div>
				{:else}
					<div class="events-grid">
						{#each filteredEvents as event}
							<div class="event-card-wrapper">
								<!-- Event Header -->
								<button class="event-header-compact" on:click={() => selectEvent(event)}>
									<div class="event-header-left">
										{#if event.image}
											<img src={event.image} alt={event.title} class="event-icon" />
										{/if}
										<h3 class="event-title-compact">{event.title}</h3>
									</div>
									{#if event.categories && event.categories[0]}
										<span class="event-category-badge-small">{event.categories[0]}</span>
									{/if}
								</button>

								<!-- First 2 Markets Preview (sorted by volume) -->
								<div class="markets-preview">
									{#each event.markets.sort((a: PolyMarket, b: PolyMarket) => (b.volume_24hr || b.volume || 0) - (a.volume_24hr || a.volume || 0)).slice(0, 2) as market}
										<div class="market-preview-item">
											<div class="market-top-row">
												<span class="market-question-text" on:click={() => selectMarket(market, event)} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && selectMarket(market, event)}>
													{market.question || 'Unknown Question'}
												</span>
												<div class="chance-badge">
													<span class="chance-percent">{((market.yesPrice || 0) * 100).toFixed(0)}%</span>
													<span class="chance-text">chance</span>
												</div>
											</div>

											<div class="market-bottom-row">
												<button class="trade-btn yes-trade" on:click={() => selectMarket(market, event)}>
													Yes
												</button>
												<button class="trade-btn no-trade" on:click={() => selectMarket(market, event)}>
													No
												</button>
											</div>
										</div>
									{/each}

									<!-- Event Total Volume (shown once at bottom) -->
									{#if event.volume}
										<div class="event-total-volume">
											<span class="volume-text">${(event.volume / 1000000).toFixed(2)}M Total Vol.</span>
										</div>
									{/if}
								</div>
							</div>
						{/each}

						<!-- Loading More Indicator -->
						{#if isLoadingMore}
							<div class="loading-more">
								<div class="loading-spinner"></div>
								<span>Loading more events...</span>
							</div>
						{/if}

						<!-- End of Results Indicator -->
						{#if !hasMore && !searchQuery && filteredEvents.length > 0}
							<div class="end-of-results">
								You've reached the end of available markets
							</div>
						{/if}
					</div>
				{/if}
			</div>
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
		padding: 12px 24px;
		display: flex;
		align-items: center;
		gap: 16px;
		border-bottom: 1px solid #2A2F45;
		flex-wrap: wrap;
	}

	.search-input {
		flex: 1;
		min-width: 200px;
		background: #0A0E27;
		border: 1px solid #2A2F45;
		color: #E8E8E8;
		padding: 10px 14px;
		font-family: Inter, sans-serif;
		font-size: 14px;
		border-radius: 8px;
		transition: border-color 200ms ease-out;
	}

	.search-input:focus {
		outline: none;
		border-color: #00D084;
	}

	.search-input::placeholder {
		color: #666;
	}

	.pyth-status {
		display: flex;
		align-items: center;
		gap: 6px;
		color: #A0A0A0;
		font-size: 12px;
		padding: 6px 10px;
		background: #1E2139;
		border: 1px solid #2A2F45;
		border-radius: 6px;
		flex-shrink: 0;
	}

	.status-label {
		color: #A0A0A0;
		font-size: 11px;
		font-weight: 500;
	}

	.status-value {
		color: #E8E8E8;
		font-weight: 600;
		font-size: 12px;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
	}

	.status-change-up {
		color: #00D084;
		font-size: 11px;
		font-weight: 600;
	}

	.status-change-down {
		color: #FF6B6B;
		font-size: 11px;
		font-weight: 600;
	}

	.status-confidence {
		color: #8B92AB;
		font-size: 10px;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
	}

	.command-bar-right {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-left: auto;
		flex-shrink: 0;
	}

	.ticker-bar {
		background: #151B2F;
		padding: 12px 24px;
		display: flex;
		border-bottom: 1px solid #2A2F45;
		align-items: center;
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
		max-height: calc(100vh - 160px);
	}

	.news-panel {
		min-height: 650px;
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
		flex-shrink: 0;
	}

	.news-list {
		overflow-y: auto;
		padding: 24px;
		flex: 1;
		min-height: 0;
	}

	.loading-state {
		padding: 40px;
		text-align: center;
		color: #9BA3B4;
		font-size: 14px;
		font-weight: 500;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
	}

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
		color: #00D084;
		cursor: pointer;
		font-size: 10px;
		font-weight: bold;
		transition: all 0.2s ease;
		padding: 4px 8px;
		border: 1px solid #00D084;
		background: rgba(0, 208, 132, 0.1);
		font-family: Inter, sans-serif;
		border-radius: 4px;
	}

	.news-toggle:hover {
		background: #00D084;
		color: #000;
		transform: scale(1.05);
	}

	.news-more {
		text-align: center;
		padding: 15px;
		border-top: 1px solid #2A2F45;
		margin-top: 10px;
	}

	.show-more-btn {
		background: #1E2139;
		color: #00B4FF;
		border: 1px solid #00B4FF;
		padding: 8px 16px;
		font-family: Inter, sans-serif;
		font-size: 11px;
		font-weight: bold;
		cursor: pointer;
		transition: all 0.2s ease;
		letter-spacing: 0.5px;
		border-radius: 4px;
	}

	.show-more-btn:hover {
		background: #00B4FF;
		color: #000;
		transform: scale(1.05);
	}

	.markets-container {
		padding: 24px;
		overflow-y: auto;
		flex: 1;
	}

	.events-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 20px;
	}

	.event-card-wrapper {
		background: #1E2139;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		overflow: hidden;
		transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		flex-direction: column;
	}

	.event-card-wrapper:hover {
		border-color: #3A4055;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.event-header-compact {
		padding: 12px 16px;
		background: rgba(42, 47, 69, 0.3);
		border: none;
		border-bottom: 1px solid #2A2F45;
		display: flex;
		align-items: center;
		justify-content: space-between;
		cursor: pointer;
		transition: background 200ms ease-out;
		width: 100%;
		text-align: left;
		font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	}

	.event-header-compact:hover {
		background: rgba(42, 47, 69, 0.5);
	}

	.event-header-left {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		min-width: 0;
	}

	.event-icon {
		width: 32px;
		height: 32px;
		border-radius: 6px;
		object-fit: cover;
		flex-shrink: 0;
	}

	.event-title-compact {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		color: #E8E8E8;
		line-height: 1.3;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.event-category-badge-small {
		padding: 4px 8px;
		background: rgba(0, 208, 132, 0.1);
		border: 1px solid rgba(0, 208, 132, 0.3);
		border-radius: 4px;
		color: #00D084;
		font-size: 10px;
		font-weight: 600;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.markets-preview {
		display: flex;
		flex-direction: column;
		padding: 16px;
		gap: 16px;
	}

	.market-preview-item {
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	}

	.market-top-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.market-question-text {
		color: #E8E8E8;
		font-size: 14px;
		font-weight: 500;
		line-height: 1.4;
		flex: 1;
		cursor: pointer;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.market-question-text:hover {
		color: #00D084;
	}

	.chance-badge {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 6px 12px;
		background: rgba(0, 208, 132, 0.1);
		border-radius: 8px;
		flex-shrink: 0;
	}

	.chance-percent {
		color: #00D084;
		font-size: 18px;
		font-weight: 700;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		line-height: 1.1;
	}

	.chance-text {
		color: #00D084;
		font-size: 10px;
		font-weight: 500;
		margin-top: 2px;
	}

	.market-bottom-row {
		display: flex;
		gap: 8px;
	}

	.trade-btn {
		flex: 1;
		padding: 10px;
		border-radius: 6px;
		font-family: Inter, sans-serif;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 150ms ease-out;
		border: none;
	}

	.yes-trade {
		background: rgba(0, 208, 132, 0.15);
		color: #00D084;
		border: 1px solid rgba(0, 208, 132, 0.3);
	}

	.yes-trade:hover {
		background: rgba(0, 208, 132, 0.25);
		border-color: #00D084;
		transform: translateY(-1px);
	}

	.no-trade {
		background: rgba(255, 71, 87, 0.15);
		color: #FF4757;
		border: 1px solid rgba(255, 71, 87, 0.3);
	}

	.no-trade:hover {
		background: rgba(255, 71, 87, 0.25);
		border-color: #FF4757;
		transform: translateY(-1px);
	}

	.event-total-volume {
		padding: 12px 0 0 0;
		border-top: 1px solid #2A2F45;
		margin-top: 8px;
	}

	.volume-text {
		color: #9BA3B4;
		font-size: 12px;
		font-weight: 500;
	}

	.loading-more {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px;
		gap: 16px;
		color: #9BA3B4;
		font-size: 14px;
		font-weight: 500;
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid #2A2F45;
		border-top-color: #00D084;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.end-of-results {
		text-align: center;
		padding: 40px;
		color: #666;
		font-size: 14px;
		font-weight: 500;
	}

	@media (max-width: 1400px) {
		.events-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (max-width: 1024px) {
		.events-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 768px) {
		.events-grid {
			grid-template-columns: 1fr;
		}
		.main-grid {
			grid-template-columns: 1fr;
			padding: 16px;
		}
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