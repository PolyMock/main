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

				availableWallets = [
					new PhantomWalletAdapter(),
					new SolflareWalletAdapter()
				];
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
								await updateWalletConnection();
							},
							name: 'Phantom'
						};

						setWalletAdapter(directWallet as any);
						await updateWalletConnection();

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
				<h3>Connect a wallet</h3>
				<button class="close-btn" on:click={closeWalletModal}>
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
						<path d="M1 1L13 13M1 13L13 1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
					</svg>
				</button>
			</div>

			<p class="wallet-modal-description">
				Connect your Solana wallet to get started
			</p>

			<div class="wallet-list">
				{#each availableWallets as wallet}
					<button
						class="wallet-option"
						on:click={() => selectWallet(wallet)}
						disabled={wallet.readyState === 'NotDetected'}
					>
						<div class="wallet-option-left">
							<span class="wallet-name">{wallet.name}</span>
						</div>

						<div class="wallet-option-right">
							{#if wallet.readyState === 'Installed'}
								<span class="wallet-status-badge detected">Detected</span>
							{:else if wallet.readyState === 'NotDetected'}
								<span class="wallet-status-badge not-detected">Not Installed</span>
							{:else}
								<span class="wallet-status-badge">{wallet.readyState}</span>
							{/if}
						</div>
					</button>
				{/each}
			</div>

			<div class="wallet-modal-footer">
				<p class="wallet-modal-help">
					Don't have a wallet?
					<a href="https://phantom.app/" target="_blank" rel="noopener noreferrer">Get Phantom</a>
				</p>
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
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.2s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.wallet-modal {
		background: #1a1f35;
		border: 1px solid #2a2f45;
		border-radius: 16px;
		padding: 0;
		min-width: 420px;
		max-width: 480px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		animation: slideUp 0.3s ease-out;
		max-height: 85vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.wallet-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 24px 28px;
		border-bottom: 1px solid #2a2f45;
	}

	.wallet-modal-header h3 {
		color: white;
		font-size: 20px;
		font-weight: 600;
		margin: 0;
		letter-spacing: -0.5px;
	}

	.close-btn {
		background: transparent;
		border: none;
		color: #8b92ab;
		cursor: pointer;
		padding: 8px;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		transition: all 0.2s;
	}

	.close-btn:hover {
		color: white;
		background: rgba(255, 255, 255, 0.05);
	}

	.wallet-modal-description {
		color: #8b92ab;
		font-size: 14px;
		margin: 0;
		padding: 0 28px 20px 28px;
		line-height: 1.5;
	}

	.wallet-list {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 0 16px 16px 16px;
		overflow-y: auto;
		flex: 1;
	}

	.wallet-option {
		background: transparent;
		border: 1px solid #2a2f45;
		border-radius: 12px;
		color: #fff;
		padding: 16px 20px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		transition: all 0.2s ease;
		margin-bottom: 8px;
	}

	.wallet-option:hover:not(:disabled) {
		border-color: #3b82f6;
		background: rgba(59, 130, 246, 0.05);
	}

	.wallet-option:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.wallet-option-left {
		display: flex;
		align-items: center;
	}

	.wallet-name {
		font-size: 15px;
		font-weight: bold;
	}

	.wallet-status {
		font-size: 10px;
		color: #666;
	}

	.wallet-option-right {
		display: flex;
		align-items: center;
	}

	.wallet-status-badge {
		font-size: 12px;
		padding: 4px 10px;
		border-radius: 6px;
		font-weight: 600;
		background: rgba(139, 146, 171, 0.1);
		color: #8b92ab;
	}

	.wallet-status-badge.detected {
		background: rgba(16, 185, 129, 0.1);
		color: #10b981;
	}

	.wallet-status-badge.not-detected {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
	}

	.wallet-modal-footer {
		padding: 16px 28px 24px 28px;
		border-top: 1px solid #2a2f45;
	}

	.wallet-modal-help {
		margin: 0;
		font-size: 13px;
		color: #8b92ab;
		text-align: center;
		line-height: 1.5;
	}

	.wallet-modal-help a {
		color: #3b82f6;
		text-decoration: none;
		font-weight: 600;
		transition: color 0.2s;
	}

	.wallet-modal-help a:hover {
		color: #2563eb;
		text-decoration: underline;
	}

	@media (max-width: 500px) {
		.wallet-modal {
			min-width: 90vw;
			max-width: 90vw;
		}
	}
</style>