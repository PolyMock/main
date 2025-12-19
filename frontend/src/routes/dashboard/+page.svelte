<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { walletStore, refreshUserBalance } from '$lib/wallet/stores';
	import { polymarketService } from '$lib/solana/polymarket-service';
	import { polymarketClient } from '$lib/polymarket';
	import { PublicKey } from '@solana/web3.js';

	interface Position {
		id: string;
		marketId: string;
		marketName: string;
		predictionType: 'Yes' | 'No';
		amountUsdc: number;
		shares: number;
		pricePerShare: number;
		currentPrice: number;
		pnl: number;
		pnlPercentage: number;
		status: 'Active' | 'Closed';
		openedAt: Date;
	}

	let positions: Position[] = [];
	let loading = true;
	let totalPnl = 0;
	let totalValue = 0;
	let openPositionsCount = 0;
	let closedPositionsCount = 0;
	let openPositionsValue = 0;
	let closedPositionsValue = 0;
	let openPositionsPnl = 0;
	let closedPositionsPnl = 0;
	let positionFilter: 'all' | 'open' | 'closed' = 'all';
	let walletState = $walletStore;

	// Modal state
	let showConfirmModal = false;
	let showSuccessModal = false;
	let showErrorModal = false;
	let modalTitle = '';
	let modalMessage = '';
	let modalDetails: any = null;
	let pendingClose: (() => Promise<void>) | null = null;

	// Subscribe to wallet state
	walletStore.subscribe(value => {
		walletState = value;
		if (value.connected && value.publicKey) {
			loadPositions();
		}
	});

	onMount(async () => {
		if (walletState.connected && walletState.publicKey) {
			await loadPositions();
		} else {
			loading = false;
		}
	});

	async function loadPositions() {
		if (!walletState.publicKey) {
			loading = false;
			return;
		}

		loading = true;
		try {
			const userPublicKey = new PublicKey(walletState.publicKey.toString());
			const blockchainPositions = await polymarketService.getUserPositions(userPublicKey);

			// Convert blockchain positions to display format and fetch real-time prices
			const positionsPromises = blockchainPositions.map(async (pos) => {
				const isYes = 'yes' in pos.predictionType;
				const amountUsdc = pos.amountUsdc.toNumber() / 1_000_000;
				const shares = pos.shares.toNumber() / 1_000_000;
				const pricePerShare = pos.pricePerShare.toNumber() / 1_000_000;
				const predictionType: 'Yes' | 'No' = isYes ? 'Yes' : 'No';

				// Fetch current price from Polymarket API
				let currentPrice = pricePerShare; // Fallback to entry price
				try {
					const fetchedPrice = await polymarketClient.getPositionCurrentPrice(
						pos.marketId,
						predictionType
					);
					if (fetchedPrice !== null) {
						currentPrice = fetchedPrice;
					}
				} catch (error) {
					console.error(`Error fetching price for position ${pos.positionId}:`, error);
				}

				const currentValue = shares * currentPrice;
				const pnl = currentValue - amountUsdc;
				const pnlPercentage = (pnl / amountUsdc) * 100;
				const status: 'Active' | 'Closed' = 'active' in pos.status ? 'Active' : 'Closed';

				return {
					id: pos.positionId.toString(),
					marketId: pos.marketId,
					marketName: `Market ${pos.marketId.slice(0, 10)}...`,
					predictionType,
					amountUsdc,
					shares,
					pricePerShare,
					currentPrice,
					pnl,
					pnlPercentage,
					status,
					openedAt: new Date(pos.openedAt.toNumber() * 1000)
				};
			});

			positions = await Promise.all(positionsPromises);

			calculateTotals();
		} catch (error) {
			console.error('Error loading positions:', error);
			positions = [];
		} finally {
			loading = false;
		}
	}

	function calculateTotals() {
		const openPositions = positions.filter(p => p.status === 'Active');
		const closedPositions = positions.filter(p => p.status === 'Closed');

		openPositionsCount = openPositions.length;
		closedPositionsCount = closedPositions.length;

		openPositionsPnl = openPositions.reduce((sum, pos) => sum + pos.pnl, 0);
		closedPositionsPnl = closedPositions.reduce((sum, pos) => sum + pos.pnl, 0);

		openPositionsValue = openPositions.reduce((sum, pos) => sum + (pos.shares * pos.currentPrice), 0);
		closedPositionsValue = closedPositions.reduce((sum, pos) => sum + (pos.shares * pos.currentPrice), 0);

		totalPnl = positions.reduce((sum, pos) => sum + pos.pnl, 0);
		totalValue = positions.reduce((sum, pos) => sum + (pos.shares * pos.currentPrice), 0);
	}

	$: filteredPositions = positions.filter(pos => {
		if (positionFilter === 'open') return pos.status === 'Active';
		if (positionFilter === 'closed') return pos.status === 'Closed';
		return true;
	});

	$: displayTotalPositions = positionFilter === 'all' ? positions.length :
		positionFilter === 'open' ? openPositionsCount : closedPositionsCount;

	$: displayTotalValue = positionFilter === 'all' ? totalValue :
		positionFilter === 'open' ? openPositionsValue : closedPositionsValue;

	$: displayTotalPnl = positionFilter === 'all' ? totalPnl :
		positionFilter === 'open' ? openPositionsPnl : closedPositionsPnl;

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

	function goToMarket(marketId: string) {
		goto(`/market/${marketId}`);
	}

	async function closePosition(positionId: string, currentPrice: number, position: Position) {
		if (!walletState.connected || !walletState.adapter) {
			showErrorModal = true;
			modalTitle = 'Wallet Not Connected';
			modalMessage = 'Please connect your wallet first!';
			return;
		}

		// Show confirmation modal with position details
		modalTitle = 'Close Position';
		modalDetails = {
			market: position.marketName,
			type: position.predictionType,
			amount: formatUSDC(position.amountUsdc),
			shares: position.shares.toFixed(2),
			entryPrice: `$${position.pricePerShare.toFixed(2)}`,
			currentPrice: `$${currentPrice.toFixed(2)}`,
			pnl: formatUSDC(position.pnl),
			pnlPercentage: `${position.pnl >= 0 ? '+' : ''}${position.pnlPercentage.toFixed(2)}%`
		};
		showConfirmModal = true;

		// Store the close execution
		pendingClose = async () => {
			try {
				const tx = await polymarketService.closePosition(
					walletState.adapter,
					parseInt(positionId),
					currentPrice
				);

				// Show success modal
				modalTitle = 'Position Closed!';
				modalMessage = `Transaction: ${tx.slice(0, 20)}...`;
				showSuccessModal = true;

				// Refresh balance and positions
				if (walletState.publicKey) {
					await refreshUserBalance(new PublicKey(walletState.publicKey.toString()));
				}
				await loadPositions();
			} catch (error: any) {
				console.error('Error closing position:', error);
				showErrorModal = true;
				modalTitle = 'Failed to Close Position';
				modalMessage = error.message || 'Unknown error occurred';
			}
		};
	}

	async function confirmClose() {
		showConfirmModal = false;
		if (pendingClose) {
			await pendingClose();
			pendingClose = null;
		}
	}

	function cancelClose() {
		showConfirmModal = false;
		pendingClose = null;
	}

	function closeModal() {
		showConfirmModal = false;
		showSuccessModal = false;
		showErrorModal = false;
		modalDetails = null;
	}
