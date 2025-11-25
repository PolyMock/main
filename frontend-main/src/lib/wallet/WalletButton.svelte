<script lang="ts">
	import { onMount } from 'svelte';
	import { walletStore, setWalletAdapter, setWalletConnecting, setWalletDisconnecting, updateWalletConnection } from './stores';
	import { 
		PhantomWalletAdapter, 
		SolflareWalletAdapter
	} from '@solana/wallet-adapter-wallets';
	import type { Adapter } from '@solana/wallet-adapter-base';

	let walletState = $walletStore;
	let showWalletModal = false;
	let availableWallets: Adapter[] = [];

	walletStore.subscribe(value => {
		walletState = value;
	});

	onMount(() => {
		// Initialize available wallets
		try {
			availableWallets = [
				new PhantomWalletAdapter(),
				new SolflareWalletAdapter()
			];
		} catch (error) {
			console.error('Error initializing wallets:', error);
			availableWallets = [];
		}
	});

	async function selectWallet(wallet: Adapter) {
		try {
			setWalletConnecting(true);
			setWalletAdapter(wallet);
			showWalletModal = false;

			// Set up event listeners
			wallet.on('connect', () => {
				updateWalletConnection();
			});

			wallet.on('disconnect', () => {
				updateWalletConnection();
			});

			wallet.on('error', (error) => {
				console.error('Wallet error:', error);
				setWalletConnecting(false);
				setWalletDisconnecting(false);
			});

			// Connect to the wallet
			await wallet.connect();
			updateWalletConnection();
		} catch (error) {
			console.error('Failed to connect wallet:', error);
			setWalletConnecting(false);
		}
	}

	async function disconnect() {
		if (!walletState.adapter) return;

		try {
			setWalletDisconnecting(true);
			await walletState.adapter.disconnect();
			setWalletAdapter(null);
			updateWalletConnection();
		} catch (error) {
			console.error('Failed to disconnect wallet:', error);
		} finally {
			setWalletDisconnecting(false);
		}
	}

	function openWalletModal() {
		showWalletModal = true;
	}

	function closeWalletModal() {
		showWalletModal = false;
	}

	function formatAddress(address: string): string {
		return `${address.slice(0, 4)}...${address.slice(-4)}`;
	}
</script>

<div class="wallet-section">
	{#if walletState.connected && walletState.publicKey}
		<div class="wallet-info">
			<span class="wallet-address">{formatAddress(walletState.publicKey.toString())}</span>
			<button class="disconnect-btn" on:click={disconnect} disabled={walletState.disconnecting}>
				{walletState.disconnecting ? 'DISCONNECTING...' : 'DISCONNECT'}
			</button>
		</div>
	{:else}
		<button class="connect-btn" on:click={openWalletModal} disabled={walletState.connecting}>
			{walletState.connecting ? 'CONNECTING...' : 'CONNECT WALLET'}
		</button>
	{/if}
</div>

{#if showWalletModal}
	<div class="wallet-modal-overlay" on:click={closeWalletModal} role="button" tabindex="0" on:keydown={(e) => e.key === 'Escape' && closeWalletModal()}>
		<div class="wallet-modal" on:click|stopPropagation role="dialog" tabindex="-1">
			<div class="wallet-modal-header">
				<h3>Connect Wallet</h3>
				<button class="close-btn" on:click={closeWalletModal}>✕</button>
			</div>
			<div class="wallet-list">
				{#each availableWallets as wallet}
					<button class="wallet-option" on:click={() => selectWallet(wallet)}>
						<span class="wallet-name">{wallet.name}</span>
						<span class="wallet-status">
							{#if wallet.readyState === 'Installed'}
								Ready
							{:else if wallet.readyState === 'NotDetected'}
								Not Detected
							{:else}
								{wallet.readyState}
							{/if}
						</span>
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.wallet-section {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.connect-btn {
		background: #1E2139;
		color: #E8E8E8;
		border: 1px solid #2A2F45;
		padding: 8px 16px;
		font-family: Inter, sans-serif;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		border-radius: 6px;
		transition: all 200ms ease-out;
	}

	.connect-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.05);
		border-color: #00D084;
		transform: scale(1.02);
	}

	.connect-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	.wallet-info {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.wallet-address {
		color: #00D084;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 12px;
		padding: 6px 12px;
		background: #1E2139;
		border: 1px solid #2A2F45;
		border-radius: 6px;
	}

	.disconnect-btn {
		background: #1E2139;
		color: #A0A0A0;
		border: 1px solid #2A2F45;
		padding: 6px 12px;
		font-family: Inter, sans-serif;
		font-size: 11px;
		cursor: pointer;
		border-radius: 6px;
		transition: all 200ms ease-out;
	}

	.disconnect-btn:hover:not(:disabled) {
		background: #FF4757;
		color: #ffffff;
		border-color: #FF4757;
	}

	.disconnect-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.wallet-modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.wallet-modal {
		background: #1a1a1a;
		border: 2px solid #4785ff;
		padding: 20px;
		min-width: 300px;
		max-width: 400px;
	}

	.wallet-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 20px;
		border-bottom: 1px solid #333;
		padding-bottom: 10px;
	}

	.wallet-modal-header h3 {
		color: #4785ff;
		font-size: 16px;
		font-weight: bold;
		margin: 0;
		font-family: 'Courier New', monospace;
	}

	.close-btn {
		background: none;
		border: none;
		color: #666;
		font-size: 20px;
		cursor: pointer;
		padding: 0;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.close-btn:hover {
		color: #fff;
	}

	.wallet-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.wallet-option {
		background: #0a0a0a;
		border: 1px solid #333;
		color: #fff;
		padding: 15px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		transition: all 0.2s ease;
		font-family: 'Courier New', monospace;
	}

	.wallet-option:hover {
		border-color: #4785ff;
		background: rgba(71, 133, 255, 0.1);
	}

	.wallet-name {
		font-size: 14px;
		font-weight: bold;
	}

	.wallet-status {
		font-size: 10px;
		color: #666;
	}
</style>