<script lang="ts">
	import { page } from '$app/stores';
	import WalletButton from '$lib/wallet/WalletButton.svelte';
	import { walletStore } from '$lib/wallet/stores';
	import { authStore, loginWithGoogle } from '$lib/auth/auth-store';

	let walletState = $walletStore;
	let initializing = false;
	let showProfileDropdown = false;

	// Subscribe to wallet store
	walletStore.subscribe(value => {
		walletState = value;
	});

	async function handleInitialize() {
		if (!walletState.adapter || !walletState.connected) {
			alert('Please connect your wallet first');
			return;
		}

		initializing = true;
		try {
			const { initializeUserAccountIfNeeded } = await import('$lib/wallet/stores');
			await initializeUserAccountIfNeeded(walletState.adapter);
			alert('Account initialized successfully with 10,000 USDC!');
		} catch (error: any) {
			console.error('Failed to initialize:', error);
			alert(`Failed to initialize account: ${error.message || 'Unknown error'}`);
		} finally {
			initializing = false;
		}
	}

	async function handleConnectAccount() {
		try {
			const user = await loginWithGoogle();
			console.log('Login successful:', user);
		} catch (error: any) {
			console.error('Login failed:', error);
			if (error.message !== 'Authentication cancelled') {
				alert(`Login failed: ${error.message}`);
			}
		}
	}

	function handleLogout() {
		authStore.logout();
		showProfileDropdown = false;
	}

	function toggleProfileDropdown() {
		showProfileDropdown = !showProfileDropdown;
	}

	// Close dropdown when clicking outside
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.profile-dropdown-container')) {
			showProfileDropdown = false;
		}
	}

	$: currentPath = $page.url.pathname;
</script>

<svelte:window on:click={handleClickOutside} />

