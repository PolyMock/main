<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { polymarketClient, type PolyEvent, type PolyMarket } from '$lib/polymarket';
	import { takeStashedEventForSlug } from '$lib/navigation/event-bootstrap';
	import { walletStore, refreshUserBalance } from '$lib/wallet/stores';
	import { polymarketService } from '$lib/solana/polymarket-service';
	import { sessionKeyManager } from '$lib/solana/session-keys';
	import { PublicKey } from '@solana/web3.js';
	import MarketRules from '$lib/components/MarketRules.svelte';
	import MarketComments from '$lib/components/MarketComments.svelte';
	import OrderBook from '$lib/components/OrderBook.svelte';
	import MarketPriceChart from '$lib/components/MarketPriceChart.svelte';
	const polymockLogo = '/1.png';

	let event: PolyEvent | null = null;
	let loading = true;
	let error = false;
	let selectedMarket: PolyMarket | null = null;
	let selectedSide: 'Yes' | 'No' = 'Yes';
	let tradeTab: 'Buy' | 'Sell' | 'OrderBook' = 'Buy';
	let amount = 0; // For buy: USD amount, For sell: shares count
	let showResolved = false;
	let trading = false;
	let walletState = $walletStore;
	let showInfoView: 'markets' | 'info' = 'markets'; // Toggle between markets and rules/comments
	let centerTab: 'orderbook' | 'chart' | 'info' = 'orderbook';
	let showSLTP = false;

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
		if (value.connected && value.publicKey && tradeTab === 'Sell') {
			loadUserPositions();
		}
	});

	// Load positions when switching to sell tab or when market changes
	$: if (walletState.connected && walletState.publicKey && tradeTab === 'Sell' && selectedMarket) {
		loadUserPositions();
	}

	$: slug = $page.params.slug;

	// Check if a market is resolved (0% or 100%)
	function isMarketResolved(market: PolyMarket): boolean {
		const yesPrice = market.yesPrice || 0;
		return yesPrice === 0 || yesPrice === 1 || market.closed === true;
	}

	// Separate active and resolved markets
	$: activeMarkets = event?.markets.filter(m => !isMarketResolved(m)) || [];
	$: resolvedMarkets = event?.markets.filter(m => isMarketResolved(m)) || [];

	// Display markets: active first (sorted by percentage), then resolved if shown
	$: displayedMarkets = showResolved
		? [...activeMarkets, ...resolvedMarkets]
		: activeMarkets;

	async function fetchEvent() {
		loading = true;
		error = false;
		try {
			const routeSlug = slug?.trim() ?? '';
			if (!routeSlug) {
				error = true;
				return;
			}

			const stashed = takeStashedEventForSlug(routeSlug);
			if (stashed && stashed.slug === routeSlug) {
				event = stashed;
			} else {
				event = await polymarketClient.findEventBySlug(routeSlug);
			}

			if (!event) {
				error = true;
				loading = false;
				return;
			}

			// Now enrich only this event with prices (much faster)
			await polymarketClient.enrichEventWithPrices(event);

			// Sort markets by chance percentage (highest to lowest)
			event.markets = event.markets.sort((a, b) => {
				const aPrice = a.yesPrice || 0;
				const bPrice = b.yesPrice || 0;
				return bPrice - aPrice;
			});

			// Auto-select first active market
			const firstActive = event.markets.find(m => !isMarketResolved(m));
			if (firstActive) {
				selectedMarket = firstActive;
			} else if (event.markets.length > 0) {
				selectedMarket = event.markets[0];
			}

			// Trigger reactivity
			event = event;
		} catch (err) {
			console.error('Error fetching event:', err);
			error = true;
		} finally {
			loading = false;
		}
	}

	function selectMarket(market: PolyMarket) {
		selectedMarket = market;
		amount = 0; // Reset amount when switching markets
	}

	function goBack() {
		goto('/');
	}


	function setMaxAmount() {
		if (tradeTab === 'Buy') {
			amount = walletState.usdcBalance || 0;
		} else if (selectedPosition) {
			// For sell, set to max shares
			amount = selectedPosition.remainingShares || selectedPosition.shares;
		}
	}

	function addAmount(value: number) {
		if (tradeTab === 'Buy') {
			amount += value;
			amount = Math.min(amount, walletState.usdcBalance || 0);
		} else if (selectedPosition) {
			// For sell, add shares
			const maxShares = selectedPosition.remainingShares || selectedPosition.shares;
			amount += value;
			amount = Math.min(amount, maxShares);
			amount = Math.max(amount, 0);
		}
	}

	async function loadUserPositions() {
		if (!walletState.connected || !walletState.publicKey || !selectedMarket) {
			userPositions = [];
			return;
		}

		loadingPositions = true;
		try {
			const userPublicKey = new PublicKey(walletState.publicKey.toString());
			const blockchainPositions = await polymarketService.getUserPositions(userPublicKey);

			// Filter positions for the selected market and side
			userPositions = blockchainPositions
				.filter(pos => {
					const isYes = 'yes' in pos.predictionType;
					const matchesMarket = pos.marketId === selectedMarket.id;
					const matchesSide = (selectedSide === 'Yes' && isYes) || (selectedSide === 'No' && !isYes);
					const isActive = 'active' in pos.status || 'partiallySold' in pos.status;
					return matchesMarket && matchesSide && isActive;
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
				if (amount === 0) {
					amount = 0;
				}
			} else {
				selectedPosition = null;
				amount = 0;
			}
		} catch (error) {
			console.error('Error loading user positions:', error);
			userPositions = [];
		} finally {
			loadingPositions = false;
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
		if (!amount || amount <= 0) {
			showToastNotification('error', 'Please enter a valid trade amount');
			return;
		}

		// Check if user has sufficient balance
		if (amount > walletState.usdcBalance) {
			showToastNotification('error', `Insufficient balance. You have $${walletState.usdcBalance.toFixed(2)} available.`);
			return;
		}

		if (!selectedMarket || !selectedSide) {
			showToastNotification('error', 'Please select a market and outcome');
			return;
		}

		// Prevent trading on resolved markets
		if (isMarketResolved(selectedMarket)) {
			showToastNotification('error', 'Cannot trade on resolved markets');
			return;
		}

		const price = selectedSide === 'Yes' ? (selectedMarket.yesPrice || 0) : (selectedMarket.noPrice || 0);

		if (price <= 0) {
			showToastNotification('error', 'Invalid price. Please refresh the page.');
			return;
		}

		if (tradeTab === 'Buy') {
			// Calculate and show confirmation modal for buy
			const shares = amount / price;
			const potentialWin = shares;

			modalTitle = `Buy ${selectedSide}`;
			modalDetails = {
				market: selectedMarket.question || 'Unknown Market',
				action: `Buy ${selectedSide}`,
				amount: `$${amount.toFixed(2)}`,
				price: `${(price * 100).toFixed(1)}¢`,
				shares: shares.toFixed(2),
				potentialWin: `$${potentialWin.toFixed(2)}`,
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

					if (selectedSide === 'Yes') {
						txSignature = await polymarketService.buyYes(
							walletState.adapter,
							selectedMarket.id,
							amount,
							price,
							stopLoss,
							takeProfit
						);
					} else {
						txSignature = await polymarketService.buyNo(
							walletState.adapter,
							selectedMarket.id,
							amount,
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
					amount = 0;
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

			// Amount is already in shares for sell mode
			const sharesToSell = amount;
			const remainingShares = selectedPosition.remainingShares;

			if (sharesToSell <= 0 || sharesToSell > remainingShares) {
				showToastNotification('error', `You can only sell up to ${remainingShares.toFixed(2)} shares.`);
				return;
			}

			const payout = sharesToSell * price;

			modalTitle = `Sell ${selectedSide}`;
			modalDetails = {
				market: selectedMarket.question || 'Unknown Market',
				action: `Sell ${selectedSide}`,
				shares: sharesToSell.toFixed(2),
				price: `${(price * 100).toFixed(1)}¢`,
				amount: `${sharesToSell.toFixed(2)} shares`,
				potentialWin: `$${payout.toFixed(2)}`
			};
			showConfirmModal = true;

			// Store the actual trade execution
			pendingTrade = async () => {
				trading = true;
				try {
					// Execute the sell on Solana
					let txSignature: string;

					if (selectedSide === 'Yes') {
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
					amount = 0;
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

	onMount(() => {
		fetchEvent();
	});
</script>

<div class="ev-page">

	{#if loading}
		<div class="ev-loading">
			<div class="ev-spinner"></div>
			<span>Loading event…</span>
		</div>
	{:else if error || !event}
		<div class="ev-error">
			<h2>Event not found</h2>
			<p>This event doesn't exist or has been removed.</p>
			<button on:click={goBack}>← Back to Markets</button>
		</div>
	{:else}
		<!-- TOP HEADER BAR -->
		<div class="ev-header">
			<button class="ev-back" on:click={goBack}>←</button>
			{#if event.image}
				<img src={event.image} alt={event.title} class="ev-logo" />
			{/if}
			<span class="ev-title">{event.title}</span>
			<div class="ev-header-meta">
				<span class="ev-meta-chip">{activeMarkets.length} active</span>
				{#if resolvedMarkets.length > 0}
					<span class="ev-meta-chip resolved">{resolvedMarkets.length} resolved</span>
				{/if}
			</div>
		</div>

		<!-- 3-COLUMN BODY -->
		<div class="ev-body">

			<!-- ── LEFT SIDEBAR: market list ── -->
			<div class="ev-sidebar">
				<div class="ev-sidebar-label">MARKETS</div>
				{#each activeMarkets as market}
					<button
						class="ev-mrow"
						class:active={selectedMarket?.id === market.id}
						on:click={() => selectMarket(market)}
					>
						<div class="ev-mrow-bar">
							<div class="ev-mrow-fill" style="height:{((market.yesPrice||0)*100).toFixed(0)}%"></div>
						</div>
						<div class="ev-mrow-info">
							<span class="ev-mrow-name">{market.question || 'Unknown'}</span>
							<span class="ev-mrow-pct yes-color">{((market.yesPrice||0)*100).toFixed(0)}%</span>
						</div>
					</button>
				{/each}

				{#if resolvedMarkets.length > 0}
					<button class="ev-resolved-toggle" on:click={() => showResolved = !showResolved}>
						{showResolved ? '▲' : '▼'} {resolvedMarkets.length} resolved
					</button>
					{#if showResolved}
						{#each resolvedMarkets as market}
							<button
								class="ev-mrow resolved"
								class:active={selectedMarket?.id === market.id}
								on:click={() => selectMarket(market)}
							>
								<div class="ev-mrow-info">
									<span class="ev-mrow-name">{market.question || 'Unknown'}</span>
									<span class="resolved-chip">Resolved</span>
								</div>
							</button>
						{/each}
					{/if}
				{/if}
			</div>

			<!-- ── CENTER: orderbook / info ── -->
			<div class="ev-main">
				{#if selectedMarket}
					<!-- Market banner -->
					<div class="ev-market-banner">
						<div class="ev-market-title">{selectedMarket.question}</div>
						<div class="ev-market-pills">
							<button
								class="ev-pill yes-pill"
								class:pill-active={selectedSide === 'Yes'}
								on:click={() => { selectedSide = 'Yes'; tradeTab = 'Buy'; }}
							>
								Yes <strong>{((selectedMarket.yesPrice||0)*100).toFixed(1)}¢</strong>
							</button>
							<button
								class="ev-pill no-pill"
								class:pill-active={selectedSide === 'No'}
								on:click={() => { selectedSide = 'No'; tradeTab = 'Buy'; }}
							>
								No <strong>{((selectedMarket.noPrice||0)*100).toFixed(1)}¢</strong>
							</button>
							<span class="ev-stat">Vol. {selectedMarket.volume_24hr ? `$${(selectedMarket.volume_24hr/1000000).toFixed(1)}M` : selectedMarket.volume ? `$${(selectedMarket.volume/1000000).toFixed(1)}M` : '$0'}</span>
							{#if selectedMarket.endDate}
								<span class="ev-stat">Ends {new Date(selectedMarket.endDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
							{/if}
						</div>
					</div>

					<!-- Center tabs -->
					<div class="ev-center-tabs">
						<button class="ev-ctab" class:ev-ctab-active={centerTab==='orderbook'} on:click={() => centerTab='orderbook'}>Order Book</button>
						<button class="ev-ctab" class:ev-ctab-active={centerTab==='chart'} on:click={() => centerTab='chart'}>Chart</button>
						<button class="ev-ctab" class:ev-ctab-active={centerTab==='info'} on:click={() => centerTab='info'}>Info & Rules</button>
					</div>

					<!-- Tab content -->
					<div class="ev-center-content" class:ev-center-content-chart={centerTab==='chart'}>
						{#if centerTab === 'orderbook'}
							<OrderBook
								tokenIds={selectedMarket.clobTokenIds ?? []}
								yesLabel="Yes"
								noLabel="No"
							/>
						{:else if centerTab === 'chart'}
							{@const chartMarkets = activeMarkets
								.filter(m => m.clobTokenIds?.[0])
								.sort((a, b) => (b.yesPrice ?? 0) - (a.yesPrice ?? 0))
								.slice(0, 5)
								.map((m, i) => ({
									tokenId: m.clobTokenIds![0],
									label: m.question?.replace(/^Will /, '').slice(0, 30) ?? `Market ${i+1}`,
								}))}
							<MarketPriceChart markets={chartMarkets} />
						{:else}
							<div class="ev-info-wrap">
								<MarketRules event={event} market={selectedMarket} />
							</div>
						{/if}
					</div>
				{:else}
					<div class="ev-no-market">← Select a market</div>
				{/if}
			</div>

			<!-- ── RIGHT: trading panel ── -->
			<div class="ev-trade">
				{#if selectedMarket}
					<div class="ev-trade-inner">

					<!-- Yes / No toggle -->
					<div class="ev-outcome-row">
						<button
							class="ev-outcome yes-outcome"
							class:active={selectedSide === 'Yes'}
							on:click={() => { selectedSide = 'Yes'; selectedPosition = null; amount = 0; }}
						>
							Yes<br><span class="ev-outcome-pct">{((selectedMarket.yesPrice||0)*100).toFixed(1)}¢</span>
						</button>
						<button
							class="ev-outcome no-outcome"
							class:active={selectedSide === 'No'}
							on:click={() => { selectedSide = 'No'; selectedPosition = null; amount = 0; }}
						>
							No<br><span class="ev-outcome-pct">{((selectedMarket.noPrice||0)*100).toFixed(1)}¢</span>
						</button>
					</div>

					<!-- Buy / Sell tabs -->
					<div class="ev-trade-tabs">
						<button class="ev-ttab" class:ev-ttab-active={tradeTab==='Buy'} on:click={() => tradeTab='Buy'}>Buy</button>
						<button class="ev-ttab" class:ev-ttab-active={tradeTab==='Sell'} on:click={() => tradeTab='Sell'}>Sell</button>
					</div>

					<!-- Amount input -->
					<div class="ev-amount-block">
						<div class="ev-amount-row">
							<label class="ev-amount-label">{tradeTab === 'Buy' ? 'Amount (USD)' : 'Shares'}</label>
							<span class="ev-balance">
								{#if tradeTab === 'Buy'}
									${walletState.usdcBalance.toFixed(2)}
								{:else if selectedPosition}
									{selectedPosition.remainingShares.toFixed(2)} avail.
								{/if}
							</span>
						</div>
						<div class="ev-input-wrap">
							{#if tradeTab === 'Buy'}<span class="ev-currency">$</span>{/if}
							<input
								type="text"
								inputmode="decimal"
								value={amount || ''}
								on:input={(e) => {
									const val = e.target.value;
									if (val === '' || val === '.') { amount = 0; return; }
									const parsed = parseFloat(val);
									if (!isNaN(parsed)) amount = parsed;
								}}
								placeholder="0.00"
								class="ev-input"
								class:ev-input-sell={tradeTab === 'Sell'}
							/>
							{#if tradeTab === 'Sell'}<span class="ev-suffix">shares</span>{/if}
						</div>
						<div class="ev-quick">
							{#if tradeTab === 'Buy'}
								<button class="ev-qbtn" on:click={() => addAmount(1)}>$1</button>
								<button class="ev-qbtn" on:click={() => addAmount(10)}>$10</button>
								<button class="ev-qbtn" on:click={() => addAmount(50)}>$50</button>
								<button class="ev-qbtn" on:click={setMaxAmount}>Max</button>
							{:else if selectedPosition}
								<button class="ev-qbtn" on:click={() => { amount = selectedPosition.remainingShares * 0.25; }}>25%</button>
								<button class="ev-qbtn" on:click={() => { amount = selectedPosition.remainingShares * 0.5; }}>50%</button>
								<button class="ev-qbtn" on:click={() => { amount = selectedPosition.remainingShares * 0.75; }}>75%</button>
								<button class="ev-qbtn" on:click={setMaxAmount}>Max</button>
							{/if}
						</div>
					</div>

					<!-- SL/TP accordion (Buy only) -->
					{#if tradeTab === 'Buy'}
					<div class="ev-sltp-wrap">
						<button class="ev-sltp-toggle" on:click={() => showSLTP = !showSLTP}>
							<span>Stop Loss / Take Profit</span>
							<span class="ev-sltp-badges">
								{#if stopLoss > 0}<span class="sl-badge">SL {stopLoss.toFixed(1)}¢</span>{/if}
								{#if takeProfit > 0}<span class="tp-badge">TP {takeProfit.toFixed(1)}¢</span>{/if}
								<span class="ev-sltp-arrow">{showSLTP ? '▲' : '▼'}</span>
							</span>
						</button>
						{#if showSLTP}
						<div class="ev-sltp-body" transition:slide={{ duration: 160 }}>
							<div class="ev-sltp-grid">
								<div class="ev-sltp-group">
									<label><span class="sl-badge">SL</span> Stop Loss</label>
									<div class="ev-sltp-input-wrap">
										<input type="number" bind:value={stopLoss} min="0" step="0.01" placeholder="45.5" class="ev-sltp-input" />
										<span>¢</span>
									</div>
								</div>
								<div class="ev-sltp-group">
									<label><span class="tp-badge">TP</span> Take Profit</label>
									<div class="ev-sltp-input-wrap">
										<input type="number" bind:value={takeProfit} min="0" step="0.01" placeholder="85.5" class="ev-sltp-input" />
										<span>¢</span>
									</div>
								</div>
							</div>
						</div>
						{/if}
					</div>
					{/if}

					<!-- Sell positions list -->
					{#if tradeTab === 'Sell'}
						{#if loadingPositions}
							<div class="ev-positions-loading">Loading positions…</div>
						{:else if userPositions.length > 0}
							<div class="ev-positions">
								{#each userPositions as pos}
									<button
										class="ev-pos-row"
										class:active={selectedPosition?.positionId === pos.positionId}
										on:click={() => { selectedPosition = pos; amount = 0; }}
									>
										<span>{pos.predictionType}</span>
										<span>{pos.remainingShares.toFixed(2)} shares @ {(pos.pricePerShare*100).toFixed(1)}¢</span>
									</button>
								{/each}
							</div>
						{:else if walletState.connected}
							<div class="ev-no-pos">No {selectedSide} positions</div>
						{/if}
					{/if}

					<!-- Trade summary -->
					{#if amount > 0 && tradeTab === 'Buy'}
						{@const price = selectedSide === 'Yes' ? (selectedMarket.yesPrice||0) : (selectedMarket.noPrice||0)}
						{@const shares = price > 0 ? amount / price : 0}
						<div class="ev-summary" transition:slide={{ duration: 180 }}>
							<div class="ev-sum-row"><span>Avg price</span><span>{(price*100).toFixed(1)}¢</span></div>
							<div class="ev-sum-row"><span>Shares</span><span>{shares.toFixed(2)}</span></div>
							<div class="ev-sum-row highlight"><span>Potential win</span><span class="orange">${shares.toFixed(2)}</span></div>
						</div>
					{/if}

					<!-- Action button -->
					<button
						class="ev-action"
						class:ev-action-enabled={walletState.connected && amount > 0 && !trading && !isMarketResolved(selectedMarket) && (tradeTab === 'Buy' || (tradeTab === 'Sell' && selectedPosition))}
						disabled={!walletState.connected || amount <= 0 || trading || isMarketResolved(selectedMarket) || (tradeTab === 'Sell' && !selectedPosition)}
						on:click={handleTrade}
					>
						{#if trading}Processing…
						{:else if isMarketResolved(selectedMarket)}Market Resolved
						{:else if !walletState.connected}Connect Wallet
						{:else if tradeTab === 'Sell' && !selectedPosition}No {selectedSide} Position
						{:else}{tradeTab} {selectedSide}
						{/if}
					</button>

					</div><!-- ev-trade-inner -->

				{:else}
					<div class="ev-no-market-trade">← Select a market to trade</div>
				{/if}
			</div>

		</div><!-- end ev-body -->
	{/if}
</div>

<!-- Confirmation Modal -->
{#if showConfirmModal}
<div class="pm-overlay" on:click={cancelTrade} on:keydown={(e) => e.key === 'Escape' && cancelTrade()} role="button" tabindex="0">
	<div class="pm-modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" tabindex="-1">
		<div class="pm-dot pending"></div>
		<h3 class="pm-title">{modalTitle}</h3>
		{#if modalDetails}
		<div class="pm-details">
			<div class="pm-row">
				<span class="pm-label">Market</span>
				<span class="pm-value" style="max-width: 200px; text-align: right;">{modalDetails.market}</span>
			</div>
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

<!-- Session Required Modal -->
{#if showSessionRequiredModal}
<div class="pm-overlay" on:keydown={(e) => e.key === 'Escape' && e.preventDefault()} role="dialog" tabindex="0">
	<div class="pm-modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" tabindex="-1">
		<div class="pm-dot pending"></div>
		<h3 class="pm-title">Session Required</h3>
		<p class="pm-desc">
			You need an active session to trade. Enable one-click trading from the session button in the navbar to sign once and trade instantly.
		</p>
		<button class="pm-btn primary" on:click={() => showSessionRequiredModal = false}>Got it</button>
	</div>
</div>
{/if}

<style>
	:global(body) {
		margin: 0; padding: 0;
		background: #000;
		color: #e8e8e8;
		font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	}

	/* ── PAGE SHELL ── */
	.ev-page {
		display: flex; flex-direction: column;
		height: 100vh; overflow: hidden;
		background: #000;
	}

	/* ── LOADING / ERROR ── */
	.ev-loading, .ev-error {
		display: flex; flex-direction: column;
		align-items: center; justify-content: center;
		height: 100vh; gap: 14px; color: #555;
	}
	.ev-spinner {
		width: 26px; height: 26px;
		border: 2px solid #1a1a1a; border-top-color: #F97316;
		border-radius: 50%; animation: spin 0.75s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
	.ev-error h2 { color: #e8e8e8; margin: 0; font-size: 20px; }
	.ev-error p  { color: #555; margin: 0; font-size: 14px; }
	.ev-error button {
		background: transparent; border: 1px solid #2a2a2a;
		color: #888; padding: 9px 18px; border-radius: 8px;
		cursor: pointer; font-size: 13px; transition: all 0.15s;
	}
	.ev-error button:hover { border-color: #F97316; color: #F97316; }

	/* ── TOP HEADER ── */
	.ev-header {
		display: flex; align-items: center; gap: 10px;
		padding: 0 14px; height: 50px; flex-shrink: 0;
		border-bottom: 1px solid #111;
		background: #000;
	}
	.ev-back {
		background: transparent; border: 1px solid #1e1e1e;
		color: #555; width: 30px; height: 30px; border-radius: 6px;
		cursor: pointer; font-size: 15px; flex-shrink: 0;
		display: flex; align-items: center; justify-content: center;
		transition: all 0.15s;
	}
	.ev-back:hover { border-color: #F97316; color: #F97316; }
	.ev-logo {
		width: 26px; height: 26px; border-radius: 5px;
		object-fit: cover; flex-shrink: 0;
	}
	.ev-title {
		font-size: 14px; font-weight: 600; color: #d0d0d0;
		flex: 1; min-width: 0;
		overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
	}
	.ev-header-meta { display: flex; gap: 6px; flex-shrink: 0; }
	.ev-meta-chip {
		font-size: 11px; padding: 3px 8px; border-radius: 20px;
		background: rgba(16,185,129,0.1); color: #10b981;
		border: 1px solid rgba(16,185,129,0.18); font-weight: 600;
	}
	.ev-meta-chip.resolved {
		background: rgba(107,114,128,0.1); color: #6b7280;
		border-color: rgba(107,114,128,0.2);
	}

	/* ── 3-COLUMN BODY ── */
	.ev-body {
		flex: 1; min-height: 0;
		display: grid;
		grid-template-columns: 210px 1fr 296px;
		overflow: hidden;
	}

	/* ── LEFT SIDEBAR ── */
	.ev-sidebar {
		border-right: 1px solid #111;
		overflow-y: auto; overflow-x: hidden;
		display: flex; flex-direction: column;
		scrollbar-width: thin; scrollbar-color: #1e1e1e transparent;
		background: #000;
	}
	.ev-sidebar-label {
		font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
		color: #333; padding: 14px 12px 6px;
		text-transform: uppercase; flex-shrink: 0; user-select: none;
	}
	.ev-mrow {
		display: flex; align-items: center; gap: 8px;
		padding: 9px 12px;
		background: transparent; border: none; border-left: 2px solid transparent;
		text-align: left; cursor: pointer; width: 100%;
		transition: background 0.12s, border-color 0.12s;
	}
	.ev-mrow:hover { background: rgba(255,255,255,0.025); }
	.ev-mrow:hover .ev-mrow-name { color: #e0e0e0; }
	.ev-mrow.active {
		background: rgba(249,115,22,0.05);
		border-left-color: #F97316;
	}
	.ev-mrow.active .ev-mrow-name { color: #e8e8e8; }
	.ev-mrow.resolved { opacity: 0.45; }
	.ev-mrow-bar {
		width: 3px; height: 32px; flex-shrink: 0;
		background: #1a1a1a; border-radius: 2px;
		display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden;
	}
	.ev-mrow-fill {
		width: 100%; background: #10b981; border-radius: 2px;
		transition: height 0.4s ease;
	}
	.ev-mrow-info {
		flex: 1; min-width: 0;
		display: flex; flex-direction: column; gap: 2px;
	}
	.ev-mrow-name {
		font-size: 11.5px; color: #bbb; font-weight: 500;
		overflow: hidden; text-overflow: ellipsis;
		display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
		line-clamp: 2; line-height: 1.35; transition: color 0.12s;
	}
	.ev-mrow-pct { font-size: 12px; font-weight: 700; }
	.yes-color { color: #10b981; }
	.resolved-chip {
		font-size: 9px; padding: 2px 5px; border-radius: 3px;
		background: rgba(107,114,128,0.12); color: #6b7280;
		border: 1px solid rgba(107,114,128,0.18); align-self: flex-start;
		font-weight: 600; letter-spacing: 0.03em;
	}
	.ev-resolved-toggle {
		background: transparent; border: none; border-top: 1px solid #0f0f0f;
		color: #777; font-size: 11px; padding: 10px 12px;
		cursor: pointer; text-align: left; width: 100%;
		transition: color 0.12s;
	}
	.ev-resolved-toggle:hover { color: #bbb; }

	/* ── CENTER MAIN ── */
	.ev-main {
		display: flex; flex-direction: column;
		overflow: hidden; border-right: 1px solid #111;
		background: #000;
	}
	.ev-market-banner {
		flex-shrink: 0;
		padding: 14px 18px 12px;
		border-bottom: 1px solid #111;
		background: #030303;
	}
	.ev-market-title {
		font-size: 15px; font-weight: 700; color: #e8e8e8;
		line-height: 1.4; margin-bottom: 10px;
	}
	.ev-market-pills {
		display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
	}
	.ev-pill {
		padding: 5px 12px; border-radius: 20px; font-size: 12.5px; font-weight: 600;
		cursor: pointer; border: 1px solid; transition: all 0.15s;
		display: flex; align-items: center; gap: 5px; user-select: none;
	}
	.yes-pill { background: rgba(16,185,129,0.08); color: #10b981; border-color: rgba(16,185,129,0.2); }
	.yes-pill:hover { background: rgba(16,185,129,0.15); border-color: rgba(16,185,129,0.4); }
	.yes-pill.pill-active { background: rgba(16,185,129,0.18); border-color: #10b981; }
	.no-pill { background: rgba(239,68,68,0.08); color: #ef4444; border-color: rgba(239,68,68,0.2); }
	.no-pill:hover { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.4); }
	.no-pill.pill-active { background: rgba(239,68,68,0.18); border-color: #ef4444; }
	.ev-stat { font-size: 11.5px; color: #999; }
	.ev-center-tabs {
		display: flex; flex-shrink: 0;
		border-bottom: 1px solid #111;
		padding: 0 18px; background: #000;
	}
	.ev-ctab {
		background: transparent; border: none; border-bottom: 2px solid transparent;
		color: #777; padding: 9px 14px; font-size: 12.5px; font-weight: 600;
		cursor: pointer; transition: color 0.15s; margin-bottom: -1px;
		letter-spacing: 0.01em;
	}
	.ev-ctab:hover { color: #bbb; }
	.ev-ctab-active { color: #e8e8e8; border-bottom-color: #F97316; }
	.ev-center-content {
		flex: 1; overflow-y: auto; overflow-x: hidden;
		padding: 16px 18px;
		scrollbar-width: thin; scrollbar-color: #1a1a1a transparent;
	}
	.ev-center-content-chart {
		display: flex; flex-direction: column;
		padding: 12px 18px;
		overflow: hidden;
	}
	.ev-info-wrap { display: flex; flex-direction: column; gap: 20px; }
	.ev-no-market {
		display: flex; align-items: center; justify-content: center;
		height: 100%; color: #555; font-size: 13px; letter-spacing: 0.02em;
	}

	/* ── RIGHT TRADING PANEL ── */
	.ev-trade {
		display: flex; flex-direction: column;
		overflow: hidden; background: #000;
	}
	.ev-trade-inner {
		flex: 1; overflow-y: auto; overflow-x: hidden;
		display: flex; flex-direction: column; gap: 12px;
		padding: 14px 12px 8px;
		scrollbar-width: thin; scrollbar-color: #1a1a1a transparent;
	}
	.ev-no-market-trade {
		display: flex; align-items: center; justify-content: center;
		height: 100%; color: #555; font-size: 12px;
	}

	/* Yes / No outcome buttons */
	.ev-outcome-row { display: flex; gap: 7px; }
	.ev-outcome {
		flex: 1; padding: 11px 8px; border-radius: 9px;
		font-size: 12px; font-weight: 700;
		cursor: pointer; border: 1.5px solid;
		transition: all 0.15s; line-height: 1.3; text-align: center;
		user-select: none;
	}
	.ev-outcome-pct { font-size: 16px; font-weight: 800; display: block; margin-top: 2px; }
	.yes-outcome {
		background: rgba(16,185,129,0.06); color: #10b981;
		border-color: rgba(16,185,129,0.18);
	}
	.yes-outcome:hover { background: rgba(16,185,129,0.12); border-color: rgba(16,185,129,0.35); }
	.yes-outcome.active { background: rgba(16,185,129,0.18); border-color: #10b981; box-shadow: 0 0 0 1px rgba(16,185,129,0.15); }
	.no-outcome {
		background: rgba(239,68,68,0.06); color: #ef4444;
		border-color: rgba(239,68,68,0.18);
	}
	.no-outcome:hover { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.35); }
	.no-outcome.active { background: rgba(239,68,68,0.18); border-color: #ef4444; box-shadow: 0 0 0 1px rgba(239,68,68,0.15); }

	/* Buy / Sell tabs */
	.ev-trade-tabs {
		display: flex; gap: 0;
		border-bottom: 1px solid #111;
		margin: 0 -12px; padding: 0 12px;
	}
	.ev-ttab {
		flex: 1; background: transparent; border: none;
		border-bottom: 2px solid transparent; margin-bottom: -1px;
		color: #777; padding: 7px 0; font-size: 13px; font-weight: 600;
		cursor: pointer; transition: color 0.15s; letter-spacing: 0.01em;
	}
	.ev-ttab:hover { color: #bbb; }
	.ev-ttab-active { color: #e8e8e8; border-bottom-color: #F97316; }

	/* Amount block */
	.ev-amount-block { display: flex; flex-direction: column; gap: 7px; }
	.ev-amount-row {
		display: flex; justify-content: space-between; align-items: baseline;
	}
	.ev-amount-label { font-size: 11px; font-weight: 600; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em; }
	.ev-balance { font-size: 11px; color: #F97316; font-weight: 600; }
	.ev-input-wrap {
		position: relative; display: flex; align-items: center;
		background: #080808; border: 1px solid #1e1e1e; border-radius: 8px;
		transition: border-color 0.15s;
	}
	.ev-input-wrap:focus-within { border-color: #F97316; }
	.ev-currency {
		position: absolute; left: 11px; font-size: 15px; font-weight: 700;
		color: #888; pointer-events: none; user-select: none;
	}
	.ev-suffix { padding: 0 11px; font-size: 12px; color: #888; flex-shrink: 0; }
	.ev-input {
		width: 100%; background: transparent; border: none;
		color: #e8e8e8; padding: 11px 11px 11px 26px;
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 15px; font-weight: 700; outline: none; min-width: 0;
	}
	.ev-input.ev-input-sell { padding-left: 11px; }
	.ev-input::placeholder { color: #444; }
	.ev-quick { display: flex; gap: 5px; }
	.ev-qbtn {
		flex: 1; background: #080808; border: 1px solid #1e1e1e;
		color: #aaa; font-size: 11px; font-weight: 600;
		padding: 6px 2px; border-radius: 6px; cursor: pointer;
		transition: all 0.12s; user-select: none;
	}
	.ev-qbtn:hover { border-color: #F97316; color: #F97316; background: rgba(249,115,22,0.05); }

	/* SL/TP */
	.ev-sltp-wrap { border: 1px solid #1a1a1a; border-radius: 8px; }
	.ev-sltp-toggle {
		width: 100%; background: #080808; border: none; border-radius: 8px;
		color: #aaa; font-size: 11.5px; font-weight: 600;
		padding: 9px 11px; cursor: pointer;
		display: flex; justify-content: space-between; align-items: center;
		transition: color 0.12s; letter-spacing: 0.01em;
	}
	.ev-sltp-toggle:hover { color: #e8e8e8; }
	.ev-sltp-badges { display: flex; align-items: center; gap: 5px; }
	.sl-badge {
		font-size: 9.5px; padding: 2px 5px; border-radius: 3px; font-weight: 700;
		background: rgba(239,68,68,0.12); color: #ef4444;
		border: 1px solid rgba(239,68,68,0.25);
	}
	.tp-badge {
		font-size: 9.5px; padding: 2px 5px; border-radius: 3px; font-weight: 700;
		background: rgba(16,185,129,0.12); color: #10b981;
		border: 1px solid rgba(16,185,129,0.25);
	}
	.ev-sltp-arrow { font-size: 9px; color: #888; margin-left: 2px; }
	.ev-sltp-body {
		padding: 10px 11px 12px;
		border-top: 1px solid #111;
	}
	.ev-sltp-grid { display: flex; flex-direction: column; gap: 8px; }
	.ev-sltp-group { display: flex; flex-direction: column; gap: 4px; }
	.ev-sltp-group label {
		font-size: 10.5px; color: #aaa; display: flex; align-items: center;
		gap: 5px; font-weight: 600; letter-spacing: 0.02em;
	}
	.ev-sltp-input-wrap {
		display: flex; align-items: center;
		background: #060606; border: 1px solid #1a1a1a; border-radius: 6px;
		width: 100%; transition: border-color 0.15s;
	}
	.ev-sltp-input-wrap:focus-within { border-color: #F97316; }
	.ev-sltp-input-wrap span { padding: 0 10px; font-size: 11px; color: #888; flex-shrink: 0; }
	.ev-sltp-input {
		flex: 1; min-width: 0; background: transparent; border: none; color: #e8e8e8;
		padding: 8px 0 8px 10px; font-size: 13px; font-weight: 600; outline: none;
		-moz-appearance: textfield;
	}
	.ev-sltp-input::-webkit-outer-spin-button,
	.ev-sltp-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

	/* Sell positions */
	.ev-positions { display: flex; flex-direction: column; gap: 4px; }
	.ev-pos-row {
		background: #080808; border: 1px solid #1a1a1a; border-radius: 6px;
		padding: 8px 10px; font-size: 11.5px; color: #ccc; cursor: pointer;
		display: flex; justify-content: space-between;
		transition: all 0.12s; width: 100%; text-align: left;
	}
	.ev-pos-row:hover { border-color: #2a2a2a; color: #bbb; }
	.ev-pos-row.active { border-color: #F97316; color: #e8e8e8; background: rgba(249,115,22,0.04); }
	.ev-no-pos, .ev-positions-loading { font-size: 11.5px; color: #777; text-align: center; padding: 6px 0; }

	/* Trade summary */
	.ev-summary {
		background: #060606; border: 1px solid #111; border-radius: 8px;
		padding: 10px 11px;
	}
	.ev-sum-row {
		display: flex; justify-content: space-between; align-items: center;
		font-size: 12px; color: #aaa; padding: 3px 0;
	}
	.ev-sum-row.highlight {
		border-top: 1px solid #111; margin-top: 4px; padding-top: 7px;
		color: #ccc;
	}
	.orange { color: #F97316; font-weight: 700; }

	/* Sticky action button */
	.ev-action {
		width: 100%; padding: 12px;
		background: transparent; border: 1px solid #2a2a2a;
		color: #666; font-size: 14px; font-weight: 700; border-radius: 9px;
		cursor: not-allowed; transition: all 0.15s; letter-spacing: 0.02em;
		user-select: none;
	}
	.ev-action.ev-action-enabled {
		border-color: #F97316; color: #F97316; cursor: pointer;
	}
	.ev-action.ev-action-enabled:hover {
		background: rgba(249,115,22,0.08); box-shadow: 0 0 16px rgba(249,115,22,0.1);
	}
	.ev-action:disabled { opacity: 0.4; }

	/* ── MODALS ── */
	.pm-overlay {
		position: fixed; inset: 0;
		background: rgba(0,0,0,0.8); backdrop-filter: blur(8px);
		display: flex; align-items: center; justify-content: center;
		z-index: 1001; animation: pmFadeIn 0.2s ease-out;
	}
	@keyframes pmFadeIn { from { opacity: 0; } to { opacity: 1; } }
	.pm-modal {
		background: #0a0a0a; border: 1px solid #222; border-radius: 18px;
		padding: 32px 28px; max-width: 400px; width: 90vw;
		text-align: center; animation: pmSlideUp 0.25s ease-out;
	}
	@keyframes pmSlideUp {
		from { opacity: 0; transform: translateY(16px); }
		to   { opacity: 1; transform: translateY(0); }
	}
	.pm-dot { width: 12px; height: 12px; border-radius: 50%; margin: 0 auto 18px; }
	.pm-dot.pending { background: #F97316; box-shadow: 0 0 14px rgba(249,115,22,0.4); animation: pmPulse 2s ease-in-out infinite; }
	@keyframes pmPulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
	.pm-title { color: #fff; font-size: 20px; font-weight: 700; margin: 0 0 10px; }
	.pm-desc  { color: #aaa; font-size: 13px; line-height: 1.6; margin: 0 0 20px; }
	.pm-details {
		background: rgba(255,255,255,0.02); border: 1px solid #161616;
		border-radius: 10px; padding: 14px; margin-bottom: 20px; text-align: left;
	}
	.pm-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; }
	.pm-row + .pm-row { border-top: 1px solid #161616; margin-top: 5px; padding-top: 10px; }
	.pm-row.highlight { padding: 8px; margin: 5px -6px 0; background: rgba(249,115,22,0.07); border: 1px solid rgba(249,115,22,0.2); border-radius: 7px; }
	.pm-label { color: #999; font-size: 12.5px; }
	.pm-value { color: #e8e8e8; font-size: 12.5px; font-weight: 600; }
	.pm-value.highlight-value { color: #F97316; }
	.pm-value.sl-value { color: #ef4444; }
	.pm-value.tp-value { color: #10b981; }
	.pm-actions { display: flex; gap: 10px; margin-top: 4px; }
	.pm-btn {
		flex: 1; padding: 12px; border: none; border-radius: 10px;
		font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.15s;
	}
	.pm-btn.primary { background: #F97316; color: #000; }
	.pm-btn.primary:hover:not(:disabled) { background: #ea580c; }
	.pm-btn.primary:disabled { opacity: 0.6; cursor: not-allowed; }
	.pm-btn.secondary { background: transparent; color: #aaa; border: 1px solid #2a2a2a; }
	.pm-btn.secondary:hover { border-color: #444; color: #e8e8e8; }

	/* ── TOAST ── */
	.toast {
		position: fixed; top: 14px; right: 14px; z-index: 10000;
		width: 300px; background: #111; border: 1px solid #222;
		border-radius: 6px; padding: 11px 13px;
		animation: toast-in 0.22s ease-out forwards;
		box-shadow: 0 8px 32px rgba(0,0,0,0.5);
	}
	.toast.success { border-left: 3px solid #10b981; }
	.toast.error   { border-left: 3px solid #ef4444; }
	.toast-header  { display: flex; align-items: center; gap: 7px; margin-bottom: 5px; }
	.toast-icon    { font-size: 13px; font-weight: 700; }
	.toast.success .toast-icon  { color: #10b981; }
	.toast.error   .toast-icon  { color: #ef4444; }
	.toast-title   { font-size: 12px; font-weight: 700; letter-spacing: 0.04em; }
	.toast.success .toast-title { color: #10b981; }
	.toast.error   .toast-title { color: #ef4444; }
	.toast-close   { margin-left: auto; background: none; border: none; color: #777; font-size: 17px; cursor: pointer; padding: 0; line-height: 1; }
	.toast-close:hover { color: #e8e8e8; }
	.toast-msg     { font-size: 11.5px; color: #ccc; line-height: 1.4; margin: 0; padding-left: 20px; }
	@keyframes toast-in {
		from { opacity: 0; transform: translateX(16px); }
		to   { opacity: 1; transform: translateX(0); }
	}

	/* ── SCROLLBARS ── */
	::-webkit-scrollbar { width: 3px; }
	::-webkit-scrollbar-track { background: transparent; }
	::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 2px; }
	::-webkit-scrollbar-thumb:hover { background: #333; }

	/* ── RESPONSIVE ── */
	@media (max-width: 960px) {
		.ev-body { grid-template-columns: 190px 1fr; }
		.ev-trade { display: none; }
	}
	@media (max-width: 640px) {
		.ev-body { grid-template-columns: 1fr; }
		.ev-sidebar { display: none; }
	}
</style>
