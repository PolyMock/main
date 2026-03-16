<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { polymarketClient, type PolyEvent, type PolyMarket } from '$lib/polymarket';
	import { walletStore, refreshUserBalance } from '$lib/wallet/stores';
	import { polymarketService } from '$lib/solana/polymarket-service';
	import { sessionKeyManager } from '$lib/solana/session-keys';
	import { PublicKey } from '@solana/web3.js';
	import MarketRules from '$lib/components/MarketRules.svelte';
	import MarketComments from '$lib/components/MarketComments.svelte';
	const polymockLogo = '/1.png';

	let event: PolyEvent | null = null;
	let loading = true;
	let error = false;
	let selectedMarket: PolyMarket | null = null;
	let selectedSide: 'Yes' | 'No' = 'Yes';
	let tradeTab: 'Buy' | 'Sell' = 'Buy';
	let amount = 0; // For buy: USD amount, For sell: shares count
	let showResolved = false;
	let trading = false;
	let walletState = $walletStore;
	let showInfoView: 'markets' | 'info' = 'markets'; // Toggle between markets and rules/comments

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
			// Fetch all events WITHOUT prices first (fast)
			const events = await polymarketClient.fetchEvents(100, false);
			event = events.find(e => e.slug === slug) || null;

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

	function matchPanelHeights() {
		const tradingPanel = document.querySelector('.trading-panel');
		const marketsPanel = document.querySelector('.markets-panel');

		if (tradingPanel && marketsPanel) {
			const tradingHeight = tradingPanel.offsetHeight;
			(marketsPanel as HTMLElement).style.height = `${tradingHeight}px`;
			(marketsPanel as HTMLElement).style.minHeight = `${tradingHeight}px`;
			(marketsPanel as HTMLElement).style.maxHeight = `${tradingHeight}px`;
			console.log('Matched heights:', tradingHeight);
		}
	}

	onMount(() => {
		fetchEvent();

		// Match heights after content loads with multiple attempts
		setTimeout(matchPanelHeights, 100);
		setTimeout(matchPanelHeights, 500);
		setTimeout(matchPanelHeights, 1000);

		// Watch for changes in trading panel only
		const observer = new MutationObserver(matchPanelHeights);
		const tradingPanel = document.querySelector('.trading-panel');
		if (tradingPanel) {
			observer.observe(tradingPanel, { childList: true, subtree: true });
		}

		return () => observer.disconnect();
	});

	// React to state changes
	$: if (selectedMarket || tradeTab || stopLoss || takeProfit) {
		setTimeout(matchPanelHeights, 50);
	}
</script>

