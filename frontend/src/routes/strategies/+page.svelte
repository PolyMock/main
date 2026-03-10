<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { walletStore } from '$lib/wallet/stores';
	import { authStore } from '$lib/auth/auth-store';
	import { supabase } from '$lib/supabase';
	import MiniEquityCurveChart from '$lib/components/MiniEquityCurveChart.svelte';
	import PaperTradeConfirmModal from '$lib/components/PaperTradeConfirmModal.svelte';
	import { polymarketService } from '$lib/solana/polymarket-service';
	import { findSimilarActiveMarkets, calculateBatchInfo, executePaperTrading } from '$lib/services/strategy-paper-trading';

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

	interface PostedTrade {
		id: number;
		marketTitle: string;
		positionType: string;
		entryPrice: number;
		exitPrice: number | null;
		pnl: number | null;
		status: string;
		platform: string;
		source: string;
		analysis: string | null;
		createdAt: string;
	}

	let user: User | null = null;
	let strategies: Strategy[] = [];
	let postedTrades: PostedTrade[] = [];
	let loading = true;
	let error = '';
	let walletState = $walletStore;
	let authState = $authStore;
	let walletButtonRef: any;
	let activeTab: 'all' | 'strategies' | 'trades' = 'all';

	// Profile state
	let profileUsername = '';
	let profileWalletAddress = '';
	let profileAvatarUrl = '';
	let profileBannerUrl = '';
	let uploadingAvatar = false;
	let uploadingBanner = false;
	let copiedAddress = false;
	let fileInput: HTMLInputElement;
	let bannerFileInput: HTMLInputElement;

	// Delete modal state
	let showDeleteModal = false;
	let strategyToDelete: Strategy | null = null;
	let isDeleting = false;
	let deleteError = '';

	// Paper trading modal state
	let showPaperTradeModal = false;
	let paperTradeStrategy: Strategy | null = null;
	let matchedMarkets: any[] = [];
	let signaturesNeeded = 0;
	let isPaperTrading = false;
	let paperTradeProgress = { current: 0, total: 0 };
	let paperTradeError = '';

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

		// Clear strategies when wallet disconnects
		if (!value.connected && previousConnected) {
			user = null;
			strategies = [];
			postedTrades = [];
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
			// Determine wallet address from session or connected wallet
			let walletAddress = '';

			const userRes = await fetch('/api/auth/user', { credentials: 'include' });
			const userData = await userRes.json();
			if (userData.user) {
				user = userData.user;
				walletAddress = userData.user.solanaAddress || userData.user.walletAddress || '';
			}

			if (!walletAddress && walletState.connected && walletState.publicKey) {
				walletAddress = walletState.publicKey.toString();
				user = {
					id: 0,
					name: `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`,
					email: '',
					picture: ''
				};
			}

			if (!walletAddress) {
				strategies = [];
				postedTrades = [];
				return;
			}

			// Look up user from Supabase
			const { data: dbUser } = await supabase
				.from('users')
				.select('id, username, avatar_url, banner_url')
				.eq('wallet_address', walletAddress)
				.maybeSingle();

			if (!dbUser) {
				strategies = [];
				postedTrades = [];
				return;
			}

			// Set profile info
			profileUsername = dbUser.username || '';
			profileWalletAddress = walletAddress;
			profileAvatarUrl = dbUser.avatar_url || '';
			profileBannerUrl = dbUser.banner_url || '';

			// Fetch backtest strategies
			const { data: strats, error: stratErr } = await supabase
				.from('backtest_strategies')
				.select('*')
				.eq('user_id', dbUser.id)
				.order('created_at', { ascending: false });

			if (stratErr) throw new Error(stratErr.message);

			strategies = (strats || []).map((s: any) => ({
				id: s.id,
				strategyName: s.strategy_name,
				marketQuestion: s.market_question || '',
				initialCapital: s.initial_capital || 0,
				finalCapital: s.final_capital || 0,
				totalReturnPercent: s.total_return_percent || 0,
				totalTrades: s.total_trades || 0,
				winRate: s.win_rate || 0,
				profitFactor: s.profit_factor || 0,
				maxDrawdown: s.max_drawdown || 0,
				equityCurve: s.equity_curve || [],
				createdAt: s.created_at,
				avgWin: s.avg_win || 0,
				avgLoss: s.avg_loss || 0
			}));

			// Fetch posted trades
			const { data: trades, error: tradeErr } = await supabase
				.from('trades')
				.select('*')
				.eq('user_id', dbUser.id)
				.eq('is_published', true)
				.eq('source', 'polymock')
				.order('created_at', { ascending: false });

			if (tradeErr) throw new Error(tradeErr.message);

			postedTrades = (trades || []).map((t: any) => ({
				id: t.id,
				marketTitle: t.market_title || 'Unknown Market',
				positionType: t.position_type || '',
				entryPrice: t.entry_price || 0,
				exitPrice: t.exit_price,
				pnl: t.pnl,
				status: t.status || 'closed',
				platform: t.platform || '',
				source: t.source || '',
				analysis: t.analysis,
				createdAt: t.created_at
			}));

		} catch (err: any) {
			console.error('Error loading strategies:', err);
			error = err.message || 'Failed to load strategies';
			strategies = [];
			postedTrades = [];
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
			const { error: delErr } = await supabase
				.from('backtest_strategies')
				.delete()
				.eq('id', strategyToDelete.id);

			if (delErr) throw new Error(delErr.message);

			strategies = strategies.filter(s => s.id !== strategyToDelete.id);
			closeDeleteModal();
		} catch (err: any) {
			deleteError = err.message || 'Failed to delete strategy';
		} finally {
			isDeleting = false;
		}
	}

	async function openPaperTradeModal(strategy: Strategy) {
		paperTradeStrategy = strategy;
		paperTradeError = '';

		try {
			// Find similar active markets
			matchedMarkets = await findSimilarActiveMarkets(strategy, 10);

			if (matchedMarkets.length === 0) {
				paperTradeError = 'No active markets found matching your strategy criteria.';
				return;
			}

			// Calculate batch info
			const batchInfo = calculateBatchInfo(matchedMarkets.length);
			signaturesNeeded = batchInfo.signaturesNeeded;

			showPaperTradeModal = true;
		} catch (err: any) {
			console.error('Error preparing paper trade:', err);
			paperTradeError = err.message || 'Failed to prepare paper trading';
		}
	}

	function closePaperTradeModal() {
		showPaperTradeModal = false;
		paperTradeStrategy = null;
		matchedMarkets = [];
		paperTradeError = '';
	}

	async function confirmPaperTrade() {
		if (!paperTradeStrategy || !walletState.publicKey) return;

		isPaperTrading = true;
		paperTradeError = '';
		showPaperTradeModal = false;

		try {
			// Initialize program if not already
			if (!polymarketService['program']) {
				await polymarketService.initializeProgram(walletState);
			}

			// Get user account balance
			const userAccount = await polymarketService.getUserAccount(walletState.publicKey);
			if (!userAccount) {
				throw new Error('User account not found. Please initialize your account first.');
			}

			const balance = userAccount.usdcBalance.toNumber() / 1_000_000;

			// Execute paper trading
			const result = await executePaperTrading(
				paperTradeStrategy,
				matchedMarkets,
				walletState,
				balance,
				(current, total) => {
					paperTradeProgress = { current, total };
				}
			);

			alert(`Paper trading completed!\n\nSuccessful: ${result.success}\nFailed: ${result.failed}\n\nCheck your dashboard to view positions.`);

			// Redirect to dashboard
			goto('/dashboard');

		} catch (err: any) {
			console.error('Error executing paper trade:', err);
			paperTradeError = err.message || 'Failed to execute paper trading';
			alert(`Paper trading failed: ${paperTradeError}`);
		} finally {
			isPaperTrading = false;
			paperTradeProgress = { current: 0, total: 0 };
		}
	}

	async function handleAvatarUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !profileWalletAddress) return;

		// Validate file
		if (!file.type.startsWith('image/')) {
			alert('Please select an image file');
			return;
		}
		if (file.size > 2 * 1024 * 1024) {
			alert('Image must be under 2MB');
			return;
		}

		uploadingAvatar = true;
		try {
			const ext = file.name.split('.').pop() || 'png';
			const filePath = `${profileWalletAddress}.${ext}`;

			// Delete any existing avatar files for this wallet
			const { data: existingFiles } = await supabase.storage
				.from('avatar')
				.list('', { search: profileWalletAddress });
			if (existingFiles && existingFiles.length > 0) {
				await supabase.storage
					.from('avatar')
					.remove(existingFiles.map(f => f.name));
			}

			// Upload to Supabase Storage
			const { error: uploadErr } = await supabase.storage
				.from('avatar')
				.upload(filePath, file, { upsert: true });

			if (uploadErr) throw new Error(uploadErr.message);

			// Get public URL
			const { data: urlData } = supabase.storage
				.from('avatar')
				.getPublicUrl(filePath);

			const avatarUrl = urlData.publicUrl + '?t=' + Date.now();

			// Update user record
			const { error: updateErr } = await supabase
				.from('users')
				.update({ avatar_url: avatarUrl })
				.eq('wallet_address', profileWalletAddress);

			if (updateErr) throw new Error(updateErr.message);

			profileAvatarUrl = avatarUrl;
		} catch (err: any) {
			console.error('Avatar upload error:', err);
			alert('Failed to upload avatar: ' + err.message);
		} finally {
			uploadingAvatar = false;
		}
	}

	async function handleBannerUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !profileWalletAddress) return;

		if (!file.type.startsWith('image/')) {
			alert('Please select an image file');
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			alert('Image must be under 5MB');
			return;
		}

		uploadingBanner = true;
		try {
			const ext = file.name.split('.').pop() || 'png';
			const filePath = `${profileWalletAddress}.${ext}`;

			const { data: existingFiles } = await supabase.storage
				.from('banner')
				.list('', { search: profileWalletAddress });
			if (existingFiles && existingFiles.length > 0) {
				await supabase.storage
					.from('banner')
					.remove(existingFiles.map(f => f.name));
			}

			const { error: uploadErr } = await supabase.storage
				.from('banner')
				.upload(filePath, file, { upsert: true });

			if (uploadErr) throw new Error(uploadErr.message);

			const { data: urlData } = supabase.storage
				.from('banner')
				.getPublicUrl(filePath);

			const bannerUrl = urlData.publicUrl + '?t=' + Date.now();

			const { error: updateErr } = await supabase
				.from('users')
				.update({ banner_url: bannerUrl })
				.eq('wallet_address', profileWalletAddress);

			if (updateErr) throw new Error(updateErr.message);

			profileBannerUrl = bannerUrl;
		} catch (err: any) {
			console.error('Banner upload error:', err);
			alert('Failed to upload banner: ' + err.message);
		} finally {
			uploadingBanner = false;
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
			<h1>My Profile</h1>
		</div>

		<!-- Profile Section -->
		{#if !loading && profileUsername}
			<div class="profile-section">
				<!-- Banner -->
				<div class="profile-banner" on:click={() => bannerFileInput.click()}>
					{#if profileBannerUrl}
						<img src={profileBannerUrl} alt="Banner" class="profile-banner-image" />
					{:else}
						<div class="profile-banner-placeholder"></div>
					{/if}
					<div class="profile-banner-gradient"></div>
					<div class="profile-banner-overlay">
						{#if uploadingBanner}
							<span class="upload-spinner"></span>
						{:else}
							<div class="profile-banner-badge">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
									<circle cx="12" cy="13" r="4"/>
								</svg>
								<span>{profileBannerUrl ? 'Change Banner' : 'Add Banner'}</span>
							</div>
						{/if}
					</div>
					<input
						type="file"
						accept="image/*"
						bind:this={bannerFileInput}
						on:change={handleBannerUpload}
						style="display:none"
					/>
				</div>

				<!-- Avatar + Info -->
				<div class="profile-header-row">
					<div class="profile-avatar-wrapper" on:click|stopPropagation={() => fileInput.click()}>
						{#if profileAvatarUrl}
							<img src={profileAvatarUrl} alt="avatar" class="profile-avatar" />
						{:else}
							<div class="profile-avatar-placeholder">
								{profileUsername.charAt(0).toUpperCase()}
							</div>
						{/if}
						<div class="avatar-overlay">
							{#if uploadingAvatar}
								<span class="upload-spinner"></span>
							{:else}
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
									<circle cx="12" cy="13" r="4"/>
								</svg>
							{/if}
						</div>
						<input
							type="file"
							accept="image/*"
							bind:this={fileInput}
							on:change={handleAvatarUpload}
							style="display:none"
						/>
					</div>
					<div class="profile-info">
						<span class="profile-username">@{profileUsername}</span>
						<span
							class="profile-address"
							title="Click to copy address"
							on:click={() => {
								navigator.clipboard.writeText(profileWalletAddress);
								copiedAddress = true;
								setTimeout(() => copiedAddress = false, 1500);
							}}
						>
							{copiedAddress ? 'Copied!' : profileWalletAddress.slice(0, 6) + '...' + profileWalletAddress.slice(-4)}
						</span>
						<div class="profile-stats">
							<span class="profile-stat">{strategies.length} strategies</span>
							<span class="profile-stat-sep">|</span>
							<span class="profile-stat">{postedTrades.length} trades</span>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Tabs -->
		{#if user}
			<div class="tabs">
				<button class="tab" class:active={activeTab === 'all'} on:click={() => activeTab = 'all'}>
					All ({strategies.length + postedTrades.length})
				</button>
				<button class="tab" class:active={activeTab === 'strategies'} on:click={() => activeTab = 'strategies'}>
					Strategies ({strategies.length})
				</button>
				<button class="tab" class:active={activeTab === 'trades'} on:click={() => activeTab = 'trades'}>
					Trades ({postedTrades.length})
				</button>
			</div>
		{/if}

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
		{:else if strategies.length === 0 && postedTrades.length === 0}
			<div class="empty-state">
				<h2>Nothing Here Yet</h2>
				<p>Complete a backtest or post a trade to see it here.</p>
				<a href="/backtesting?tab=strategy" class="btn-primary">Start Backtesting</a>
			</div>
		{:else}
			<div class="strategies-grid">
				<!-- Strategy Cards -->
				{#if activeTab === 'all' || activeTab === 'strategies'}
					{#each strategies as strategy}
						<div class="strategy-card" on:click={() => viewStrategy(strategy.id)}>
							<div class="card-type-badge strategy-badge">STRATEGY</div>
							<div class="card-header">
								<div class="header-left">
									<h3>{strategy.strategyName}</h3>
									<span class="date">{formatDate(strategy.createdAt)}</span>
								</div>
								<div class="card-actions" on:click|stopPropagation>
									<button
										on:click={() => openPaperTradeModal(strategy)}
										class="btn-paper-trade"
										title="Paper Trade This Strategy"
										disabled={isPaperTrading}
									>
										<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
											<path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
											<path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z"/>
										</svg>
									</button>
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

							<div class="return-badge" class:positive={strategy.totalReturnPercent > 0} class:negative={strategy.totalReturnPercent < 0}>
								<span class="return-label">RETURN</span>
								<span class="return-value">
									{strategy.totalReturnPercent > 0 ? '+' : ''}{strategy.totalReturnPercent.toFixed(2)}%
								</span>
							</div>

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
				{/if}

				<!-- Trade Cards -->
				{#if activeTab === 'all' || activeTab === 'trades'}
					{#each postedTrades as trade}
						<div class="strategy-card trade-card-item">
							<div class="card-type-badge trade-badge">TRADE</div>
							<div class="card-header">
								<div class="header-left">
									<h3>{trade.marketTitle}</h3>
									<span class="date">{formatDate(trade.createdAt)}</span>
								</div>
								<div class="trade-position-badge" class:pos-yes={trade.positionType === 'Yes'} class:pos-no={trade.positionType === 'No'}>
									{trade.positionType}
								</div>
							</div>

							{#if trade.pnl != null}
								<div class="return-badge" class:positive={trade.pnl >= 0} class:negative={trade.pnl < 0}>
									<span class="return-label">PnL</span>
									<span class="return-value">
										{trade.pnl >= 0 ? '+' : ''}{formatCurrency(trade.pnl)}
									</span>
								</div>
							{/if}

							<div class="metrics trade-metrics">
								<div class="metric">
									<span class="metric-label">ENTRY</span>
									<span class="metric-value">${trade.entryPrice.toFixed(4)}</span>
								</div>
								{#if trade.exitPrice != null}
									<div class="metric">
										<span class="metric-label">EXIT</span>
										<span class="metric-value">${trade.exitPrice.toFixed(4)}</span>
									</div>
								{/if}
								<div class="metric">
									<span class="metric-label">STATUS</span>
									<span class="metric-value" class:positive={trade.status === 'closed'}>
										{trade.status}
									</span>
								</div>
								<div class="metric">
									<span class="metric-label">PLATFORM</span>
									<span class="metric-value">{trade.platform}</span>
								</div>
								<div class="metric">
									<span class="metric-label">SOURCE</span>
									<span class="metric-value">{trade.source}</span>
								</div>
							</div>

							{#if trade.analysis}
								<div class="trade-analysis">
									<span class="analysis-label">Analysis</span>
									<p>{trade.analysis}</p>
								</div>
							{/if}
						</div>
					{/each}
				{/if}
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

<!-- Paper Trade Confirmation Modal -->
<PaperTradeConfirmModal
	bind:show={showPaperTradeModal}
	strategy={paperTradeStrategy}
	matchedMarkets={matchedMarkets}
	signaturesNeeded={signaturesNeeded}
	totalPositions={matchedMarkets.length}
	on:close={closePaperTradeModal}
	on:confirm={confirmPaperTrade}
/>

<!-- Paper Trading Progress Overlay -->
{#if isPaperTrading}
	<div class="progress-overlay">
		<div class="progress-content">
			<div class="spinner"></div>
			<h3>Executing Paper Trades...</h3>
			<p>Batch {paperTradeProgress.current} of {paperTradeProgress.total}</p>
			<p class="progress-note">Please approve each transaction in your wallet</p>
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
		background: #000000;
		color: white;
		border: 1px solid #FFFFFF;
		border-radius: 8px;
		text-decoration: none;
		font-weight: 600;
		transition: all 0.2s;
	}

	.btn-primary:hover {
		border-color: #F97316;
		color: #F97316;
	}

	.strategies-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
		gap: 24px;
	}

	.strategy-card {
		background: #000000;
		border: 1px solid #FFFFFF;
		border-radius: 16px;
		padding: 24px;
		transition: all 0.2s;
		cursor: pointer;
		position: relative;
	}

	.strategy-card:hover {
		border-color: #F97316;
		background: #000000;
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

	.btn-paper-trade {
		padding: 8px;
		background: transparent;
		border: 1px solid #00d084;
		color: #00d084;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.btn-paper-trade:hover:not(:disabled) {
		background: rgba(0, 208, 132, 0.1);
		border-color: #00e094;
		color: #00e094;
	}

	.btn-paper-trade:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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
		background: #000000;
		border-radius: 10px;
		padding: 16px;
		border: 1px solid rgba(255, 255, 255, 0.2);
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
		background: #000000;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.2);
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
		border-top: 1px solid rgba(255, 255, 255, 0.1);
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

	.progress-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.9);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		backdrop-filter: blur(8px);
	}

	.progress-content {
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 16px;
		padding: 48px;
		text-align: center;
		max-width: 400px;
	}

	.spinner {
		width: 64px;
		height: 64px;
		border: 4px solid #333;
		border-top-color: #00d084;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 24px auto;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.progress-content h3 {
		margin: 0 0 12px 0;
		font-size: 20px;
		font-weight: 600;
		color: #fff;
	}

	.progress-content p {
		margin: 0 0 8px 0;
		color: #888;
		font-size: 14px;
	}

	.progress-note {
		color: #00d084 !important;
		font-weight: 600;
	}

	/* Profile Section */
	.profile-section {
		background: #000;
		border: 1px solid #404040;
		border-radius: 16px;
		margin-bottom: 32px;
		overflow: hidden;
	}

	.profile-banner {
		position: relative;
		height: 160px;
		width: 100%;
		cursor: pointer;
		overflow: hidden;
	}

	.profile-banner-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.profile-banner-placeholder {
		width: 100%;
		height: 100%;
		background: linear-gradient(135deg, rgba(249, 115, 22, 0.25) 0%, rgba(147, 51, 234, 0.2) 50%, rgba(17, 24, 39, 0.8) 100%);
	}

	.profile-banner-gradient {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, #000000 0%, transparent 60%);
		pointer-events: none;
	}

	.profile-banner-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0);
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: all 0.2s;
	}

	.profile-banner:hover .profile-banner-overlay {
		opacity: 1;
		background: rgba(0, 0, 0, 0.4);
	}

	.profile-banner-badge {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		border-radius: 12px;
		background: rgba(0, 0, 0, 0.6);
		border: 1px solid #555;
		backdrop-filter: blur(8px);
		color: white;
		font-size: 12px;
		font-weight: 500;
	}

	.profile-header-row {
		display: flex;
		align-items: flex-end;
		gap: 20px;
		padding: 0 28px;
		margin-top: -44px;
		position: relative;
		z-index: 1;
		padding-bottom: 24px;
	}

	.profile-avatar-wrapper {
		position: relative;
		width: 96px;
		height: 96px;
		border-radius: 50%;
		cursor: pointer;
		flex-shrink: 0;
		border: 4px solid #000;
		box-shadow: 0 0 0 2px #555;
		background: #000;
	}

	.profile-avatar {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		object-fit: cover;
		display: block;
	}

	.profile-avatar-placeholder {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		background: linear-gradient(135deg, rgba(249, 115, 22, 0.3), rgba(249, 115, 22, 0.1));
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 36px;
		font-weight: 700;
		color: #fb923c;
	}

	.avatar-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.2s;
		color: white;
	}

	.profile-avatar-wrapper:hover .avatar-overlay {
		opacity: 1;
	}

	.upload-spinner {
		width: 20px;
		height: 20px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.profile-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-bottom: 4px;
	}

	.profile-username {
		font-size: 28px;
		font-weight: 700;
		color: #ffffff;
	}

	.profile-address {
		font-size: 13px;
		color: #6b7280;
		font-family: 'SF Mono', Consolas, monospace;
		cursor: pointer;
		transition: color 0.2s;
	}

	.profile-address:hover {
		color: #F97316;
	}

	.profile-stats {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 2px;
	}

	.profile-stat {
		font-size: 13px;
		color: #8b92ab;
		font-weight: 600;
	}

	.profile-stat-sep {
		color: #2a2f45;
		font-size: 13px;
	}

	/* Tabs */
	.tabs {
		display: flex;
		gap: 8px;
		margin-bottom: 32px;
	}

	.tab {
		padding: 10px 20px;
		background: transparent;
		border: 1px solid #2a2f45;
		color: #8b92ab;
		border-radius: 8px;
		cursor: pointer;
		font-size: 14px;
		font-weight: 600;
		transition: all 0.2s;
	}

	.tab:hover {
		border-color: #F97316;
		color: #F97316;
	}

	.tab.active {
		background: #F97316;
		border-color: #F97316;
		color: white;
	}

	/* Type badges */
	.card-type-badge {
		display: inline-block;
		padding: 4px 10px;
		border-radius: 4px;
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.8px;
		text-transform: uppercase;
		margin-bottom: 12px;
	}

	.strategy-badge {
		background: rgba(99, 102, 241, 0.15);
		color: #818cf8;
		border: 1px solid rgba(99, 102, 241, 0.3);
	}

	.trade-badge {
		background: rgba(249, 115, 22, 0.15);
		color: #F97316;
		border: 1px solid rgba(249, 115, 22, 0.3);
	}

	/* Trade card specifics */
	.trade-card-item {
		cursor: default;
	}

	.trade-position-badge {
		padding: 4px 12px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 700;
		text-transform: uppercase;
	}

	.pos-yes {
		background: rgba(16, 185, 129, 0.15);
		color: #10b981;
		border: 1px solid rgba(16, 185, 129, 0.3);
	}

	.pos-no {
		background: rgba(239, 68, 68, 0.15);
		color: #ef4444;
		border: 1px solid rgba(239, 68, 68, 0.3);
	}

	.trade-metrics {
		grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
	}

	.trade-analysis {
		margin-top: 12px;
		padding: 12px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
	}

	.analysis-label {
		font-size: 10px;
		color: #8B92AB;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: 700;
	}

	.trade-analysis p {
		color: #ccc;
		font-size: 13px;
		margin: 6px 0 0 0;
		line-height: 1.5;
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

		.tabs {
			flex-wrap: wrap;
		}
	}
</style>
