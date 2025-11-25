<script lang="ts">
	import { onMount } from 'svelte';
	import { walletStore, walletManager } from './stores';
	import WalletModal from './WalletModal.svelte';

	let showModal = false;
	let wallets: any[] = [];

	// Subscribe to wallet state
	let walletState: any = {};
	walletStore.subscribe(state => {
		walletState = state;
	});

	onMount(() => {
		wallets = walletManager.getWallets();
		// Auto-connect if previously connected
		walletManager.autoConnect();
	});

	function openModal() {
		showModal = true;
	}

	function closeModal() {
		showModal = false;
	}

	async function handleWalletSelect(event: CustomEvent) {
		const walletName = event.detail;
		try {
			await walletManager.connect(walletName);
			closeModal();
		} catch (error: any) {
			if (error?.message?.includes('not installed')) {
				alert(error.message);
			} else if (error?.message?.includes('User rejected') || error?.message?.includes('not been authorized')) {
				alert('Connection cancelled. Please approve in your wallet.');
			} else if (error?.message?.includes('Unexpected error')) {
				alert('Connection failed. Make sure Phantom is unlocked and try again.');
			} else {
				alert(`Failed to connect: ${error?.message || 'Unknown error'}`);
			}
		}
	}

	async function handleDisconnect() {
		try {
			await walletManager.disconnect();
		} catch (error) {
		}
	}

	function formatAddress(address: string) {
		if (!address) return '';
		return `${address.slice(0, 4)}...${address.slice(-4)}`;
	}
</script>

{#if walletState.connected && walletState.publicKey}
	<div class="wallet-connected">
		<div class="wallet-info">
			<div class="wallet-address">
				{formatAddress(walletState.publicKey.toBase58())}
			</div>
			<div class="wallet-name">{walletState.adapter?.name || 'Connected'}</div>
		</div>
		<button class="disconnect-button" on:click={handleDisconnect}>
			Disconnect
		</button>
	</div>
{:else}
	<button 
		class="connect-button" 
		class:connecting={walletState.connecting}
		on:click={openModal}
		disabled={walletState.connecting}
	>
		{#if walletState.connecting}
			<div class="spinner"></div>
			Connecting...
		{:else}
			Connect Wallet
		{/if}
	</button>
{/if}

<WalletModal 
	bind:show={showModal}
	{wallets}
	connecting={walletState.connecting}
	on:select={handleWalletSelect}
	on:close={closeModal}
/>

<style>
	.connect-button {
		background: #ff9500;
		color: #000;
		border: none;
		padding: 8px 16px;
		font-family: 'Courier New', monospace;
		font-size: 12px;
		font-weight: bold;
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 120px;
		justify-content: center;
	}

	.connect-button:hover:not(:disabled) {
		background: #ffb733;
		transform: translateY(-1px);
	}

	.connect-button:disabled {
		opacity: 0.7;
		cursor: not-allowed;
		transform: none;
	}

	.connect-button.connecting {
		background: #ff9500;
	}

	.wallet-connected {
		display: flex;
		align-items: center;
		gap: 12px;
		background: #0a0a0a;
		border: 1px solid #333;
		border-radius: 4px;
		padding: 8px 12px;
	}

	.wallet-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.wallet-address {
		color: #ff9500;
		font-family: 'Courier New', monospace;
		font-size: 12px;
		font-weight: bold;
	}

	.wallet-name {
		color: #666;
		font-family: 'Courier New', monospace;
		font-size: 10px;
	}

	.disconnect-button {
		background: #333;
		color: #ff9500;
		border: 1px solid #555;
		padding: 4px 8px;
		font-family: 'Courier New', monospace;
		font-size: 10px;
		cursor: pointer;
		border-radius: 3px;
		transition: all 0.2s ease;
	}

	.disconnect-button:hover {
		background: #555;
		border-color: #ff9500;
	}

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid #000;
		border-top: 2px solid transparent;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}
</style>