<div class="navbar">
	<a href="/" class="logo">POLYMOCK</a>
	<div class="nav-links">
		<a href="/" class="nav-link" class:active={currentPath === '/'}>TERMINAL</a>
		<a href="/news" class="nav-link" class:active={currentPath === '/news'}>NEWS</a>
		<a href="/competition" class="nav-link" class:active={currentPath === '/competition'}>COMPETITION</a>
		<a href="/dashboard" class="nav-link" class:active={currentPath === '/dashboard'}>DASHBOARD</a>
		<a href="/backtesting" class="nav-link" class:active={currentPath === '/backtesting'}>BACKTESTING</a>
	</div>

	<div class="navbar-right">
		{#if walletState.connected}
			{#if !walletState.userAccountInitialized && !walletState.loading}
				<button class="initialize-btn" on:click={handleInitialize} disabled={initializing}>
					{initializing ? 'Initializing...' : 'Initialize Account (0.1 SOL)'}
				</button>
			{/if}

			{#if walletState.userAccountInitialized}
				<div class="balance-display">
					<span class="balance-label">Balance:</span>
					<span class="balance-amount">${walletState.usdcBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
				</div>
			{/if}

			{#if walletState.loading}
				<div class="loading-badge">Loading...</div>
			{/if}
		{/if}

		<!-- Account Button -->
		{#if $authStore.isAuthenticated}
			<div class="profile-dropdown-container">
				<button class="account-btn" on:click={toggleProfileDropdown}>
					<img src={$authStore.user?.picture} alt="Profile" class="profile-pic" />
					<span class="account-name">{$authStore.user?.name?.split(' ')[0]}</span>
					<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
						<path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</button>

				{#if showProfileDropdown}
					<div class="profile-dropdown">
						<div class="dropdown-header">
							<img src={$authStore.user?.picture} alt="Profile" class="dropdown-profile-pic" />
							<div class="dropdown-user-info">
								<div class="dropdown-user-name">{$authStore.user?.name}</div>
								<div class="dropdown-user-email">{$authStore.user?.email}</div>
							</div>
						</div>
						<div class="dropdown-divider"></div>
						<button class="dropdown-item" on:click={handleLogout}>
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
								<path d="M6 14H3C2.44772 14 2 13.5523 2 13V3C2 2.44772 2.44772 2 3 2H6M11 11L14 8M14 8L11 5M14 8H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
							Logout
						</button>
					</div>
				{/if}
			</div>
		{:else}
			<button class="connect-account-btn" on:click={handleConnectAccount} disabled={$authStore.loading}>
				{#if $authStore.loading}
					Connecting...
				{:else}
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
						<path d="M8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2Z" stroke="currentColor" stroke-width="1.5"/>
						<path d="M8 5V8L10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
					Log In
				{/if}
			</button>
		{/if}

		<WalletButton />
	</div>
</div>

<style>
	.navbar {
		background: #151B2F;
		padding: 16px 24px;
		display: flex;
		align-items: center;
		gap: 16px;
		border-bottom: 1px solid #2A2F45;
		flex-wrap: wrap;
		min-height: 64px;
		position: sticky;
		top: 0;
		z-index: 100;
	}

	.logo {
		font-size: 20px;
		font-weight: 700;
		color: #E8E8E8;
		letter-spacing: 1px;
		text-decoration: none;
		transition: color 0.2s;
	}

	.logo:hover {
		color: #00D084;
	}

	.nav-links {
		display: flex;
		gap: 15px;
	}

	.nav-link {
		color: #A0A0A0;
		text-decoration: none;
		font-size: 13px;
		padding: 6px 12px;
		border: 1px solid transparent;
		transition: all 0.2s;
		border-radius: 4px;
		font-weight: 500;
	}

	.nav-link:hover {
		color: #E8E8E8;
		border-color: #3A4055;
		background: rgba(255, 255, 255, 0.05);
	}

	.nav-link.active {
		color: #00D084;
		border-color: #00D084;
		background: rgba(0, 208, 132, 0.1);
	}

	.navbar-right {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-left: auto;
		flex-shrink: 0;
	}

	.initialize-btn {
		padding: 8px 16px;
		background: linear-gradient(135deg, #00B4FF 0%, #0094D6 100%);
		color: white;
		border: none;
		font-weight: 600;
		font-size: 13px;
		cursor: pointer;
		font-family: Inter, sans-serif;
		border-radius: 8px;
		transition: all 200ms ease-out;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.initialize-btn:hover:not(:disabled) {
		background: linear-gradient(135deg, #00D4FF 0%, #00B4FF 100%);
		transform: scale(1.02);
		box-shadow: 0 4px 12px rgba(0, 180, 255, 0.3);
	}

	.initialize-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.loading-badge {
		padding: 8px 14px;
		background: #2A2F45;
		border: 1px solid #3A3F55;
		border-radius: 8px;
		color: #8B92AB;
		font-size: 12px;
		flex-shrink: 0;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}

	.balance-display {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		background: linear-gradient(135deg, #1E2139 0%, #252A45 100%);
		border: 1px solid #00D084;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		flex-shrink: 0;
	}

	.balance-label {
		color: #8B92AB;
		font-size: 11px;
		letter-spacing: 0.5px;
	}

	.balance-amount {
		color: #00D084;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 14px;
	}

	.connect-account-btn {
		padding: 8px 16px;
		background: linear-gradient(135deg, #00B4FF 0%, #0094D6 100%);
		color: white;
		border: none;
		font-weight: 600;
		font-size: 13px;
		cursor: pointer;
		font-family: Inter, sans-serif;
		border-radius: 8px;
		transition: all 200ms ease-out;
		white-space: nowrap;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.connect-account-btn:hover:not(:disabled) {
		background: linear-gradient(135deg, #00D4FF 0%, #00B4FF 100%);
		transform: scale(1.02);
		box-shadow: 0 4px 12px rgba(0, 180, 255, 0.3);
	}

	.connect-account-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.profile-dropdown-container {
		position: relative;
	}

	.account-btn {
		padding: 6px 12px;
		background: #1E2139;
		border: 1px solid #2A2F45;
		border-radius: 8px;
		color: #E8E8E8;
		font-family: Inter, sans-serif;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: all 200ms ease-out;
		display: flex;
		align-items: center;
		gap: 8px;
		white-space: nowrap;
	}

	.account-btn:hover {
		background: #252A45;
		border-color: #00D084;
	}

	.profile-pic {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		object-fit: cover;
	}

	.account-name {
		max-width: 100px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.profile-dropdown {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		min-width: 280px;
		background: #151B2F;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 1000;
		animation: slideDown 0.2s ease-out;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.dropdown-header {
		padding: 16px;
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.dropdown-profile-pic {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid #2A2F45;
	}

	.dropdown-user-info {
		flex: 1;
		min-width: 0;
	}

	.dropdown-user-name {
		font-size: 14px;
		font-weight: 600;
		color: #E8E8E8;
		margin-bottom: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dropdown-user-email {
		font-size: 12px;
		color: #8B92AB;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dropdown-divider {
		height: 1px;
		background: #2A2F45;
		margin: 0 8px;
	}

	.dropdown-item {
		width: 100%;
		padding: 12px 16px;
		background: transparent;
		border: none;
		color: #E8E8E8;
		font-family: Inter, sans-serif;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 200ms ease-out;
		display: flex;
		align-items: center;
		gap: 10px;
		text-align: left;
	}

	.dropdown-item:hover {
		background: rgba(255, 107, 107, 0.1);
		color: #FF6B6B;
	}

	.dropdown-item svg {
		flex-shrink: 0;
	}

	@media (max-width: 768px) {
		.navbar {
			padding: 12px 16px;
		}

		.nav-links {
			order: 3;
			width: 100%;
			flex-basis: 100%;
		}

		.account-name {
			display: none;
		}
	}
</style>
