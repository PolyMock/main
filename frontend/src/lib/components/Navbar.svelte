<script lang="ts">
	import { page } from '$app/stores';
	import WalletButton from '$lib/wallet/WalletButton.svelte';
	import { walletStore } from '$lib/wallet/stores';

	let walletState = $walletStore;
	let initializing = false;

	// Subscribe to wallet state
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

	$: currentPath = $page.url.pathname;
</script>

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

	@media (max-width: 768px) {
		.navbar {
			padding: 12px 16px;
		}

		.nav-links {
			order: 3;
			width: 100%;
			flex-basis: 100%;
		}
	}
</style>