</script>

<div class="dashboard-container">

	<!-- Position Filter Tabs -->
	<div class="filter-tabs">
		<button
			class="filter-tab"
			class:active={positionFilter === 'all'}
			on:click={() => positionFilter = 'all'}
		>
			All Positions
			<span class="tab-count">{positions.length}</span>
		</button>
		<button
			class="filter-tab"
			class:active={positionFilter === 'open'}
			on:click={() => positionFilter = 'open'}
		>
			Open
			<span class="tab-count">{openPositionsCount}</span>
		</button>
		<button
			class="filter-tab"
			class:active={positionFilter === 'closed'}
			on:click={() => positionFilter = 'closed'}
		>
			Closed
			<span class="tab-count">{closedPositionsCount}</span>
		</button>
	</div>

	<!-- Stats Overview -->
	<div class="stats-grid">
		<div class="stat-card">
			<div class="stat-label">
				{positionFilter === 'all' ? 'Total Positions' :
				 positionFilter === 'open' ? 'Open Positions' : 'Closed Positions'}
			</div>
			<div class="stat-value">{displayTotalPositions}</div>
			{#if positionFilter === 'all'}
				<div class="stat-breakdown">
					<span class="breakdown-item">Open: {openPositionsCount}</span>
					<span class="breakdown-separator">•</span>
					<span class="breakdown-item">Closed: {closedPositionsCount}</span>
				</div>
			{/if}
		</div>
		<div class="stat-card">
			<div class="stat-label">Total Value</div>
			<div class="stat-value">{formatUSDC(displayTotalValue)}</div>
			{#if positionFilter === 'all'}
				<div class="stat-breakdown">
					<span class="breakdown-item">Open: {formatUSDC(openPositionsValue)}</span>
					<span class="breakdown-separator">•</span>
					<span class="breakdown-item">Closed: {formatUSDC(closedPositionsValue)}</span>
				</div>
			{/if}
		</div>
		<div class="stat-card">
			<div class="stat-label">Total P&L</div>
			<div class="stat-value" class:positive={displayTotalPnl >= 0} class:negative={displayTotalPnl < 0}>
				{formatUSDC(displayTotalPnl)}
			</div>
			{#if positionFilter === 'all'}
				<div class="stat-breakdown">
					<span class="breakdown-item" class:positive={openPositionsPnl >= 0} class:negative={openPositionsPnl < 0}>
						Open: {formatUSDC(openPositionsPnl)}
					</span>
					<span class="breakdown-separator">•</span>
					<span class="breakdown-item" class:positive={closedPositionsPnl >= 0} class:negative={closedPositionsPnl < 0}>
						Closed: {formatUSDC(closedPositionsPnl)}
					</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Positions Table -->
	<div class="positions-section">
		<div class="section-header">
			<h2>
				{positionFilter === 'all' ? 'All Positions' :
				 positionFilter === 'open' ? 'Open Positions' : 'Closed Positions'}
			</h2>
			<button class="refresh-btn" on:click={loadPositions} disabled={loading}>
				{loading ? 'Loading...' : 'Refresh'}
			</button>
		</div>

		{#if loading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>Loading positions...</p>
			</div>
		{:else if filteredPositions.length === 0}
			<div class="empty-state">
				<div class="empty-icon"></div>
				<h3>No Active Positions</h3>
				<p>Start trading to see your positions here</p>
				<button class="cta-button" on:click={() => goto('/')}>
					Explore Markets
				</button>
			</div>
		{:else}
			<div class="table-container">
				<table class="positions-table">
					<thead>
						<tr>
							<th>Market</th>
							<th>Type</th>
							<th>Amount</th>
							<th>Shares</th>
							<th>Entry Price</th>
							<th>Current Price</th>
							<th>P&L</th>
							<th>Status</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredPositions as position (position.id)}
							<tr>
								<td class="market-cell">
									<button class="market-link" on:click={() => goToMarket(position.marketId)}>
										{position.marketName}
									</button>
								</td>
								<td>
									<span class="badge" class:yes={position.predictionType === 'Yes'} class:no={position.predictionType === 'No'}>
										{position.predictionType}
									</span>
								</td>
								<td>{formatUSDC(position.amountUsdc)}</td>
								<td>{position.shares.toFixed(2)}</td>
								<td>${position.pricePerShare.toFixed(2)}</td>
								<td>${position.currentPrice.toFixed(2)}</td>
								<td class:positive={position.pnl >= 0} class:negative={position.pnl < 0}>
									{formatUSDC(position.pnl)}
									<span class="pnl-percentage">({formatPercentage(position.pnlPercentage)})</span>
								</td>
								<td>
									<span class="status-badge" class:active={position.status === 'Active'} class:closed={position.status === 'Closed'}>
										{position.status}
									</span>
								</td>
								<td>
									{#if position.status === 'Active'}
										<button class="action-btn" on:click={() => closePosition(position.id, position.currentPrice, position)}>Close</button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>

<!-- Confirmation Modal -->
{#if showConfirmModal}
<div class="modal-overlay" on:click={cancelClose}>
	<div class="modal-content" on:click|stopPropagation>
		<div class="modal-header">
			<h3>{modalTitle}</h3>
			<button class="modal-close" on:click={cancelClose}>×</button>
		</div>
		<div class="modal-body">
			{#if modalDetails}
			<div class="trade-summary">
				<div class="summary-row">
					<span class="summary-label">Market:</span>
					<span class="summary-value">{modalDetails.market}</span>
				</div>
				<div class="summary-row">
					<span class="summary-label">Type:</span>
					<span class="summary-value">{modalDetails.type}</span>
				</div>
				<div class="summary-row">
					<span class="summary-label">Amount Invested:</span>
					<span class="summary-value">{modalDetails.amount}</span>
				</div>
				<div class="summary-row">
					<span class="summary-label">Shares:</span>
					<span class="summary-value">{modalDetails.shares}</span>
				</div>
				<div class="summary-row">
					<span class="summary-label">Entry Price:</span>
					<span class="summary-value">{modalDetails.entryPrice}</span>
				</div>
				<div class="summary-row">
					<span class="summary-label">Current Price:</span>
					<span class="summary-value">{modalDetails.currentPrice}</span>
				</div>
				<div class="summary-row highlight">
					<span class="summary-label">Profit/Loss:</span>
					<span class="summary-value">{modalDetails.pnl} ({modalDetails.pnlPercentage})</span>
				</div>
			</div>
			{/if}
		</div>
		<div class="modal-footer">
			<button class="modal-btn cancel-btn" on:click={cancelClose}>Cancel</button>
			<button class="modal-btn confirm-btn" on:click={confirmClose}>
				Confirm Close
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
	.dashboard-container {
		min-height: 100vh;
		background: #0A0E1A;
		color: white;
		padding: 20px;
	}

	:global(.light-mode) .dashboard-container {
		background: #FFFFFF;
		color: #1A1A1A;
	}

	:global(.light-mode) .filter-tabs {
		background: #F5F5F5;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .filter-tab {
		background: transparent;
		border-color: #E0E0E0;
		color: #666;
	}

	:global(.light-mode) .filter-tab:hover {
		background: rgba(0, 181, 112, 0.05);
	}

	:global(.light-mode) .filter-tab.active {
		background: rgba(0, 181, 112, 0.1);
		border-color: #00B570;
		color: #00B570;
	}

	:global(.light-mode) .tab-count {
		background: rgba(0, 181, 112, 0.15);
		color: #00B570;
	}

	:global(.light-mode) .stat-card {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .stat-label {
		color: #666;
	}

	:global(.light-mode) .stat-value {
		color: #1A1A1A;
	}

	:global(.light-mode) .stat-breakdown {
		color: #666;
	}

	:global(.light-mode) .breakdown-item {
		color: #666;
	}

	:global(.light-mode) .position-card {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .position-card:hover {
		border-color: #CCC;
		background: #FAFAFA;
	}

	:global(.light-mode) .position-header {
		border-bottom-color: #E0E0E0;
	}

	:global(.light-mode) .market-name {
		color: #1A1A1A;
	}

	:global(.light-mode) .prediction-badge {
		background: rgba(0, 181, 112, 0.1);
		color: #00B570;
	}

	:global(.light-mode) .prediction-badge.no {
		background: rgba(255, 107, 107, 0.1);
		color: #FF6B6B;
	}

	:global(.light-mode) .close-position-btn {
		background: #FFFFFF;
		color: #FF6B6B;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .close-position-btn:hover {
		background: #FF6B6B;
		color: #FFFFFF;
	}

	:global(.light-mode) .position-details {
		color: #666;
	}

	:global(.light-mode) .detail-label {
		color: #999;
	}

	:global(.light-mode) .detail-value {
		color: #1A1A1A;
	}

	:global(.light-mode) .pnl-display {
		color: #1A1A1A;
	}

	:global(.light-mode) .pnl-display.positive {
		color: #00B570;
	}

	:global(.light-mode) .pnl-display.negative {
		color: #FF6B6B;
	}

	:global(.light-mode) .modal-overlay {
		background: rgba(0, 0, 0, 0.85);
	}

	:global(.light-mode) .modal-content {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .modal-header h2 {
		color: #1A1A1A;
	}

	:global(.light-mode) .close-modal-btn {
		background: transparent;
		color: #999;
		border: none;
	}

	:global(.light-mode) .close-modal-btn:hover {
		color: #1A1A1A;
	}

	:global(.light-mode) .modal-body {
		color: #333;
	}

	:global(.light-mode) .confirm-btn {
		background: #00B570;
	}

	:global(.light-mode) .confirm-btn:hover {
		background: #009560;
	}

	:global(.light-mode) .cancel-btn {
		background: #F5F5F5;
		color: #1A1A1A;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .cancel-btn:hover {
		background: #E0E0E0;
	}

	:global(.light-mode) .empty-state {
		color: #999;
	}

	:global(.light-mode) .empty-state svg {
		stroke: #999;
	}

	:global(.light-mode) .loading-state {
		color: #666;
	}

	:global(.light-mode) .empty-icon {
		background: #F5F5F5;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .empty-state h3 {
		color: #1A1A1A;
	}

	:global(.light-mode) .empty-state p {
		color: #666;
	}

	:global(.light-mode) .cta-button {
		background: #00B570;
		color: #FFFFFF;
	}

	:global(.light-mode) .cta-button:hover {
		background: #009560;
	}

	:global(.light-mode) .table-container {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .positions-table {
		background: #FFFFFF;
	}

	:global(.light-mode) .positions-table thead {
		background: #F5F5F5;
		border-bottom-color: #E0E0E0;
	}

	:global(.light-mode) .positions-table th {
		color: #666;
		border-bottom-color: #E0E0E0;
	}

	:global(.light-mode) .positions-table td {
		color: #1A1A1A;
		border-bottom-color: #E0E0E0;
	}

	:global(.light-mode) .positions-table tbody tr:hover {
		background: #FAFAFA;
	}

	:global(.light-mode) .market-cell {
		color: #1A1A1A;
	}

	:global(.light-mode) .type-badge {
		background: rgba(0, 181, 112, 0.1);
		color: #00B570;
	}

	:global(.light-mode) .type-badge.no {
		background: rgba(255, 107, 107, 0.1);
		color: #FF6B6B;
	}

	:global(.light-mode) .status-badge {
		background: rgba(0, 181, 112, 0.1);
		color: #00B570;
	}

	:global(.light-mode) .status-badge.closed {
		background: rgba(139, 146, 171, 0.1);
		color: #666;
	}

	:global(.light-mode) .refresh-btn {
		background: #FFFFFF;
		color: #00B570;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .refresh-btn:hover {
		background: rgba(0, 181, 112, 0.1);
	}

	.filter-tabs {
		display: flex;
		gap: 12px;
		max-width: 1400px;
		margin: 0 auto 24px;
		padding: 4px;
		background: #151B2F;
		border: 1px solid #2A2F45;
		border-radius: 12px;
	}

	.filter-tab {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 12px 20px;
		background: transparent;
		border: none;
		border-radius: 8px;
		color: #8B92AB;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.filter-tab:hover {
		background: rgba(0, 180, 255, 0.05);
		color: #E8E8E8;
	}

	.filter-tab.active {
		background: rgba(0, 180, 255, 0.1);
		color: #00B4FF;
		border: 1px solid #00B4FF;
	}

	.tab-count {
		padding: 2px 8px;
		background: rgba(0, 180, 255, 0.15);
		border-radius: 12px;
		font-size: 12px;
		font-weight: 700;
	}

	.filter-tab.active .tab-count {
		background: #00B4FF;
		color: #0A0E1A;
	}

	.dashboard-header {
		margin-bottom: 32px;
	}

	.header-content {
		display: flex;
		justify-content: space-between;
		align-items: center;
		max-width: 1400px;
		margin: 0 auto;
	}

	h1 {
		font-size: 32px;
		font-weight: 700;
		margin: 0;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 20px;
		max-width: 1400px;
		margin: 0 auto 32px;
	}

	.stat-card {
		background: #151B2F;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		padding: 24px;
	}

	.stat-label {
		font-size: 14px;
		color: #8B92AB;
		margin-bottom: 8px;
	}

	.stat-value {
		font-size: 28px;
		font-weight: 700;
		color: white;
	}

	.stat-value.positive {
		color: #00D68F;
	}

	.stat-value.negative {
		color: #FF6B6B;
	}

	.stat-breakdown {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
		font-size: 13px;
		color: #8B92AB;
	}

	.breakdown-item {
		font-size: 12px;
	}

	.breakdown-item.positive {
		color: #00D68F;
	}

	.breakdown-item.negative {
		color: #FF6B6B;
	}

	.breakdown-separator {
		color: #2A2F45;
		font-weight: bold;
	}

	.positions-section {
		max-width: 1400px;
		margin: 0 auto;
		background: #151B2F;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		padding: 24px;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 24px;
	}

	h2 {
		font-size: 20px;
		font-weight: 600;
		margin: 0;
	}

	.refresh-btn {
		padding: 8px 16px;
		background: #2A2F45;
		color: white;
		border: 1px solid #3A3F55;
		border-radius: 8px;
		cursor: pointer;
		font-size: 14px;
		transition: all 0.2s;
	}

	.refresh-btn:hover:not(:disabled) {
		background: #3A3F55;
		border-color: #00B4FF;
	}

	.refresh-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.loading-state {
		text-align: center;
		padding: 60px 20px;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #2A2F45;
		border-top-color: #00B4FF;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 16px;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.empty-state {
		text-align: center;
		padding: 60px 20px;
	}

	.empty-icon {
		font-size: 64px;
		margin-bottom: 16px;
	}

	.empty-state h3 {
		font-size: 20px;
		font-weight: 600;
		margin: 0 0 8px 0;
	}

	.empty-state p {
		color: #8B92AB;
		margin-bottom: 24px;
	}

	.cta-button {
		padding: 12px 24px;
		background: #00B4FF;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.cta-button:hover {
		background: #0094D6;
		transform: translateY(-1px);
	}

	.table-container {
		overflow-x: auto;
	}

	.positions-table {
		width: 100%;
		border-collapse: collapse;
	}

	.positions-table th {
		text-align: left;
		padding: 12px;
		font-size: 12px;
		font-weight: 600;
		color: #8B92AB;
		border-bottom: 1px solid #2A2F45;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.positions-table td {
		padding: 16px 12px;
		border-bottom: 1px solid #2A2F45;
		font-size: 14px;
	}

	.positions-table tr:hover {
		background: rgba(0, 180, 255, 0.05);
	}

	.market-cell {
		max-width: 300px;
	}

	.market-link {
		background: none;
		border: none;
		color: #00B4FF;
		cursor: pointer;
		padding: 0;
		font-size: 14px;
		text-align: left;
		text-decoration: none;
		transition: color 0.2s;
	}

	.market-link:hover {
		color: #00D4FF;
		text-decoration: underline;
	}

	.badge {
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 12px;
		font-weight: 600;
	}

	.badge.yes {
		background: rgba(0, 214, 143, 0.1);
		color: #00D68F;
	}

	.badge.no {
		background: rgba(255, 107, 107, 0.1);
		color: #FF6B6B;
	}

	.positive {
		color: #00D68F;
	}

	.negative {
		color: #FF6B6B;
	}

	.pnl-percentage {
		font-size: 12px;
		opacity: 0.8;
		margin-left: 4px;
	}

	.status-badge {
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 12px;
		font-weight: 600;
	}

	.status-badge.active {
		background: rgba(0, 180, 255, 0.1);
		color: #00B4FF;
	}

	.status-badge.closed {
		background: rgba(139, 146, 171, 0.1);
		color: #8B92AB;
	}

	.action-btn {
		padding: 6px 12px;
		background: #2A2F45;
		color: white;
		border: 1px solid #3A3F55;
		border-radius: 6px;
		cursor: pointer;
		font-size: 12px;
		transition: all 0.2s;
	}

	.action-btn:hover {
		background: #FF6B6B;
		border-color: #FF6B6B;
	}

	@media (max-width: 768px) {
		.dashboard-container {
			padding: 16px;
		}

		h1 {
			font-size: 24px;
		}

		.stats-grid {
			grid-template-columns: 1fr;
		}

		.table-container {
			overflow-x: scroll;
		}

		.positions-table {
			min-width: 900px;
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
