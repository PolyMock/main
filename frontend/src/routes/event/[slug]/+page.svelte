<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { polymarketClient, type PolyEvent, type PolyMarket } from '$lib/polymarket';
	import { walletStore, refreshUserBalance } from '$lib/wallet/stores';
	import { polymarketService } from '$lib/solana/polymarket-service';
	import { PublicKey } from '@solana/web3.js';
	import MarketRules from '$lib/components/MarketRules.svelte';
	import MarketComments from '$lib/components/MarketComments.svelte';
	import polymarketIcon from '$lib/assets/icon-black.png';

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
			showErrorModal = true;
			modalTitle = 'Wallet Not Connected';
			modalMessage = 'Please connect your wallet first!';
			return;
		}

		// Validate trade parameters
		if (!amount || amount <= 0) {
			showErrorModal = true;
			modalTitle = 'Invalid Amount';
			modalMessage = 'Please enter a valid trade amount';
			return;
		}

		// Check if user has sufficient balance
		if (amount > walletState.usdcBalance) {
			showErrorModal = true;
			modalTitle = 'Insufficient Balance';
			modalMessage = `You have $${walletState.usdcBalance.toFixed(2)} available.`;
			return;
		}

		if (!selectedMarket || !selectedSide) {
			showErrorModal = true;
			modalTitle = 'No Selection';
			modalMessage = 'Please select a market and outcome';
			return;
		}

		// Prevent trading on resolved markets
		if (isMarketResolved(selectedMarket)) {
			showErrorModal = true;
			modalTitle = 'Market Resolved';
			modalMessage = 'Cannot trade on resolved markets';
			return;
		}

		const price = selectedSide === 'Yes' ? (selectedMarket.yesPrice || 0) : (selectedMarket.noPrice || 0);

		if (price <= 0) {
			showErrorModal = true;
			modalTitle = 'Invalid Price';
			modalMessage = 'Please refresh the page.';
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
				potentialWin: `$${potentialWin.toFixed(2)}`
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
							price
						);
					} else {
						txSignature = await polymarketService.buyNo(
							walletState.adapter,
							selectedMarket.id,
							amount,
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
					amount = 0;
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

			// Amount is already in shares for sell mode
			const sharesToSell = amount;
			const remainingShares = selectedPosition.remainingShares;

			if (sharesToSell <= 0 || sharesToSell > remainingShares) {
				showErrorModal = true;
				modalTitle = 'Invalid Amount';
				modalMessage = `You can only sell up to ${remainingShares.toFixed(2)} shares.`;
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
					amount = 0;
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

	onMount(() => {
		fetchEvent();
	});
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
					</div>
					<div class="event-header-right">
						<img src={polymarketIcon} alt="Polymock" class="polymarket-icon" />
						<span class="polymarket-text">Polymock</span>
					</div>
				</div>

				<!-- Markets List (Scrollable) -->
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

				<!-- Rules Section -->
				{#if event}
					<MarketRules event={event} market={selectedMarket} />
				{/if}

				<!-- Comments Section -->
				{#if event}
					<MarketComments marketId={event.id} />
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
						<div class="market-dropdown">
							<button class="dropdown-btn">Market ▼</button>
						</div>
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
								type="number"
								bind:value={amount}
								placeholder="0"
								class="amount-input"
								class:sell-mode={tradeTab === 'Sell'}
								min="0"
								step={tradeTab === 'Buy' ? '0.01' : '0.01'}
								max={tradeTab === 'Buy' ? walletState.usdcBalance : (selectedPosition ? selectedPosition.remainingShares : 0)}
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
					<span class="summary-label">Market:</span>
					<span class="summary-value-text">{modalDetails.market}</span>
				</div>
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
	:global(body) {
		margin: 0;
		padding: 0;
		background: #0A0E27;
		color: #E8E8E8;
		font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	}

	.event-page {
		min-height: 100vh;
		background: #0A0E27;
		padding: 12px;
		overflow-x: hidden;
		max-width: 100vw;
		box-sizing: border-box;
	}

	.page-header {
		margin-bottom: 24px;
	}

	.back-button {
		background: #151B2F;
		border: 1px solid #2A2F45;
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
		border-color: #00D084;
		color: #00D084;
	}

	.back-button-primary {
		background: #00D084;
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
		background: #00B570;
		transform: scale(1.02);
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
		height: calc(100vh - 180px);
		align-items: start;
	}

	/* LEFT PANEL: Markets List */
	.markets-panel {
		background: #151B2F;
		border: 1px solid #2A2F45;
		border-radius: 16px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.event-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 24px;
		border-bottom: 1px solid #2A2F45;
		background: rgba(42, 47, 69, 0.3);
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
	}

	.polymarket-icon {
		width: 24px;
		height: 24px;
		opacity: 0.7;
		filter: brightness(0) invert(1);
	}

	.polymarket-text {
		font-size: 16px;
		color: #9BA3B4;
		font-weight: 600;
		font-family: 'Open Sauce', 'Inter', sans-serif;
		letter-spacing: 0.3px;
	}

	.markets-list {
		padding: 16px 24px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.market-row {
		display: flex;
		align-items: center;
		padding: 12px 16px;
		border-bottom: 1px solid #2A2F45;
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
		border-left-color: #00D084;
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
		transform: translateY(-1px);
	}

	.no-btn {
		background: rgba(255, 71, 87, 0.15);
		color: #FF4757;
		border: 1px solid rgba(255, 71, 87, 0.3);
	}

	.no-btn:hover {
		background: rgba(255, 71, 87, 0.25);
		border-color: #FF4757;
		transform: translateY(-1px);
	}

	.resolved-toggle-container {
		padding: 16px 24px;
		border-top: 1px solid #2A2F45;
		background: rgba(42, 47, 69, 0.2);
		display: flex;
		justify-content: center;
	}

	.resolved-toggle-btn {
		padding: 10px 24px;
		background: #1E2139;
		border: 1px solid #2A2F45;
		color: #9BA3B4;
		font-family: Inter, sans-serif;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		border-radius: 6px;
		transition: all 150ms ease-out;
	}

	.resolved-toggle-btn:hover {
		background: #2A2F45;
		border-color: #00D084;
		color: #00D084;
	}

	/* RIGHT PANEL: Trading Interface */
	.trading-panel {
		background: #151B2F;
		border: 1px solid #2A2F45;
		border-radius: 16px;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-height: calc(100vh - 140px);
		position: sticky;
		top: 24px;
	}

	.trading-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding-bottom: 20px;
		border-bottom: 1px solid #2A2F45;
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
		border-bottom-color: #00D084;
	}

	.market-dropdown {
		margin-left: auto;
	}

	.dropdown-btn {
		padding: 8px 16px;
		background: #1E2139;
		border: 1px solid #2A2F45;
		color: #E8E8E8;
		font-family: Inter, sans-serif;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		border-radius: 6px;
		transition: all 150ms ease-out;
	}

	.dropdown-btn:hover {
		background: #2A2F45;
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

	.yes-outcome.active {
		background: #00D084;
		color: #000;
		border-color: #00D084;
	}

	.no-outcome {
		background: rgba(255, 255, 255, 0.05);
		color: #E8E8E8;
		border-color: #2A2F45;
	}

	.no-outcome.active {
		background: #2A2F45;
		border-color: #3A4055;
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
		background: #0A0E27;
		border: 1px solid #2A2F45;
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
		border-color: #00D084;
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
		background: #1E2139;
		border: 1px solid #2A2F45;
		color: #E8E8E8;
		font-family: Inter, sans-serif;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		border-radius: 6px;
		transition: all 150ms ease-out;
	}

	.quick-btn:hover {
		background: #2A2F45;
		border-color: #00D084;
	}

	.action-button {
		width: 100%;
		padding: 16px;
		background: #2A2F45;
		border: none;
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
		background: #00B4FF;
		color: #ffffff;
		cursor: pointer;
	}

	.action-button.enabled:hover {
		background: #0094D6;
		transform: scale(1.02);
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
		color: #00D084;
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
		background: #0A0E27;
	}

	::-webkit-scrollbar-thumb {
		background: #2A2F45;
		border-radius: 4px;
	}

	::-webkit-scrollbar-thumb:hover {
		background: #00D084;
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

	.summary-value-text {
		color: white;
		font-weight: 600;
		font-size: 14px;
		max-width: 250px;
		text-align: right;
		line-height: 1.4;
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
