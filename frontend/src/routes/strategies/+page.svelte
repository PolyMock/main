<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { walletStore } from '$lib/wallet/stores';
	import { authStore } from '$lib/auth/auth-store';
	import MiniEquityCurveChart from '$lib/components/MiniEquityCurveChart.svelte';

	interface User {
		id: number;
		name: string;
		email: string;
		picture: string;
	}

	interface Strategy {
		id: number;
		strategyName: string;
		marketQuestion: string;
		initialCapital: number;
		finalCapital: number;
		totalReturnPercent: number;
		totalTrades: number;
		winRate: number;
		profitFactor: number;
		maxDrawdown: number;
		equityCurve: Array<{ timestamp: string; capital: number }>;
		createdAt: string;
	}

	let user: User | null = null;
	let strategies: Strategy[] = [];
	let loading = true;
	let error = '';
	let walletState = $walletStore;
	let authState = $authStore;
	let walletButtonRef: any;

	// Delete modal state
	let showDeleteModal = false;
	let strategyToDelete: Strategy | null = null;
	let isDeleting = false;
	let deleteError = '';

	// Track previous connection state to detect changes
	let previousConnected = walletState.connected;
	let previousAddress = walletState.publicKey?.toString();

	// Subscribe to wallet and auth state changes
	walletStore.subscribe(value => {
		const currentAddress = value.publicKey?.toString();
		const connectionChanged = value.connected !== previousConnected;
		const addressChanged = currentAddress !== previousAddress;

		walletState = value;

		// Reload strategies when wallet connects or changes
		if (value.connected && (connectionChanged || addressChanged)) {
			loadStrategies();
		}

		// Clear strategies when wallet disconnects (but not if Google user is still logged in)
		if (!value.connected && previousConnected && !user?.googleId) {
			user = null;
			strategies = [];
		}

		previousConnected = value.connected;
		previousAddress = currentAddress;
	});

	authStore.subscribe(value => {
		authState = value;
		// Reload strategies when user logs in
		if (value.isAuthenticated && value.user) {
			loadStrategies();
		}
	});

	function handleWalletConnect() {
		// Simply navigate to home page where wallet connection is in navbar
		window.location.href = '/';
	}

	onMount(async () => {
		await loadStrategies();
	});

	async function loadStrategies() {
		loading = true;
		error = '';

		try {
			// Check if user is logged in with Google or Wallet
			const userRes = await fetch('/api/auth/user', {
				credentials: 'include' // Ensure cookies are sent
			});
			const userData = await userRes.json();
			user = userData.user;

			// Only fetch strategies if we have a valid session
			if (user) {
				// Fetch user's strategies
				const strategiesRes = await fetch('/api/strategies', {
					credentials: 'include'
				});

				if (strategiesRes.ok) {
					const strategiesData = await strategiesRes.json();
					strategies = strategiesData.strategies || [];
				} else if (strategiesRes.status === 401) {
					// Session expired or invalid
					user = null;
					strategies = [];
				} else {
					throw new Error('Failed to fetch strategies');
				}
			} else {
				strategies = [];
			}
		} catch (err: any) {
			console.error('Error loading strategies:', err);
			error = err.message || 'Failed to load strategies';
			strategies = [];
		} finally {
			loading = false;
		}
	}

	async function handleLogin() {
		window.location.href = '/api/auth/login';
	}

	async function handleLogout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		user = null;
		strategies = [];
	}

	function viewStrategy(strategyId: number) {
		goto(`/strategies/${strategyId}`);
	}

	function openDeleteModal(strategy: Strategy) {
		strategyToDelete = strategy;
		showDeleteModal = true;
		deleteError = '';
	}

	function closeDeleteModal() {
		showDeleteModal = false;
		strategyToDelete = null;
		deleteError = '';
		isDeleting = false;
	}

	async function confirmDelete() {
		if (!strategyToDelete) return;

		isDeleting = true;
		deleteError = '';

		try {
			const response = await fetch(`/api/strategies/${strategyToDelete.id}`, { method: 'DELETE' });

			if (!response.ok) {
				throw new Error('Failed to delete strategy');
			}

			strategies = strategies.filter(s => s.id !== strategyToDelete.id);
			closeDeleteModal();
		} catch (err: any) {
			deleteError = err.message || 'Failed to delete strategy';
		} finally {
			isDeleting = false;
		}
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatCurrency(value: number) {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(value);
	}
</script>

<div class="strategies-page">
	<div class="container">
		<div class="header">
			<h1>My Backtest Strategies</h1>
		</div>

		{#if loading}
			<div class="loading">Loading...</div>
		{:else if !user}
			<div class="login-prompt">
				<h2>Connect to Save and View Your Strategies</h2>
				<p>Connect with your Google account or Solana wallet to save your backtest results and access them anytime.</p>
				<div class="connect-options">
					<button on:click={handleLogin} class="btn-connect">
						<svg width="20" height="20" viewBox="0 0 18 18">
							<path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"></path>
							<path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"></path>
							<path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"></path>
							<path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"></path>
						</svg>
						<div class="connect-text">
							<div class="connect-title">Google Account</div>
							<div class="connect-subtitle">Sign in with Google</div>
						</div>
					</button>
					<button on:click={handleWalletConnect} class="btn-connect">
						<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
							<rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/>
							<path d="M14 10h1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							<path d="M2 8h16" stroke="currentColor" stroke-width="1.5"/>
						</svg>
						<div class="connect-text">
							<div class="connect-title">Wallet</div>
							<div class="connect-subtitle">Connect with Solana wallet</div>
						</div>
					</button>
				</div>
			</div>
		{:else if strategies.length === 0}
			<div class="empty-state">
				<h2>No Strategies Yet</h2>
				<p>Complete a backtest to save your first strategy.</p>
				<a href="/backtesting" class="btn-primary">Start Backtesting</a>
			</div>
		{:else}
			<div class="strategies-grid">
				{#each strategies as strategy}
					<div class="strategy-card" on:click={() => viewStrategy(strategy.id)}>
						<div class="card-header">
							<div class="header-left">
								<h3>{strategy.strategyName}</h3>
								<span class="date">{formatDate(strategy.createdAt)}</span>
							</div>
							<div class="card-actions" on:click|stopPropagation>
								<button
									on:click={() => viewStrategy(strategy.id)}
									class="btn-view"
									title="View Details"
								>
									<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
										<path d="M8 2.5c-3.5 0-6.5 2.5-8 5.5 1.5 3 4.5 5.5 8 5.5s6.5-2.5 8-5.5c-1.5-3-4.5-5.5-8-5.5zM8 11c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3zm0-5c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
									</svg>
								</button>
								<button
									on:click={() => openDeleteModal(strategy)}
									class="btn-delete"
									title="Delete"
								>
									<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
										<path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
										<path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
									</svg>
								</button>
							</div>
						</div>

						<p class="market-question">{strategy.marketQuestion}</p>

						<!-- Return Badge -->
						<div class="return-badge" class:positive={strategy.totalReturnPercent > 0} class:negative={strategy.totalReturnPercent < 0}>
							<span class="return-label">RETURN</span>
							<span class="return-value">
								{strategy.totalReturnPercent > 0 ? '+' : ''}{strategy.totalReturnPercent.toFixed(2)}%
							</span>
						</div>

						<!-- Equity Curve -->
						{#if strategy.equityCurve && strategy.equityCurve.length > 0}
							<div class="equity-curve-container">
								<MiniEquityCurveChart
									equityCurve={strategy.equityCurve}
									initialCapital={strategy.initialCapital}
									isPositive={strategy.totalReturnPercent > 0}
								/>
							</div>
						{/if}

						<div class="metrics">
							<div class="metric">
								<span class="metric-label">WIN RATE</span>
								<span class="metric-value" class:positive={strategy.winRate > 50} class:negative={strategy.winRate < 50}>
									{strategy.winRate.toFixed(1)}%
								</span>
							</div>

							<div class="metric">
								<span class="metric-label">TRADES</span>
								<span class="metric-value">{strategy.totalTrades}</span>
							</div>

							<div class="metric">
								<span class="metric-label">PROFIT FACTOR</span>
								<span class="metric-value" class:positive={strategy.profitFactor && strategy.profitFactor > 1} class:negative={strategy.profitFactor && strategy.profitFactor < 1}>
									{strategy.profitFactor ? strategy.profitFactor.toFixed(2) : 'N/A'}
								</span>
							</div>

							<div class="metric">
								<span class="metric-label">MAX DRAWDOWN</span>
								<span class="metric-value negative">
									{strategy.maxDrawdown ? strategy.maxDrawdown.toFixed(2) + '%' : 'N/A'}
								</span>
							</div>

							<div class="metric">
								<span class="metric-label">AVG WIN</span>
								<span class="metric-value positive">
									{formatCurrency(strategy.avgWin)}
								</span>
							</div>

							<div class="metric">
								<span class="metric-label">AVG LOSS</span>
								<span class="metric-value negative">
									{formatCurrency(strategy.avgLoss)}
								</span>
							</div>
						</div>

						<div class="card-footer">
							<span class="capital-flow">
								{formatCurrency(strategy.initialCapital)} → {formatCurrency(strategy.finalCapital)}
							</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteModal && strategyToDelete}
	<div class="modal-overlay" on:click={closeDeleteModal}>
		<div class="modal-content" on:click|stopPropagation>
			<div class="modal-header">
				<h2>Delete Strategy</h2>
				<button class="modal-close" on:click={closeDeleteModal}>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"/>
						<line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>

			<div class="modal-body">
				<div class="warning-icon">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10"/>
						<line x1="12" y1="8" x2="12" y2="12"/>
						<line x1="12" y1="16" x2="12.01" y2="16"/>
					</svg>
				</div>

				<p class="modal-description">
					Are you sure you want to delete <strong>"{strategyToDelete.strategyName}"</strong>?
				</p>

				<div class="strategy-info">
					<div class="info-row">
						<span class="info-label">Market:</span>
						<span class="info-value">{strategyToDelete.marketQuestion}</span>
					</div>
					<div class="info-row">
						<span class="info-label">Return:</span>
						<span class="info-value" class:positive={strategyToDelete.totalReturnPercent > 0} class:negative={strategyToDelete.totalReturnPercent < 0}>
							{strategyToDelete.totalReturnPercent > 0 ? '+' : ''}{strategyToDelete.totalReturnPercent.toFixed(2)}%
						</span>
					</div>
					<div class="info-row">
						<span class="info-label">Trades:</span>
						<span class="info-value">{strategyToDelete.totalTrades}</span>
					</div>
				</div>

				<p class="warning-text">
					This action cannot be undone. All backtest data and results will be permanently deleted.
				</p>

				{#if deleteError}
					<div class="error-message">{deleteError}</div>
				{/if}
			</div>

			<div class="modal-actions">
				<button class="btn-cancel" on:click={closeDeleteModal} disabled={isDeleting}>
					Cancel
				</button>
				<button class="btn-delete-confirm" on:click={confirmDelete} disabled={isDeleting}>
					{isDeleting ? 'Deleting...' : 'Delete Strategy'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.strategies-page {
		min-height: 100vh;
		background: #000000;
		padding: 40px 20px;
	}

	.container {
		max-width: 1400px;
		margin: 0 auto;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 40px;
	}

	h1 {
		color: white;
		font-size: 32px;
		font-weight: 700;
		margin: 0;
	}

	.user-section {
		display: flex;
		align-items: center;
		gap: 12px;
		color: #8b92ab;
	}

	.avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: 2px solid #F97316;
	}

	.avatar-placeholder {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: 2px solid #F97316;
		background: #F97316;
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 18px;
	}

	.btn-logout {
		padding: 8px 16px;
		background: transparent;
		border: 1px solid #2a2f45;
		color: #8b92ab;
		border-radius: 6px;
		cursor: pointer;
		font-size: 14px;
		transition: all 0.2s;
	}

	.btn-logout:hover {
		border-color: #ef4444;
		color: #ef4444;
	}

	.loading,
	.login-prompt,
	.empty-state {
		text-align: center;
		padding: 80px 20px;
		color: #8b92ab;
	}

	.login-prompt h2,
	.empty-state h2 {
		color: white;
		font-size: 24px;
		margin-bottom: 12px;
	}

	.login-prompt p,
	.empty-state p {
		font-size: 16px;
		margin-bottom: 32px;
	}

	.connect-options {
		display: flex;
		gap: 16px;
		justify-content: center;
		flex-wrap: wrap;
	}

	.btn-connect {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 24px;
		background: #1E2139;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s;
		text-decoration: none;
		color: inherit;
		min-width: 240px;
	}

	.btn-connect:hover {
		border-color: #F97316;
		background: #252A45;
	}

	.btn-connect svg {
		flex-shrink: 0;
	}

	.connect-text {
		text-align: left;
		flex: 1;
	}

	.connect-title {
		font-size: 15px;
		font-weight: 600;
		color: #E8E8E8;
		margin-bottom: 2px;
	}

	.connect-subtitle {
		font-size: 13px;
		color: #8B92AB;
	}

	.btn-primary {
		display: inline-block;
		padding: 14px 32px;
		background: #F97316;
		color: white;
		border-radius: 8px;
		text-decoration: none;
		font-weight: 600;
		transition: all 0.2s;
	}

	.btn-primary:hover {
		background: #ea580c;
		transform: translateY(-2px);
	}

	.strategies-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
		gap: 24px;
	}

	.strategy-card {
		background: #1A1F32;
		border: 1px solid #2A2F45;
		border-radius: 16px;
		padding: 24px;
		transition: background 0.2s;
		cursor: pointer;
		position: relative;
	}

	.strategy-card:hover {
		background: rgba(249, 115, 22, 0.05);
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 16px;
	}

	.header-left {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.card-header h3 {
		color: white;
		font-size: 20px;
		font-weight: 700;
		margin: 0;
		letter-spacing: -0.02em;
	}

	.card-actions {
		display: flex;
		gap: 8px;
	}

	.btn-view,
	.btn-delete {
		background: transparent;
		border: 1px solid #2a2f45;
		color: #8b92ab;
		padding: 6px;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.btn-view:hover {
		border-color: #F97316;
		color: #F97316;
	}

	.btn-delete:hover {
		border-color: #ef4444;
		color: #ef4444;
	}

	.market-question {
		color: #8b92ab;
		font-size: 14px;
		margin: 0 0 16px 0;
		line-height: 1.6;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.return-badge {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		border-radius: 8px;
		margin-bottom: 16px;
		border: 1px solid;
	}

	.return-badge.positive {
		background: rgba(16, 185, 129, 0.1);
		border-color: rgba(16, 185, 129, 0.3);
	}

	.return-badge.negative {
		background: rgba(239, 68, 68, 0.1);
		border-color: rgba(239, 68, 68, 0.3);
	}

	.return-label {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.5px;
		color: #8b92ab;
		text-transform: uppercase;
	}

	.return-value {
		font-size: 18px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}

	.return-badge.positive .return-value {
		color: #10b981;
	}

	.return-badge.negative .return-value {
		color: #ef4444;
	}

	.equity-curve-container {
		margin-bottom: 20px;
		background: linear-gradient(135deg, rgba(10, 14, 26, 0.8) 0%, rgba(20, 24, 36, 0.6) 100%);
		border-radius: 10px;
		padding: 16px;
		border: 1px solid rgba(42, 47, 69, 0.6);
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
		margin-bottom: 20px;
	}

	.metric {
		display: flex;
		flex-direction: column;
		gap: 6px;
		text-align: center;
		padding: 12px;
		background: rgba(20, 24, 36, 0.4);
		border-radius: 8px;
		border: 1px solid rgba(42, 47, 69, 0.4);
	}

	.metric-label {
		font-size: 10px;
		color: #8B92AB;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: 700;
	}

	.metric-value {
		font-size: 18px;
		color: #E8E8E8;
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	.metric-value.positive {
		color: #10b981;
	}

	.metric-value.negative {
		color: #ef4444;
	}

	.card-footer {
		padding-top: 16px;
		border-top: 1px solid #1e2537;
		font-size: 13px;
	}

	.date {
		color: #6b7280;
		font-size: 12px;
	}

	.capital-flow {
		color: #8b92ab;
		font-weight: 600;
		font-size: 14px;
	}

	/* Delete Modal Styles */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.75);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
		backdrop-filter: blur(4px);
	}

	.modal-content {
		background: #151B2E;
		border: 1px solid #2A2F45;
		border-radius: 16px;
		max-width: 500px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 24px 24px 20px 24px;
		border-bottom: 1px solid #2A2F45;
	}

	.modal-header h2 {
		color: white;
		font-size: 20px;
		font-weight: 700;
		margin: 0;
	}

	.modal-close {
		background: transparent;
		border: none;
		color: #8B92AB;
		cursor: pointer;
		padding: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
		border-radius: 6px;
	}

	.modal-close:hover {
		color: #E8E8E8;
		background: rgba(255, 255, 255, 0.05);
	}

	.modal-body {
		padding: 24px;
	}

	.warning-icon {
		display: flex;
		justify-content: center;
		margin-bottom: 20px;
	}

	.warning-icon svg {
		color: #ef4444;
	}

	.modal-description {
		color: #E8E8E8;
		font-size: 16px;
		text-align: center;
		margin: 0 0 24px 0;
		line-height: 1.5;
	}

	.modal-description strong {
		color: white;
		font-weight: 600;
	}

	.strategy-info {
		background: rgba(20, 24, 36, 0.6);
		border: 1px solid #2A2F45;
		border-radius: 12px;
		padding: 16px;
		margin-bottom: 20px;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 0;
	}

	.info-row:not(:last-child) {
		border-bottom: 1px solid rgba(42, 47, 69, 0.5);
	}

	.info-label {
		color: #8B92AB;
		font-size: 13px;
		font-weight: 500;
	}

	.info-value {
		color: #E8E8E8;
		font-size: 14px;
		font-weight: 600;
	}

	.info-value.positive {
		color: #10b981;
	}

	.info-value.negative {
		color: #ef4444;
	}

	.warning-text {
		color: #8B92AB;
		font-size: 13px;
		text-align: center;
		margin: 0;
		line-height: 1.5;
	}

	.error-message {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #ef4444;
		padding: 12px;
		border-radius: 8px;
		font-size: 14px;
		margin-top: 16px;
		text-align: center;
	}

	.modal-actions {
		display: flex;
		gap: 12px;
		padding: 20px 24px 24px 24px;
		border-top: 1px solid #2A2F45;
	}

	.btn-cancel,
	.btn-delete-confirm {
		flex: 1;
		padding: 12px 24px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
	}

	.btn-cancel {
		background: transparent;
		border: 1px solid #2A2F45;
		color: #E8E8E8;
	}

	.btn-cancel:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.05);
		border-color: #3b4b6b;
	}

	.btn-delete-confirm {
		background: #ef4444;
		color: white;
	}

	.btn-delete-confirm:hover:not(:disabled) {
		background: #dc2626;
	}

	.btn-cancel:disabled,
	.btn-delete-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.header {
			flex-direction: column;
			align-items: flex-start;
			gap: 20px;
		}

		.strategies-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