<div class="event-page">
	<div class="page-header">
		<button class="back-button" on:click={goBack}>← Back to Markets</button>
	</div>

	{#if loading}
		<div class="loading-state">Loading event details...</div>
	{:else if error || !event}
		<div class="error-state">
			<h2>Event not found</h2>
			<p>The event you're looking for doesn't exist or has been removed.</p>
			<button class="back-button-primary" on:click={goBack}>Go back to Markets</button>
		</div>
	{:else}
		<div class="event-container">
			<!-- LEFT PANEL: Markets List -->
			<div class="markets-panel">
				<!-- Event Header -->
				<div class="event-header">
					<div class="event-header-left">
						{#if event.image}
							<img src={event.image} alt={event.title} class="event-icon" />
						{/if}
						<h1 class="event-title">{event.title}</h1>
						<button
							class="info-toggle-btn"
							on:click={() => showInfoView = showInfoView === 'markets' ? 'info' : 'markets'}
						>
							{showInfoView === 'markets' ? 'Info' : 'Markets'}
						</button>
					</div>
					<div class="event-header-right">
						<img src={polymockLogo} alt="Polymock" class="polymarket-icon" />
						<span class="polymarket-text">Polymock</span>
					</div>
				</div>

				<!-- Markets List (Scrollable) -->
				{#if showInfoView === 'markets'}
				<div class="markets-list">
					{#each displayedMarkets as market}
						<div
							class="market-row"
							class:selected={selectedMarket?.id === market.id}
						>
							<!-- Left: Icon + Name + Volume (Clickable) -->
							<div class="market-info" on:click={() => selectMarket(market)} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && selectMarket(market)}>
								{#if market.image}
									<img src={market.image} alt={market.question} class="market-icon" />
								{/if}
								<div class="market-details">
									<div class="market-name">{market.question || 'Unknown'}</div>
									<div class="market-volume">
										{market.volume_24hr
											? `$${(market.volume_24hr / 1000000).toFixed(1)}M Vol.`
											: (market.volume ? `$${(market.volume / 1000000).toFixed(1)}M Vol.` : '$0 Vol.')}
									</div>
								</div>
							</div>

							<!-- Center: Percentage or Resolved Badge (Clickable) -->
							<div class="market-percentage" on:click={() => selectMarket(market)} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && selectMarket(market)}>
								{#if isMarketResolved(market)}
									<span class="resolved-badge">Resolved</span>
								{:else}
									{((market.yesPrice || 0) * 100).toFixed(0)}%
								{/if}
							</div>

							<!-- Right: Buy Buttons -->
							<div class="market-actions">
								<button class="buy-btn yes-btn" on:click={() => { selectMarket(market); selectedSide = 'Yes'; }}>
									Buy Yes {((market.yesPrice || 0) * 100).toFixed(1)}¢
								</button>
								<button class="buy-btn no-btn" on:click={() => { selectMarket(market); selectedSide = 'No'; }}>
									Buy No {((market.noPrice || 0) * 100).toFixed(1)}¢
								</button>
							</div>
						</div>
					{/each}

					<!-- View/Hide Resolved Markets Button -->
					{#if resolvedMarkets.length > 0}
						<div class="resolved-toggle-container">
							<button class="resolved-toggle-btn" on:click={() => showResolved = !showResolved}>
								{#if showResolved}
									Hide Resolved ({resolvedMarkets.length})
								{:else}
									View Resolved ({resolvedMarkets.length})
								{/if}
							</button>
						</div>
					{/if}
				</div>

				{:else if showInfoView === 'info'}
				<div class="info-view">
					<!-- Rules Section -->
					{#if event}
						<div class="info-section">
							<MarketRules event={event} market={selectedMarket} />
						</div>
					{/if}

					<!-- Comments Section -->
					{#if event}
						<div class="info-section">
							<MarketComments marketId={event.id} />
						</div>
					{/if}
				</div>
				{/if}
			</div>

			<!-- RIGHT PANEL: Trading Interface -->
			<div class="trading-panel">
				{#if selectedMarket}
					<!-- Selected Market Header -->
					<div class="trading-header">
						{#if selectedMarket.image}
							<img src={selectedMarket.image} alt={selectedMarket.question} class="trading-market-icon" />
						{/if}
						<h2 class="trading-market-name">{selectedMarket.question}</h2>
					</div>

					<!-- Buy/Sell Tabs -->
					<div class="trade-tabs">
						<button
							class="trade-tab"
							class:active={tradeTab === 'Buy'}
							on:click={() => tradeTab = 'Buy'}
						>
							Buy
						</button>
						<button
							class="trade-tab"
							class:active={tradeTab === 'Sell'}
							on:click={() => tradeTab = 'Sell'}
						>
							Sell
						</button>
					</div>

					<!-- Yes/No Selection -->
					<div class="outcome-selection">
						<button
							class="outcome-btn yes-outcome"
							class:active={selectedSide === 'Yes'}
							on:click={() => { selectedSide = 'Yes'; selectedPosition = null; amount = 0; }}
						>
							Yes {((selectedMarket.yesPrice || 0) * 100).toFixed(1)}¢
						</button>
						<button
							class="outcome-btn no-outcome"
							class:active={selectedSide === 'No'}
							on:click={() => { selectedSide = 'No'; selectedPosition = null; amount = 0; }}
						>
							No {((selectedMarket.noPrice || 0) * 100).toFixed(1)}¢
						</button>
					</div>

					<!-- Amount Input -->
					<div class="amount-section">
						<label class="amount-label">{tradeTab === 'Buy' ? 'Amount' : 'Shares'}</label>
						<div class="balance-text">
							{#if tradeTab === 'Buy'}
								Balance ${walletState.usdcBalance.toFixed(2)}
							{:else if selectedPosition}
								{selectedPosition.remainingShares.toFixed(2)} shares available
							{/if}
						</div>
						<div class="amount-input-wrapper">
							{#if tradeTab === 'Buy'}
								<span class="amount-currency">$</span>
							{/if}
							<input
								type="text"
								inputmode="decimal"
								value={amount || ''}
								on:input={(e) => {
									const val = e.target.value;
									if (val === '' || val === '.') {
										amount = 0;
										return;
									}
									const parsed = parseFloat(val);
									if (!isNaN(parsed)) {
										amount = parsed;
									}
								}}
								placeholder="0.00"
								class="amount-input"
								class:sell-mode={tradeTab === 'Sell'}
							/>
							{#if tradeTab === 'Sell'}
								<span class="amount-suffix">shares</span>
							{/if}
						</div>

						<!-- Quick Amount Buttons -->
						<div class="quick-amounts">
							{#if tradeTab === 'Buy'}
								<button class="quick-btn" on:click={() => addAmount(1)}>+$1</button>
								<button class="quick-btn" on:click={() => addAmount(20)}>+$20</button>
								<button class="quick-btn" on:click={() => addAmount(100)}>+$100</button>
								<button class="quick-btn" on:click={setMaxAmount}>Max</button>
							{:else if selectedPosition}
								<button class="quick-btn" on:click={() => {
									amount = selectedPosition.remainingShares * 0.25;
								}}>25%</button>
								<button class="quick-btn" on:click={() => {
									amount = selectedPosition.remainingShares * 0.5;
								}}>50%</button>
								<button class="quick-btn" on:click={() => {
									amount = selectedPosition.remainingShares * 0.75;
								}}>75%</button>
								<button class="quick-btn" on:click={setMaxAmount}>Max</button>
							{/if}
						</div>
					</div>

					<!-- Advanced Settings (SL/TP) - Only for Buy Tab -->
					{#if tradeTab === 'Buy'}
					<div class="advanced-section">
						<div class="advanced-header">
							<span class="advanced-title">Stop Loss / Take Profit</span>
							<span class="advanced-subtitle">Automated exit conditions</span>
						</div>

						<div class="advanced-content">
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
											max={selectedMarket.yesPrice || selectedMarket.noPrice}
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
											min={selectedMarket.yesPrice || selectedMarket.noPrice}
											max="100"
											step="0.01"
											placeholder="85.5"
										/>
										<span class="sltp-currency">¢</span>
									</div>
									<span class="sltp-description">Exit if price rises to this level</span>
								</div>
							</div>

							<div class="sltp-active-summary">
								<div class="sltp-active-title">Active Conditions</div>
								<div class="sltp-active-items">
									<div class="sltp-active-item sl-item">
										<span class="sltp-active-badge sl-badge">SL</span>
										<span class="sltp-active-value">{stopLoss > 0 ? `${stopLoss.toFixed(2)}¢` : 'No'}</span>
									</div>
									<div class="sltp-active-item tp-item">
										<span class="sltp-active-badge tp-badge">TP</span>
										<span class="sltp-active-value">{takeProfit > 0 ? `${takeProfit.toFixed(2)}¢` : 'No'}</span>
									</div>
								</div>
							</div>
						</div>
					</div>
					{/if}

					<!-- Action Button -->
					<button
						class="action-button"
						class:enabled={walletState.connected && amount > 0 && !trading && !isMarketResolved(selectedMarket) && (tradeTab === 'Buy' || (tradeTab === 'Sell' && selectedPosition && userPositions.length > 0))}
						disabled={!walletState.connected || amount <= 0 || trading || isMarketResolved(selectedMarket) || (tradeTab === 'Sell' && (!selectedPosition || userPositions.length === 0))}
						on:click={handleTrade}
					>
						{#if trading}
							Processing...
						{:else if isMarketResolved(selectedMarket)}
							Market Resolved
						{:else if !walletState.connected}
							Connect Wallet
						{:else if tradeTab === 'Sell' && (!selectedPosition || userPositions.length === 0)}
							No {selectedSide} Position
						{:else}
							{tradeTab} {selectedSide}
						{/if}
					</button>

					<!-- Terms -->
					<div class="terms-text">
						By trading, you agree to the <a href="#" target="_blank">Terms of Use</a>.
					</div>
				{:else}
					<div class="no-selection">
						<p>Select a market to start trading</p>
					</div>
				{/if}
			</div>
		</div>
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
		margin: 0;
		padding: 0;
		background: #000000;
		color: #E8E8E8;
		font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	}

	.event-page {
		min-height: 100vh;
		background: #000000;
		padding: 12px;
		overflow-x: hidden;
		max-width: 100vw;
		box-sizing: border-box;
	}

	.page-header {
		margin-bottom: 24px;
	}

	.back-button {
		background: #000000;
		border: 1px solid #404040;
		color: #E8E8E8;
		padding: 10px 20px;
		border-radius: 8px;
		cursor: pointer;
		font-family: Inter, sans-serif;
		font-size: 14px;
		font-weight: 500;
		transition: all 200ms ease-out;
	}

	.back-button:hover {
		background: #1E2139;
		border-color: #F97316;
		color: #F97316;
	}

	.back-button-primary {
		background: #F97316;
		border: none;
		color: #ffffff;
		padding: 12px 24px;
		border-radius: 8px;
		cursor: pointer;
		font-family: Inter, sans-serif;
		font-size: 14px;
		font-weight: 600;
		transition: all 200ms ease-out;
		margin-top: 16px;
	}

	.back-button-primary:hover {
		background: #F97316;
		transform: none;
	}

	.loading-state,
	.error-state {
		padding: 60px 20px;
		text-align: center;
		color: #666;
		font-size: 14px;
	}

	.error-state {
		color: #FF4757;
	}

	.error-state h2 {
		color: #E8E8E8;
		margin-bottom: 12px;
	}

	.error-state p {
		color: #9BA3B4;
		margin-bottom: 24px;
	}

	/* Main Container: Split Layout */
	.event-container {
		display: grid;
		grid-template-columns: 1fr 350px;
		gap: 12px;
		max-width: 100%;
		margin: 0;
		width: 100%;
		box-sizing: border-box;
		align-items: start;
	}

	/* LEFT PANEL: Markets List */
	.markets-panel {
		background: #000000;
		border: 1px solid #404040;
		border-radius: 16px;
		display: flex;
		flex-direction: column;
		overflow: hidden !important;
	}

	.event-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 24px;
		border-bottom: 1px solid #404040;
		background: rgba(0, 0, 0, 0.5);
		flex-shrink: 0;
	}

	.event-header-left {
		display: flex;
		align-items: center;
		gap: 16px;
		flex: 1;
		min-width: 0;
	}

	.event-header-right {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
	}

	.event-icon {
		width: 48px;
		height: 48px;
		border-radius: 8px;
		object-fit: cover;
		flex-shrink: 0;
	}

	.event-title {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
		color: #E8E8E8;
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}

	.info-toggle-btn {
		padding: 6px 16px;
		background: transparent;
		border: 1px solid #404040;
		border-radius: 6px;
		color: #999999;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: all 200ms ease-out;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.info-toggle-btn:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: #F97316;
		color: #F97316;
	}

	.polymarket-icon {
		width: 48px;
		height: 48px;
		object-fit: contain;
	}

	.polymarket-text {
		font-size: 16px;
		color: #FFFFFF;
		font-weight: 600;
		font-family: 'Open Sauce', 'Inter', sans-serif;
		letter-spacing: 0.3px;
	}

	.markets-list {
		padding: 16px 24px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1 1 auto;
		overflow-y: auto;
		min-height: 0;
	}

	/* Info View */
	.info-view {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.info-section {
		border-top: 1px solid #404040;
	}

	.market-row {
		display: flex;
		align-items: center;
		padding: 12px 16px;
		border-bottom: 1px solid #404040;
		background: transparent;
		border-left: 3px solid transparent;
		transition: all 150ms ease-out;
		width: 100%;
		text-align: left;
		font-family: Inter, sans-serif;
		gap: 12px;
	}

	.market-row:hover {
		background: rgba(255, 255, 255, 0.03);
	}

	.market-row.selected {
		background: rgba(0, 208, 132, 0.05);
		border-left-color: #F97316;
	}

	.market-info {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 1;
		min-width: 0;
		cursor: pointer;
	}

	.market-icon {
		width: 40px;
		height: 40px;
		border-radius: 6px;
		object-fit: cover;
		flex-shrink: 0;
		background: rgba(255, 255, 255, 0.05);
	}

	.market-details {
		flex: 1;
		min-width: 0;
	}

	.market-name {
		color: #E8E8E8;
		font-size: 14px;
		font-weight: 600;
		margin-bottom: 4px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.market-volume {
		color: #9BA3B4;
		font-size: 12px;
		font-weight: 400;
	}

	.market-percentage {
		font-size: 28px;
		font-weight: 700;
		color: #E8E8E8;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		flex-shrink: 0;
		min-width: 80px;
		text-align: center;
		cursor: pointer;
	}

	.resolved-badge {
		display: inline-block;
		padding: 6px 12px;
		background: rgba(155, 163, 180, 0.2);
		border: 1px solid rgba(155, 163, 180, 0.4);
		border-radius: 6px;
		color: #9BA3B4;
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-family: Inter, sans-serif;
	}

	.market-actions {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
	}

	.buy-btn {
		padding: 8px 12px;
		border-radius: 6px;
		font-family: Inter, sans-serif;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 150ms ease-out;
		white-space: nowrap;
	}

	.yes-btn {
		background: rgba(0, 208, 132, 0.15);
		color: #00D084;
		border: 1px solid rgba(0, 208, 132, 0.3);
	}

	.yes-btn:hover {
		background: rgba(0, 208, 132, 0.25);
		border-color: #00D084;
		color: #00D084;
		transform: none;
	}

	.no-btn {
		background: rgba(255, 71, 87, 0.15);
		color: #FF4757;
		border: 1px solid rgba(255, 71, 87, 0.3);
	}

	.no-btn:hover {
		background: rgba(255, 71, 87, 0.25);
		border-color: #FF4757;
		color: #FF4757;
		transform: none;
	}

	.resolved-toggle-container {
		padding: 16px 24px;
		border-top: 1px solid #404040;
		background: rgba(0, 0, 0, 0.3);
		display: flex;
		justify-content: center;
	}

	.resolved-toggle-btn {
		padding: 10px 24px;
		background: #000000;
		border: 1px solid #404040;
		color: #FFFFFF;
		font-family: Inter, sans-serif;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		border-radius: 6px;
		transition: all 150ms ease-out;
	}

	.resolved-toggle-btn:hover {
		background: #000000;
		border-color: #F97316;
		color: #F97316;
	}

	/* RIGHT PANEL: Trading Interface */
	.trading-panel {
		background: #000000;
		border: 1px solid #404040;
		border-radius: 16px;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.trading-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding-bottom: 20px;
		border-bottom: 1px solid #404040;
	}

	.trading-market-icon {
		width: 40px;
		height: 40px;
		border-radius: 6px;
		object-fit: cover;
		background: rgba(255, 255, 255, 0.05);
		flex-shrink: 0;
	}

	.trading-market-name {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: #E8E8E8;
		line-height: 1.3;
	}

	.trade-tabs {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.trade-tab {
		padding: 10px 20px;
		background: transparent;
		border: none;
		color: #9BA3B4;
		font-family: Inter, sans-serif;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		transition: all 150ms ease-out;
	}

	.trade-tab.active {
		color: #E8E8E8;
		border-bottom-color: #F97316;
	}

	.outcome-selection {
		display: flex;
		gap: 12px;
	}

	.outcome-btn {
		flex: 1;
		padding: 16px;
		border-radius: 8px;
		font-family: Inter, sans-serif;
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
		transition: all 150ms ease-out;
		border: 2px solid;
	}

	.yes-outcome {
		background: rgba(0, 208, 132, 0.1);
		color: #00D084;
		border-color: rgba(0, 208, 132, 0.3);
	}

	.yes-outcome:hover:not(.active) {
		background: rgba(0, 208, 132, 0.2);
		border-color: #00D084;
		transform: none;
	}

	.yes-outcome.active {
		background: rgba(0, 208, 132, 0.3);
		color: #00D084;
		border-color: #00D084;
	}

	.no-outcome {
		background: rgba(255, 71, 87, 0.1);
		color: #FF4757;
		border-color: rgba(255, 71, 87, 0.3);
	}

	.no-outcome:hover:not(.active) {
		background: rgba(255, 71, 87, 0.2);
		border-color: #FF4757;
		transform: none;
	}

	.no-outcome.active {
		background: rgba(255, 71, 87, 0.3);
		color: #FF4757;
		border-color: #FF4757;
	}

	.amount-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.amount-label {
		font-size: 14px;
		font-weight: 600;
		color: #E8E8E8;
	}

	.balance-text {
		font-size: 12px;
		color: #9BA3B4;
		margin-top: -8px;
	}

	.amount-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.amount-currency {
		position: absolute;
		left: 16px;
		font-size: 32px;
		font-weight: 700;
		color: #9BA3B4;
		pointer-events: none;
	}

	.amount-suffix {
		font-size: 16px;
		font-weight: 600;
		color: #9BA3B4;
		white-space: nowrap;
	}

	.amount-input {
		width: 100%;
		background: #000000;
		border: 1px solid #404040;
		color: #E8E8E8;
		padding: 20px;
		padding-left: 48px;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 32px;
		font-weight: 700;
		border-radius: 8px;
		transition: border-color 200ms ease-out;
	}

	.amount-input.sell-mode {
		padding-left: 20px;
	}

	.amount-input:focus {
		outline: none;
		border-color: #F97316;
	}

	.amount-input::placeholder {
		color: #666;
	}

	.quick-amounts {
		display: flex;
		gap: 8px;
	}

	.quick-btn {
		flex: 1;
		padding: 10px;
		background: #000000;
		border: 1px solid #404040;
		color: #FFFFFF;
		font-family: Inter, sans-serif;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		border-radius: 6px;
		transition: all 150ms ease-out;
	}

	.quick-btn:hover {
		background: #000000;
		border-color: #F97316;
		color: #F97316;
		transform: none;
	}

	.action-button {
		width: 100%;
		padding: 16px;
		background: transparent;
		border: 1px solid #404040;
		color: #666;
		font-family: Inter, sans-serif;
		font-size: 16px;
		font-weight: 700;
		border-radius: 8px;
		cursor: not-allowed;
		margin-top: 8px;
		transition: all 200ms ease-out;
	}

	.action-button.enabled {
		background: transparent;
		border: 1px solid #F97316;
		color: #F97316;
		cursor: pointer;
	}

	.action-button.enabled:hover {
		background: transparent;
		border-color: #F97316;
		color: #F97316;
		transform: none;
	}

	.action-button:disabled {
		opacity: 0.6;
	}

	.terms-text {
		font-size: 11px;
		color: #9BA3B4;
		text-align: center;
		line-height: 1.4;
	}

	.terms-text a {
		color: #F97316;
		text-decoration: none;
	}

	.terms-text a:hover {
		text-decoration: underline;
	}

	.no-selection {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #666;
		font-size: 14px;
	}

	/* Responsive */
	@media (max-width: 1200px) {
		.event-container {
			grid-template-columns: 1fr;
		}

		.trading-panel {
			position: static;
		}
	}

	::-webkit-scrollbar {
		width: 8px;
	}

	::-webkit-scrollbar-track {
		background: #000000;
	}

	::-webkit-scrollbar-thumb {
		background: #404040;
		border-radius: 4px;
	}

	::-webkit-scrollbar-thumb:hover {
		background: #F97316;
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

	.sltp-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}

	.sltp-input-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.sltp-label {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.sltp-label-text {
		font-size: 12px;
		font-weight: 600;
		color: #A0A0A0;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.sltp-label-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 2px 6px;
		border-radius: 3px;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.5px;
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

	.sltp-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.sltp-input {
		width: 100%;
		background: #0A0E1A;
		border: 1px solid #2A2F45;
		border-radius: 4px;
		padding: 8px 28px 8px 10px;
		font-size: 15px;
		font-weight: 600;
		color: #E8E8E8;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		transition: all 200ms ease-out;
	}

	.sltp-input:focus {
		outline: none;
		border-color: #F97316;
		background: #0F1421;
	}

	.sltp-input::placeholder {
		color: #3A4055;
		font-weight: 400;
	}

	.sltp-currency {
		position: absolute;
		right: 10px;
		font-size: 12px;
		font-weight: 600;
		color: #666666;
		pointer-events: none;
	}

	.sltp-description {
		font-size: 10px;
		color: #666666;
		line-height: 1.3;
	}

	.sltp-active-summary {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		background: rgba(249, 115, 22, 0.05);
		border: 1px solid rgba(249, 115, 22, 0.2);
		border-radius: 4px;
		margin-top: 4px;
	}

	.sltp-active-title {
		font-size: 11px;
		font-weight: 600;
		color: #A0A0A0;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.sltp-active-items {
		display: flex;
		gap: 12px;
	}

	.sltp-active-item {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 4px;
	}

	.sltp-active-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 2px 5px;
		border-radius: 3px;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.5px;
	}

	.sltp-active-value {
		font-size: 14px;
		font-weight: 700;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
	}

	.sl-item .sltp-active-value {
		color: #FF4757;
	}

	.tp-item .sltp-active-value {
		color: #00D084;
	}

	/* Modal SL/TP Styles */
	.summary-divider {
		height: 1px;
		background: #2A2F45;
		margin: 8px 0;
	}

	.summary-section-title {
		font-size: 11px;
		font-weight: 600;
		color: #A0A0A0;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 8px;
	}

	.sltp-row {
		background: rgba(249, 115, 22, 0.05);
		border-left: 3px solid transparent;
	}

	.sl-row {
		border-left-color: #FF4757;
	}

	.tp-row {
		border-left-color: #00D084;
	}

	.sltp-row .summary-value {
		font-weight: 700;
	}

	.sl-row .summary-value {
		color: #FF4757;
	}

	.tp-row .summary-value {
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
