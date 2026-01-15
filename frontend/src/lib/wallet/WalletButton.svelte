<script lang="ts">
	import { onMount } from 'svelte';
	import { walletStore, setWalletAdapter, setWalletConnecting, setWalletDisconnecting, updateWalletConnection, initializeUserAccountIfNeeded } from './stores';
	import {
		PhantomWalletAdapter,
		SolflareWalletAdapter
	} from '@solana/wallet-adapter-wallets';
	import type { Adapter } from '@solana/wallet-adapter-base';

	// Declare window types for wallet extensions
	declare global {
		interface Window {
			phantom?: {
				solana?: any;
			};
			solana?: any;
		}
	}

	export let isDropdownMode = false;
	export let onClose: (() => void) | undefined = undefined;

	let walletState = $walletStore;
	let showWalletModal = false;
	let availableWallets: Adapter[] = [];

	walletStore.subscribe(value => {
		walletState = value;
	});

	onMount(() => {
		// Wait a bit for wallet extensions to load
		const initWallets = () => {
			try {
				// Check if Phantom is available
				const isPhantomAvailable = typeof window !== 'undefined' &&
					(window.phantom?.solana?.isPhantom || window.solana?.isPhantom);

				console.log('Phantom wallet available:', isPhantomAvailable);
				console.log('window.phantom:', window.phantom);
				console.log('window.solana:', window.solana);

				availableWallets = [
					new PhantomWalletAdapter(),
					new SolflareWalletAdapter()
				];

				console.log('Wallets initialized:', availableWallets.map(w => ({
					name: w.name,
					readyState: w.readyState
				})));
			} catch (error) {
				console.error('Error initializing wallets:', error);
				availableWallets = [];
			}
		};

		// Try immediately, then retry after a short delay if needed
		initWallets();

		// Retry after a short delay to catch wallets that load asynchronously
		setTimeout(() => {
			if (availableWallets.length === 0 || availableWallets.every(w => w.readyState === 'NotDetected')) {
				console.log('Retrying wallet initialization...');
				initWallets();
			}
		}, 500);
	});

	async function selectWallet(wallet: Adapter) {
		try {
			console.log('Attempting to connect wallet:', wallet.name, 'Ready state:', wallet.readyState);

			setWalletConnecting(true);
			showWalletModal = false;
			if (onClose) onClose();

			// Ensure wallet is ready before connecting
			if (wallet.readyState === 'NotDetected') {
				throw new Error(`${wallet.name} is not installed. Please install the wallet extension first.`);
			}

			if (wallet.readyState !== 'Installed' && wallet.readyState !== 'Loadable') {
				throw new Error(`Wallet is not ready. Status: ${wallet.readyState}`);
			}

			// For Phantom, try connecting directly to window.phantom.solana as a workaround
			if (wallet.name === 'Phantom' && typeof window !== 'undefined') {
				const provider = window.phantom?.solana || window.solana;
				if (provider && provider.isPhantom) {
					console.log('Using direct Phantom provider connection');
					console.log('Provider state:', {
						isConnected: provider.isConnected,
						publicKey: provider.publicKey?.toString()
					});

					try {
						// Try different connection methods
						let publicKey = provider.publicKey;

						if (!provider.isConnected || !publicKey) {
							console.log('Attempting Phantom connection...');

							// Try the standard connect method first
							try {
								// Just call connect without any options
								const resp = await provider.connect();
								publicKey = resp.publicKey;
								console.log('Phantom connected successfully:', resp);
							} catch (connectErr: any) {
								console.error('Standard connect failed, trying request method:', connectErr);

								// Try using the request method directly as a fallback
								try {
									const resp = await provider.request({ method: 'connect' });
									publicKey = resp.publicKey || provider.publicKey;
									console.log('Connected via request method:', resp);
								} catch (requestErr) {
									console.error('Request method also failed:', requestErr);
									throw connectErr; // Throw original error
								}
							}
						} else {
							console.log('Phantom already connected');
						}

						if (!publicKey) {
							throw new Error('Failed to get public key from Phantom');
						}

						// Create a wrapper that mimics the adapter interface
						const directWallet = {
							publicKey: publicKey,
							signTransaction: provider.signTransaction.bind(provider),
							signAllTransactions: provider.signAllTransactions.bind(provider),
							signMessage: provider.signMessage?.bind(provider),
							connected: true,
							disconnect: async () => {
								await provider.disconnect();
								setWalletAdapter(null);
								updateWalletConnection();
							},
							name: 'Phantom'
						};

						setWalletAdapter(directWallet as any);
						updateWalletConnection();

						// Initialize user account
						try {
							await initializeUserAccountIfNeeded(directWallet);
						} catch (initError) {
							console.error('Failed to initialize user account:', initError);
							alert('Wallet connected but failed to initialize on-chain account. You can try again later.');
						}

						setWalletConnecting(false);
						return;
					} catch (directError: any) {
						console.error('Direct Phantom connection failed:', directError);
						console.error('Error details:', directError?.message, directError?.code);

						// If it's error -32603, this is likely a Phantom wallet issue
						if (directError?.code === -32603 || directError?.message?.includes('32603')) {
							setWalletConnecting(false);
							setWalletAdapter(null);

							// Provide helpful instructions
							const instructions = `Phantom Wallet Error (Code -32603)

This usually means there's an issue with the Phantom wallet extension. Please try these steps:

1. **Unlock your Phantom wallet** - Make sure it's not locked
2. **Check your network** - Open Phantom and switch to Devnet:
   • Click the gear icon (Settings)
   • Go to "Developer Settings"
   • Enable "Testnet Mode"
   • Switch to "Devnet"
3. **Clear permissions**:
   • Open Phantom settings
   • Go to "Trusted Apps"
   • Remove this site if listed, then try connecting again
4. **Refresh the page** - Sometimes a simple refresh helps
5. **Last resort**: Close all browser tabs, restart your browser, or reinstall Phantom

Would you like to try again?`;

							if (confirm(instructions)) {
								// Reload the page to reset everything
								window.location.reload();
							}
							return;
						}
						// Fall through to use adapter for other errors
					}
				}
			}

			// Set up event listeners before connecting
			wallet.on('connect', async () => {
				console.log('Wallet connected event triggered');
				updateWalletConnection();
				// Initialize user account on blockchain
				try {
					await initializeUserAccountIfNeeded(wallet);
				} catch (initError) {
					console.error('Failed to initialize user account:', initError);
					alert('Wallet connected but failed to initialize on-chain account. You can try again later.');
				}
			});

			wallet.on('disconnect', () => {
				console.log('Wallet disconnected event triggered');
				updateWalletConnection();
			});

			wallet.on('error', (error) => {
				console.error('Wallet error event:', error);
				setWalletConnecting(false);
				setWalletDisconnecting(false);
			});

			// Set adapter before connecting
			setWalletAdapter(wallet);

			// Connect to the wallet with timeout
			console.log('Calling wallet.connect()...');
			const connectTimeout = new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Connection timeout')), 30000)
			);

			await Promise.race([wallet.connect(), connectTimeout]);

			console.log('Wallet connect completed successfully');
			updateWalletConnection();
		} catch (error: any) {
			console.error('Failed to connect wallet:', error);
			console.error('Error type:', error?.constructor?.name);
			console.error('Error message:', error?.message);
			console.error('Error stack:', error?.stack);

			setWalletConnecting(false);
			setWalletAdapter(null);

			// Show user-friendly error message
			let errorMessage = 'Failed to connect wallet: ';
			if (error?.message?.includes('not installed')) {
				errorMessage = error.message;
			} else if (error?.message?.includes('not ready')) {
				errorMessage = 'Wallet is not ready. Please try again.';
			} else if (error?.message?.includes('User rejected') || error?.message?.includes('User denied')) {
				errorMessage = 'Connection request was cancelled';
			} else if (error?.message?.includes('timeout')) {
				errorMessage = 'Connection timed out. Please try again.';
			} else {
				errorMessage += error?.message || 'Unknown error';
			}
			alert(errorMessage);
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

{#if isDropdownMode}
	<!-- Render as dropdown option -->
	<button class="connect-option" on:click={openWalletModal} disabled={walletState.connecting}>
		<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
			<rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/>
			<path d="M14 10h1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
			<path d="M2 8h16" stroke="currentColor" stroke-width="1.5"/>
		</svg>
		<div class="connect-option-text">
			<div class="connect-option-title">
				{walletState.connecting ? 'Connecting...' : 'Wallet'}
			</div>
			<div class="connect-option-subtitle">Connect with Solana wallet</div>
		</div>
	</button>
{:else}
	<!-- Render as standalone button -->
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
{/if}

{#if showWalletModal}
	<div class="wallet-modal-overlay" on:click={closeWalletModal} on:keydown={(e) => e.key === 'Escape' && closeWalletModal()} role="button" tabindex="0">
		<div class="wallet-modal" on:click|stopPropagation on:keydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
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
	/* Dropdown mode styles */
	.connect-option {
		width: 100%;
		padding: 14px 16px;
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all 200ms ease-out;
		display: flex;
		align-items: center;
		gap: 12px;
		text-align: left;
		color: #E8E8E8;
	}

	.connect-option:hover:not(:disabled) {
		background: rgba(0, 208, 132, 0.1);
	}

	.connect-option:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.connect-option svg {
		flex-shrink: 0;
	}

	.connect-option-text {
		flex: 1;
	}

	.connect-option-title {
		font-size: 14px;
		font-weight: 600;
		color: #E8E8E8;
		margin-bottom: 2px;
		font-family: Inter, sans-serif;
	}

	.connect-option-subtitle {
		font-size: 12px;
		color: #8B92AB;
		font-family: Inter, sans-serif;
	}

	/* Standalone button styles */
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