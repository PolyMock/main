<script lang="ts">
	import { onMount } from 'svelte';
	import { walletStore, refreshUserBalance } from '$lib/wallet/stores';
	import { polymarketService } from '$lib/solana/polymarket-service';
	import { polymarketClient } from '$lib/polymarket';
	import { authStore } from '$lib/auth/auth-store';
	import { PublicKey } from '@solana/web3.js';

	let walletState = $walletStore;
	let loading = true;
	let positionsValue = 0;
	let biggestWin = 0;
	let biggestLoss = 0;
	let bestTradeMarket = '';
	let worstTradeMarket = '';
	let totalPredictions = 0;
	let profitLoss = 0;
	let timeFilter: '1D' | '1W' | '1M' | 'ALL' = 'ALL';
	let showUploadModal = false;
	let fileInput: HTMLInputElement;
	let previewUrl: string | null = null;
	let uploading = false;
	let lastLoadedWallet: string | null = null;

	// Subscribe to wallet state
	walletStore.subscribe(value => {
		walletState = value;
		const currentWallet = value.publicKey?.toString() || null;
		// Only reload if wallet changed, not on every wallet state update
		if (value.connected && value.publicKey && currentWallet !== lastLoadedWallet) {
			lastLoadedWallet = currentWallet;
			loadProfileData();
		}
	});

	onMount(async () => {
		if (walletState.connected && walletState.publicKey) {
			lastLoadedWallet = walletState.publicKey.toString();
			await loadProfileData();
		} else {
			loading = false;
		}
	});

	async function loadProfileData() {
		if (!walletState.publicKey) {
			loading = false;
			return;
		}

		loading = true;
		try {
			const userPublicKey = new PublicKey(walletState.publicKey.toString());
			const blockchainPositions = await polymarketService.getUserPositions(userPublicKey);

			// Calculate stats - same logic as dashboard
			totalPredictions = blockchainPositions.length;

			let maxWin = 0;
			let maxLoss = 0;
			let bestMarket = '';
			let worstMarket = '';
			let totalValue = 0;
			let totalPnL = 0;

			// Process positions with same logic as dashboard
			const positionsPromises = blockchainPositions.map(async (pos) => {
				const isYes = 'yes' in pos.predictionType;
				const amountUsdc = pos.amountUsdc.toNumber() / 1_000_000;
				const shares = pos.shares.toNumber() / 1_000_000;
				const pricePerShare = pos.pricePerShare.toNumber() / 1_000_000;
				const predictionType: 'Yes' | 'No' = isYes ? 'Yes' : 'No';
				const isClosed = !('active' in pos.status);

				// For closed positions, use averageSellPrice as the closed price
				let closedPrice: number | undefined = undefined;
				if (isClosed) {
					if (pos.averageSellPrice && pos.averageSellPrice.toNumber() > 0) {
						closedPrice = pos.averageSellPrice.toNumber() / 1_000_000;
					}
				}

				// Fetch market details
				let marketName = `Market ${pos.marketId.slice(0, 10)}...`;
				let currentPrice = pricePerShare;

				try {
					const market = await polymarketClient.getMarketById(pos.marketId);
					if (market) {
						marketName = market.question || market.title || marketName;
					}

					// Only fetch current price for active positions
					if (!isClosed) {
						const fetchedPrice = await polymarketClient.getPositionCurrentPrice(
							pos.marketId,
							predictionType
						);
						if (fetchedPrice !== null && fetchedPrice > 0) {
							currentPrice = fetchedPrice;
						}
					} else {
						// For closed positions, use the closedPrice
						currentPrice = closedPrice || pricePerShare;
					}
				} catch (error) {
					console.error(`Error fetching market data for position ${pos.positionId}:`, error);
				}

				// Calculate PnL based on the appropriate price
				const priceForPnL = isClosed ? (closedPrice || currentPrice) : currentPrice;
				const currentValue = shares * priceForPnL;
				const pnl = currentValue - amountUsdc;

				return { pnl, currentValue, marketName };
			});

			const processedPositions = await Promise.all(positionsPromises);

			// Calculate totals and find best/worst trades
			for (const pos of processedPositions) {
				totalValue += pos.currentValue;
				totalPnL += pos.pnl;

				if (pos.pnl > maxWin) {
					maxWin = pos.pnl;
					bestMarket = pos.marketName;
				}
				if (pos.pnl < maxLoss) {
					maxLoss = pos.pnl;
					worstMarket = pos.marketName;
				}
			}

			positionsValue = totalValue;
			biggestWin = maxWin;
			biggestLoss = maxLoss;
			bestTradeMarket = bestMarket;
			worstTradeMarket = worstMarket;
			profitLoss = totalPnL;
		} catch (error) {
			console.error('Error loading profile data:', error);
		} finally {
			loading = false;
		}
	}

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	}

	function formatLargeNumber(num: number): string {
		if (num >= 1_000_000) {
			return `$${(num / 1_000_000).toFixed(1)}m`;
		} else if (num >= 1_000) {
			return `$${(num / 1_000).toFixed(1)}k`;
		}
		return formatCurrency(num);
	}

	function setTimeFilter(filter: '1D' | '1W' | '1M' | 'ALL') {
		timeFilter = filter;
		// In production, this would filter the data by time range
	}

	function openUploadModal() {
		if (!$authStore.isAuthenticated) {
			alert('Please log in to change your profile picture');
			return;
		}
		showUploadModal = true;
	}

	function closeUploadModal() {
		showUploadModal = false;
		previewUrl = null;
		if (fileInput) {
			fileInput.value = '';
		}
	}

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		// Validate file type
		if (!file.type.startsWith('image/')) {
			alert('Please select an image file');
			input.value = '';
			return;
		}

		// Validate file size (max 5MB)
		if (file.size > 5 * 1024 * 1024) {
			alert('Image size must be less than 5MB');
			input.value = '';
			return;
		}

		// Create preview
		const reader = new FileReader();
		reader.onload = (e) => {
			previewUrl = e.target?.result as string;
		};
		reader.readAsDataURL(file);
	}

	async function uploadProfilePicture() {
		if (!fileInput?.files?.[0]) return;

		uploading = true;

		try {
			const file = fileInput.files[0];
			const reader = new FileReader();

			reader.onload = async (e) => {
				const dataUrl = e.target?.result as string;

				// In production, you would upload to a cloud storage service
				// For now, we'll store the data URL directly (not recommended for production)
				authStore.updateProfilePicture(dataUrl);

				uploading = false;
				closeUploadModal();
				alert('Profile picture updated successfully!');
			};

			reader.onerror = () => {
				uploading = false;
				alert('Failed to read image file');
			};

			reader.readAsDataURL(file);
		} catch (error) {
			console.error('Upload failed:', error);
			uploading = false;
			alert('Failed to upload profile picture');
		}
	}

	function triggerFileInput() {
		fileInput?.click();
	}
