<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { Adapter } from '@solana/wallet-adapter-base';

	export let show = false;
	export let wallets: Adapter[] = [];
	export let connecting = false;

	const dispatch = createEventDispatcher();

	function selectWallet(wallet: Adapter) {
		dispatch('select', wallet.name);
	}

	function closeModal() {
		show = false;
		dispatch('close');
	}

	// Close modal on escape key
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeModal();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
	<!-- Modal backdrop -->
	<div class="modal-backdrop" on:click={closeModal}>
		<!-- Modal content -->
		<div class="modal-content" on:click|stopPropagation>
			<div class="modal-header">
				<h3>Connect Wallet</h3>
				<button class="close-button" on:click={closeModal}>×</button>
			</div>
			
			<div class="modal-body">
				{#if connecting}
					<div class="connecting-state">
						<div class="spinner"></div>
						<p>Connecting to wallet...</p>
					</div>
				{:else}
					<div class="wallet-list">
						{#each wallets as wallet}
							<button 
								class="wallet-button"
								on:click={() => selectWallet(wallet)}
								disabled={connecting}
							>
								<div class="wallet-info">
									<div class="wallet-icon">
										{#if wallet.name === 'Phantom'}
											<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
												<path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm5.5 17.5c-1.4 1.4-3.6 1.4-5 0L12 17l-0.5 0.5c-1.4 1.4-3.6 1.4-5 0s-1.4-3.6 0-5L12 7l5.5 5.5c1.4 1.4 1.4 3.6 0 5z"/>
											</svg>
										{:else if wallet.name === 'Solflare'}
											<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
												<path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm0 2c5.5 0 10 4.5 10 10s-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2z"/>
											</svg>
										{:else}
											<div class="wallet-icon-placeholder">{wallet.name.charAt(0)}</div>
										{/if}
									</div>
									<span class="wallet-name">{wallet.name}</span>
								</div>
								{#if wallet.readyState === 'Installed'}
									<span class="status-installed">Detected</span>
								{:else}
									<span class="status-not-installed">Not Installed</span>
								{/if}
							</button>
						{/each}
					</div>
					
					<div class="modal-footer">
						<p class="disclaimer">
							By connecting your wallet, you agree to the <a href="/terms" target="_blank">Terms of Service</a> and acknowledge you have read and understand the protocol risks.
						</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
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
		backdrop-filter: blur(4px);
	}

	.modal-content {
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 8px;
		width: 90%;
		max-width: 400px;
		max-height: 80vh;
		overflow: hidden;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid #333;
		background: #222;
	}

	.modal-header h3 {
		margin: 0;
		color: #ff9500;
		font-size: 18px;
		font-weight: bold;
		font-family: 'Courier New', monospace;
	}

	.close-button {
		background: none;
		border: none;
		color: #666;
		font-size: 24px;
		cursor: pointer;
		padding: 0;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.2s;
	}

	.close-button:hover {
		color: #ff9500;
	}

	.modal-body {
		padding: 20px;
	}

	.connecting-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 40px 20px;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid #333;
		border-top: 3px solid #ff9500;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.connecting-state p {
		margin: 0;
		color: #ff9500;
		font-family: 'Courier New', monospace;
	}

	.wallet-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.wallet-button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 16px;
		background: #000;
		border: 1px solid #333;
		border-radius: 6px;
		color: #fff;
		font-family: 'Courier New', monospace;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.wallet-button:hover {
		border-color: #ff9500;
		background: #0a0a0a;
		transform: translateY(-1px);
	}

	.wallet-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.wallet-info {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.wallet-icon {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #ff9500;
	}

	.wallet-icon svg {
		width: 24px;
		height: 24px;
	}

	.wallet-icon-placeholder {
		width: 24px;
		height: 24px;
		background: #ff9500;
		color: #000;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: bold;
		font-size: 12px;
	}

	.wallet-name {
		font-size: 14px;
		font-weight: bold;
	}

	.status-installed {
		font-size: 10px;
		color: #00ff00;
		background: #002200;
		padding: 4px 8px;
		border-radius: 4px;
		border: 1px solid #00ff00;
	}

	.status-not-installed {
		font-size: 10px;
		color: #ff6600;
		background: #221100;
		padding: 4px 8px;
		border-radius: 4px;
		border: 1px solid #ff6600;
	}

	.modal-footer {
		margin-top: 20px;
		padding-top: 16px;
		border-top: 1px solid #333;
	}

	.disclaimer {
		font-size: 11px;
		color: #666;
		line-height: 1.4;
		margin: 0;
		text-align: center;
	}

	.disclaimer a {
		color: #ff9500;
		text-decoration: none;
	}

	.disclaimer a:hover {
		text-decoration: underline;
	}
</style>