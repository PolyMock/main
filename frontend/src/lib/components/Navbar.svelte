<script lang="ts">
	import { page } from '$app/stores';
	import WalletButton from '$lib/wallet/WalletButton.svelte';
	import { walletStore } from '$lib/wallet/stores';
	import { authStore, loginWithGoogle } from '$lib/auth/auth-store';

	let walletState = $walletStore;
	let initializing = false;
	let showProfileDropdown = false;
	let showSettingsDropdown = false;
	let darkMode = false;

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
		if (!target.closest('.settings-dropdown-container')) {
			showSettingsDropdown = false;
		}
	}

	function toggleSettingsDropdown() {
		showSettingsDropdown = !showSettingsDropdown;
	}

	function toggleDarkMode() {
		darkMode = !darkMode;
		// Apply dark mode class to body
		if (darkMode) {
			document.body.classList.add('light-mode');
		} else {
			document.body.classList.remove('light-mode');
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
		<a href="/backtesting?tab=summary" class="nav-link" class:active={currentPath === '/backtesting' && (!$page.url.searchParams.get('tab') || $page.url.searchParams.get('tab') === 'summary')}>PORTFOLIO</a>
		<a href="/backtesting?tab=strategy" class="nav-link" class:active={currentPath === '/backtesting' && $page.url.searchParams.get('tab') === 'strategy'}>BACKTESTING</a>
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
						<a href="/profile" class="dropdown-item" on:click={() => showProfileDropdown = false}>
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
								<path d="M8 8C9.65685 8 11 6.65685 11 5C11 3.34315 9.65685 2 8 2C6.34315 2 5 3.34315 5 5C5 6.65685 6.34315 8 8 8Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
								<path d="M2 14C2 11.7909 3.79086 10 6 10H10C12.2091 10 14 11.7909 14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
							Profile
						</a>
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
					Log In
				{/if}
			</button>
		{/if}

		<WalletButton />

		<!-- Settings Dropdown -->
		<div class="settings-dropdown-container">
			<button class="settings-btn" on:click={toggleSettingsDropdown}>
				<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
					<path d="M3 5H17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					<path d="M3 10H17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					<path d="M3 15H17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
			</button>

			{#if showSettingsDropdown}
				<div class="settings-dropdown">
					<button class="dropdown-item" on:click={toggleDarkMode}>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
							{#if darkMode}
								<path d="M8 11C9.65685 11 11 9.65685 11 8C11 6.34315 9.65685 5 8 5C6.34315 5 5 6.34315 5 8C5 9.65685 6.34315 11 8 11Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
								<path d="M8 1V2M8 14V15M15 8H14M2 8H1M12.364 12.364L11.657 11.657M4.343 4.343L3.636 3.636M12.364 3.636L11.657 4.343M4.343 11.657L3.636 12.364" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							{:else}
								<path d="M14 8.5C13.7 11.5 11 14 8 14C4.5 14 2 11.5 2 8C2 4.5 4.5 2 8 2C8.4 2 8.8 2.05 9.2 2.1C7.5 3.5 7 6 8.5 8C10 10 12.5 10.5 14 8.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							{/if}
						</svg>
						{darkMode ? 'Light Mode' : 'Dark Mode'}
					</button>
					<button class="dropdown-item" on:click={() => { showSettingsDropdown = false; window.location.href = '/leaderboard'; }}>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
							<path d="M8 10C9.10457 10 10 9.10457 10 8C10 6.89543 9.10457 6 8 6C6.89543 6 6 6.89543 6 8C6 9.10457 6.89543 10 8 10Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							<path d="M12.93 8C12.7925 8.8831 12.3962 9.70505 11.7882 10.3605C11.1803 11.0159 10.3879 11.4761 9.51568 11.6816C8.64343 11.8872 7.73011 11.8292 6.89209 11.5148C6.05407 11.2005 5.32681 10.6432 4.79979 9.9136C4.27277 9.18404 3.97079 8.31375 3.93146 7.41164C3.89212 6.50953 4.11722 5.61615 4.57863 4.84005C5.04004 4.06394 5.71927 3.43717 6.53298 3.03636C7.34668 2.63555 8.25932 2.47794 9.16 2.58333M14 8C14 9.06087 13.7284 10.1029 13.2094 11.0355C12.6904 11.9681 11.9395 12.7626 11.0278 13.3452C10.1161 13.9279 9.07394 14.2801 8 14.3701C6.92606 14.4602 5.84405 14.2855 4.85368 13.863C3.8633 13.4406 2.99414 12.7844 2.31799 11.9524C1.64184 11.1204 1.17967 10.138 0.972365 9.08864C0.765062 8.03932 0.810426 6.95488 1.10444 5.92729C1.39845 4.8997 1.93426 3.96292 2.66667 3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Leaderboard
					</button>
				</div>
			{/if}
		</div>
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
		text-decoration: none;
	}

	.dropdown-item:hover {
		background: rgba(0, 208, 132, 0.1);
		color: #00D084;
	}

	.dropdown-item:last-child:hover {
		background: rgba(255, 107, 107, 0.1);
		color: #FF6B6B;
	}

	.dropdown-item svg {
		flex-shrink: 0;
	}

	.settings-dropdown-container {
		position: relative;
	}

	.settings-btn {
		padding: 6px;
		background: #1E2139;
		border: 1px solid #2A2F45;
		border-radius: 8px;
		color: #E8E8E8;
		cursor: pointer;
		transition: all 200ms ease-out;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: Inter, sans-serif;
	}

	.settings-btn:hover {
		background: #252A45;
		border-color: #00D084;
	}

	.settings-dropdown {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		min-width: 200px;
		background: #151B2F;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 1000;
		animation: slideDown 0.2s ease-out;
		overflow: hidden;
	}

	.settings-dropdown .dropdown-item {
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
		border-bottom: 1px solid #2A2F45;
	}

	.settings-dropdown .dropdown-item:last-child {
		border-bottom: none;
	}

	.settings-dropdown .dropdown-item:hover:not(:disabled) {
		background: rgba(0, 208, 132, 0.1);
		color: #00D084;
	}

	.settings-dropdown .dropdown-item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		color: #666;
	}

	.settings-dropdown .dropdown-item svg {
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
