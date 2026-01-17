<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { walletStore } from '$lib/wallet/stores';
	import { authStore } from '$lib/auth/auth-store';

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
		createdAt: string;
	}

	let user: User | null = null;
	let strategies: Strategy[] = [];
	let loading = true;
	let error = '';
	let walletState = $walletStore;
	let authState = $authStore;
	let walletButtonRef: any;

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

	async function deleteStrategy(strategyId: number) {
		if (!confirm('Are you sure you want to delete this strategy?')) return;

		try {
			await fetch(`/api/strategies/${strategyId}`, { method: 'DELETE' });
			strategies = strategies.filter(s => s.id !== strategyId);
		} catch (err) {
			alert('Failed to delete strategy');
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
					<div class="strategy-card">
						<div class="card-header">
							<h3>{strategy.strategyName}</h3>
							<div class="card-actions">
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
									on:click={() => deleteStrategy(strategy.id)}
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

						<div class="metrics">
							<div class="metric">
								<span class="metric-label">Return</span>
								<span class="metric-value" class:positive={strategy.totalReturnPercent > 0} class:negative={strategy.totalReturnPercent < 0}>
									{strategy.totalReturnPercent > 0 ? '+' : ''}{strategy.totalReturnPercent.toFixed(2)}%
								</span>
							</div>

							<div class="metric">
								<span class="metric-label">Win Rate</span>
								<span class="metric-value">{strategy.winRate.toFixed(1)}%</span>
							</div>

							<div class="metric">
								<span class="metric-label">Trades</span>
								<span class="metric-value">{strategy.totalTrades}</span>
							</div>

							<div class="metric">
								<span class="metric-label">Profit Factor</span>
								<span class="metric-value">
									{strategy.profitFactor ? strategy.profitFactor.toFixed(2) : 'N/A'}
								</span>
							</div>
						</div>

						<div class="card-footer">
							<span class="date">{formatDate(strategy.createdAt)}</span>
							<span class="capital">
								{formatCurrency(strategy.initialCapital)} → {formatCurrency(strategy.finalCapital)}
							</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.strategies-page {
		min-height: 100vh;
		background: #0a0e1a;
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
		border: 2px solid #3b82f6;
	}

	.avatar-placeholder {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: 2px solid #3b82f6;
		background: #3b82f6;
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
		border-color: #3b82f6;
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
		background: #3b82f6;
		color: white;
		border-radius: 8px;
		text-decoration: none;
		font-weight: 600;
		transition: all 0.2s;
	}

	.btn-primary:hover {
		background: #2563eb;
		transform: translateY(-2px);
	}

	.strategies-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
		gap: 24px;
	}

	.strategy-card {
		background: #141824;
		border: 1px solid #1e2537;
		border-radius: 12px;
		padding: 24px;
		transition: all 0.2s;
	}

	.strategy-card:hover {
		border-color: #3b82f6;
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 12px;
	}

	.card-header h3 {
		color: white;
		font-size: 18px;
		font-weight: 700;
		margin: 0;
		flex: 1;
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
		border-color: #3b82f6;
		color: #3b82f6;
	}

	.btn-delete:hover {
		border-color: #ef4444;
		color: #ef4444;
	}

	.market-question {
		color: #8b92ab;
		font-size: 14px;
		margin: 0 0 20px 0;
		line-height: 1.5;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
		margin-bottom: 20px;
		padding: 16px;
		background: #1a1f2e;
		border-radius: 8px;
	}

	.metric {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.metric-label {
		font-size: 11px;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: 600;
	}

	.metric-value {
		font-size: 18px;
		color: white;
		font-weight: 700;
	}

	.metric-value.positive {
		color: #10b981;
	}

	.metric-value.negative {
		color: #ef4444;
	}

	.card-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: 16px;
		border-top: 1px solid #1e2537;
		font-size: 13px;
	}

	.date {
		color: #6b7280;
	}

	.capital {
		color: #8b92ab;
		font-weight: 600;
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