</script>

<div class="profile-container">
	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>Loading profile...</p>
		</div>
	{:else if !walletState.connected}
		<div class="empty-state">
			<h3>Connect Your Wallet</h3>
			<p>Connect your wallet to view your profile</p>
		</div>
	{:else}
		<div class="profile-content">
			<!-- User Info Card -->
			<div class="user-card">
				<div class="user-header">
					<div class="avatar-container">
						{#if $authStore.isAuthenticated && $authStore.user?.picture}
							<img src={$authStore.user.picture} alt="Profile" class="user-avatar" />
						{:else}
							<div class="user-avatar-placeholder">
								<svg width="40" height="40" viewBox="0 0 40 40" fill="none">
									<circle cx="20" cy="20" r="20" fill="#2A2F45"/>
									<path d="M20 20C22.7614 20 25 17.7614 25 15C25 12.2386 22.7614 10 20 10C17.2386 10 15 12.2386 15 15C15 17.7614 17.2386 20 20 20Z" fill="#8B92AB"/>
									<path d="M10 32C10 27.5817 13.5817 24 18 24H22C26.4183 24 30 27.5817 30 32V34H10V32Z" fill="#8B92AB"/>
								</svg>
							</div>
						{/if}
						{#if $authStore.isAuthenticated}
							<button class="edit-avatar-btn" on:click={openUploadModal}>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M12 20h9"/>
									<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
								</svg>
							</button>
						{/if}
					</div>
					<div class="user-info">
						<h1 class="username">
							{#if $authStore.isAuthenticated && $authStore.user?.name}
								{$authStore.user.name}
							{:else if walletState.publicKey}
								{walletState.publicKey.toString().slice(0, 4)}...{walletState.publicKey.toString().slice(-4)}
							{:else}
								Anonymous
							{/if}
						</h1>
						<div class="user-meta">
							<span>Joined Oct 2025</span>
							<span class="meta-separator">•</span>
							<span>{(Math.random() * 100).toFixed(1)}k views</span>
						</div>
					</div>
				</div>

				<!-- Stats Row -->
				<div class="stats-row">
					<div class="stat-item">
						<div class="stat-label">Positions Value</div>
						<div class="stat-value">{formatLargeNumber(positionsValue)}</div>
					</div>
					<div class="stat-divider"></div>
					<div class="stat-item">
						<div class="stat-label">Best Trade</div>
						<div class="stat-value stat-positive">{formatLargeNumber(biggestWin)}</div>
						{#if bestTradeMarket}
							<div class="stat-subtitle">{bestTradeMarket}</div>
						{/if}
					</div>
					<div class="stat-divider"></div>
					<div class="stat-item">
						<div class="stat-label">Worst Trade</div>
						<div class="stat-value stat-negative">{formatLargeNumber(biggestLoss)}</div>
						{#if worstTradeMarket}
							<div class="stat-subtitle">{worstTradeMarket}</div>
						{/if}
					</div>
					<div class="stat-divider"></div>
					<div class="stat-item">
						<div class="stat-label">Predictions</div>
						<div class="stat-value">{totalPredictions}</div>
					</div>
				</div>
			</div>

			<!-- Profit/Loss Card -->
			<div class="pnl-card">
				<div class="pnl-header">
					<div class="pnl-title">
						<span class="pnl-icon">▲</span>
						Profit/Loss
					</div>
					<div class="time-filters">
						<button
							class="time-filter"
							class:active={timeFilter === '1D'}
							on:click={() => setTimeFilter('1D')}
						>
							1D
						</button>
						<button
							class="time-filter"
							class:active={timeFilter === '1W'}
							on:click={() => setTimeFilter('1W')}
						>
							1W
						</button>
						<button
							class="time-filter"
							class:active={timeFilter === '1M'}
							on:click={() => setTimeFilter('1M')}
						>
							1M
						</button>
						<button
							class="time-filter"
							class:active={timeFilter === 'ALL'}
							on:click={() => setTimeFilter('ALL')}
						>
							ALL
						</button>
					</div>
				</div>

				<div class="pnl-amount" class:positive={profitLoss >= 0} class:negative={profitLoss < 0}>
					{formatCurrency(profitLoss)}
				</div>

				<div class="pnl-period">Past Month</div>

				<!-- Simple Chart Placeholder -->
				<div class="chart-container">
					<svg class="chart" viewBox="0 0 400 100" preserveAspectRatio="none">
						<defs>
							<linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
								<stop offset="0%" style="stop-color: {profitLoss >= 0 ? '#00D68F' : '#FF6B6B'}; stop-opacity: 0.3"/>
								<stop offset="100%" style="stop-color: {profitLoss >= 0 ? '#00D68F' : '#FF6B6B'}; stop-opacity: 0"/>
							</linearGradient>
						</defs>
						<!-- Sample wavy line -->
						<path
							d="M 0 50 Q 50 40, 100 45 T 200 40 T 300 35 T 400 30"
							fill="none"
							stroke="{profitLoss >= 0 ? '#00D68F' : '#FF6B6B'}"
							stroke-width="2"
						/>
						<path
							d="M 0 50 Q 50 40, 100 45 T 200 40 T 300 35 T 400 30 L 400 100 L 0 100 Z"
							fill="url(#chartGradient)"
						/>
					</svg>
				</div>

				<div class="polymarket-badge">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
						<rect width="16" height="16" rx="3" fill="#2A2F45"/>
						<path d="M4 8L7 11L12 5" stroke="#00B4FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
					Polymarket
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Upload Profile Picture Modal -->
{#if showUploadModal}
<div class="modal-overlay" on:click={closeUploadModal}>
	<div class="modal-content" on:click|stopPropagation>
		<div class="modal-header">
			<h3>Change Profile Picture</h3>
			<button class="modal-close" on:click={closeUploadModal}>×</button>
		</div>
		<div class="modal-body">
			<div class="upload-area">
				{#if previewUrl}
					<div class="preview-container">
						<img src={previewUrl} alt="Preview" class="preview-image" />
					</div>
				{:else}
					<div class="upload-placeholder">
						<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
							<circle cx="8.5" cy="8.5" r="1.5"/>
							<polyline points="21 15 16 10 5 21"/>
						</svg>
						<p>Click to select an image</p>
						<span>PNG, JPG up to 5MB</span>
					</div>
				{/if}
				<input
					type="file"
					bind:this={fileInput}
					on:change={handleFileSelect}
					accept="image/*"
					class="file-input"
				/>
				<button class="select-file-btn" on:click={triggerFileInput}>
					{previewUrl ? 'Choose Different Image' : 'Select Image'}
				</button>
			</div>
		</div>
		<div class="modal-footer">
			<button class="modal-btn cancel-btn" on:click={closeUploadModal}>Cancel</button>
			<button
				class="modal-btn confirm-btn"
				on:click={uploadProfilePicture}
				disabled={!previewUrl || uploading}
			>
				{uploading ? 'Uploading...' : 'Save'}
			</button>
		</div>
	</div>
</div>
{/if}

<style>
	.profile-container {
		min-height: 100vh;
		background: #0A0E1A;
		color: white;
		padding: 40px 20px;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 400px;
		gap: 16px;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #2A2F45;
		border-top-color: #00B4FF;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.empty-state {
		text-align: center;
		padding: 60px 20px;
	}

	.empty-state h3 {
		font-size: 20px;
		font-weight: 600;
		margin: 0 0 8px 0;
	}

	.empty-state p {
		color: #8B92AB;
	}

	.profile-content {
		max-width: 1200px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
	}

	.user-card {
		background: #151B2F;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.user-header {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.avatar-container {
		position: relative;
		width: 80px;
		height: 80px;
	}

	.user-avatar {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid #2A2F45;
	}

	.user-avatar-placeholder {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #1E2139;
		border: 2px solid #2A2F45;
	}

	.edit-avatar-btn {
		position: absolute;
		bottom: 0;
		right: 0;
		width: 32px;
		height: 32px;
		background: #00B4FF;
		border: 2px solid #151B2F;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s;
		padding: 0;
	}

	.edit-avatar-btn:hover {
		background: #0094D6;
		transform: scale(1.1);
	}

	.edit-avatar-btn svg {
		color: white;
	}

	.user-info {
		flex: 1;
		min-width: 0;
	}

	.username {
		font-size: 24px;
		font-weight: 700;
		margin: 0 0 8px 0;
		color: #E8E8E8;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.user-meta {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		color: #8B92AB;
	}

	.meta-separator {
		color: #2A2F45;
	}

	.stats-row {
		display: flex;
		align-items: center;
		gap: 20px;
		padding-top: 24px;
		border-top: 1px solid #2A2F45;
	}

	.stat-item {
		flex: 1;
		text-align: center;
	}

	.stat-label {
		font-size: 12px;
		color: #8B92AB;
		margin-bottom: 8px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.stat-value {
		font-size: 24px;
		font-weight: 700;
		color: #E8E8E8;
	}

	.stat-value.stat-positive {
		color: #00D68F;
	}

	.stat-value.stat-negative {
		color: #FF6B6B;
	}

	.stat-subtitle {
		font-size: 11px;
		color: #8B92AB;
		margin-top: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 200px;
	}

	.stat-divider {
		width: 1px;
		height: 40px;
		background: #2A2F45;
	}

	.pnl-card {
		background: #151B2F;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		position: relative;
	}

	.pnl-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.pnl-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 600;
		color: #8B92AB;
	}

	.pnl-icon {
		color: #00D68F;
		font-size: 12px;
	}

	.time-filters {
		display: flex;
		gap: 8px;
	}

	.time-filter {
		padding: 4px 12px;
		background: transparent;
		border: 1px solid #2A2F45;
		border-radius: 6px;
		color: #8B92AB;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.time-filter:hover {
		border-color: #00B4FF;
		color: #00B4FF;
	}

	.time-filter.active {
		background: rgba(0, 180, 255, 0.1);
		border-color: #00B4FF;
		color: #00B4FF;
	}

	.pnl-amount {
		font-size: 36px;
		font-weight: 700;
		color: #E8E8E8;
	}

	.pnl-amount.positive {
		color: #00D68F;
	}

	.pnl-amount.negative {
		color: #FF6B6B;
	}

	.pnl-period {
		font-size: 12px;
		color: #8B92AB;
		margin-top: -8px;
	}

	.chart-container {
		height: 120px;
		margin: 16px 0;
	}

	.chart {
		width: 100%;
		height: 100%;
	}

	.polymarket-badge {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: rgba(42, 47, 69, 0.5);
		border-radius: 8px;
		font-size: 13px;
		color: #8B92AB;
		width: fit-content;
	}

	@media (max-width: 968px) {
		.profile-content {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 640px) {
		.profile-container {
			padding: 20px 16px;
		}

		.user-header {
			flex-direction: column;
			text-align: center;
		}

		.stats-row {
			flex-direction: column;
			gap: 16px;
		}

		.stat-divider {
			width: 100%;
			height: 1px;
		}

		.pnl-amount {
			font-size: 28px;
		}
	}

	/* Light mode support */
	:global(.light-mode) .profile-container {
		background: #FFFFFF;
		color: #1A1A1A;
	}

	:global(.light-mode) .user-card,
	:global(.light-mode) .pnl-card {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .username {
		color: #1A1A1A;
	}

	:global(.light-mode) .user-meta,
	:global(.light-mode) .stat-label,
	:global(.light-mode) .pnl-title,
	:global(.light-mode) .pnl-period,
	:global(.light-mode) .polymarket-badge {
		color: #666;
	}

	:global(.light-mode) .stat-value,
	:global(.light-mode) .pnl-amount {
		color: #1A1A1A;
	}

	:global(.light-mode) .stat-value.stat-positive,
	:global(.light-mode) .pnl-amount.positive {
		color: #00B570;
	}

	:global(.light-mode) .stat-value.stat-negative,
	:global(.light-mode) .pnl-amount.negative {
		color: #FF6B6B;
	}

	:global(.light-mode) .stat-subtitle {
		color: #666;
	}

	:global(.light-mode) .stats-row,
	:global(.light-mode) .stat-divider,
	:global(.light-mode) .meta-separator {
		border-color: #E0E0E0;
		background: #E0E0E0;
	}

	:global(.light-mode) .time-filter {
		border-color: #E0E0E0;
		color: #666;
	}

	:global(.light-mode) .time-filter:hover,
	:global(.light-mode) .time-filter.active {
		border-color: #00B570;
		color: #00B570;
		background: rgba(0, 181, 112, 0.1);
	}

	:global(.light-mode) .user-avatar-placeholder {
		background: #F5F5F5;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .polymarket-badge {
		background: rgba(229, 229, 229, 0.5);
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

	.upload-area {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.preview-container {
		width: 100%;
		aspect-ratio: 1;
		border-radius: 12px;
		overflow: hidden;
		background: #0A0E1A;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.preview-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.upload-placeholder {
		width: 100%;
		aspect-ratio: 1;
		border: 2px dashed #2A2F45;
		border-radius: 12px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		color: #8B92AB;
		background: #0A0E1A;
	}

	.upload-placeholder svg {
		opacity: 0.5;
	}

	.upload-placeholder p {
		font-size: 16px;
		font-weight: 600;
		margin: 0;
	}

	.upload-placeholder span {
		font-size: 13px;
		opacity: 0.8;
	}

	.file-input {
		display: none;
	}

	.select-file-btn {
		padding: 10px 20px;
		background: #2A2F45;
		border: 1px solid #3A3F55;
		border-radius: 8px;
		color: #E8E8E8;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.select-file-btn:hover {
		background: #3A3F55;
		border-color: #00B4FF;
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

	/* Light mode modal */
	:global(.light-mode) .modal-overlay {
		background: rgba(0, 0, 0, 0.85);
	}

	:global(.light-mode) .modal-content {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .modal-header {
		border-bottom-color: #E0E0E0;
	}

	:global(.light-mode) .modal-header h3 {
		color: #1A1A1A;
	}

	:global(.light-mode) .modal-close {
		color: #999;
	}

	:global(.light-mode) .modal-close:hover {
		color: #1A1A1A;
	}

	:global(.light-mode) .upload-placeholder {
		background: #F5F5F5;
		border-color: #E0E0E0;
		color: #666;
	}

	:global(.light-mode) .preview-container {
		background: #F5F5F5;
	}

	:global(.light-mode) .select-file-btn {
		background: #F5F5F5;
		border-color: #E0E0E0;
		color: #1A1A1A;
	}

	:global(.light-mode) .select-file-btn:hover {
		background: #E0E0E0;
		border-color: #00B570;
	}

	:global(.light-mode) .cancel-btn {
		background: #F5F5F5;
		color: #1A1A1A;
	}

	:global(.light-mode) .cancel-btn:hover {
		background: #E0E0E0;
	}

	:global(.light-mode) .confirm-btn {
		background: #00B570;
	}

	:global(.light-mode) .confirm-btn:hover:not(:disabled) {
		background: #009560;
	}

	:global(.light-mode) .edit-avatar-btn {
		background: #00B570;
		border-color: #FFFFFF;
	}

	:global(.light-mode) .edit-avatar-btn:hover {
		background: #009560;
	}
</style>
