<script lang="ts">
	import { onMount } from 'svelte';
	import { walletStore } from '$lib/wallet/stores';
	import { get } from 'svelte/store';

	let walletAddress = '';
	let isConnected = false;
	let user: any = null;
	let authResult = '';
	let loading = false;

	onMount(() => {
		const unsubscribe = walletStore.subscribe(state => {
			isConnected = state.connected;
			walletAddress = state.publicKey?.toBase58() || '';
		});

		return unsubscribe;
	});

	async function authenticateWithWallet() {
		loading = true;
		authResult = '';

		try {
			const wallet = get(walletStore);

			if (!wallet.adapter || !wallet.publicKey) {
				authResult = 'Error: Wallet not connected';
				loading = false;
				return;
			}

			// Check if adapter supports signing
			if (typeof wallet.adapter.signMessage !== 'function') {
				authResult = 'Error: Wallet does not support message signing';
				loading = false;
				return;
			}

			const publicKey = wallet.publicKey.toBase58();

			// Create message to sign
			const message = `Sign this message to authenticate with Polymock.\n\nWallet: ${publicKey}\nTimestamp: ${Date.now()}`;
			const messageBytes = new TextEncoder().encode(message);

			// Request signature from wallet adapter
			authResult = 'Requesting signature from wallet...';
			const signature = await wallet.adapter.signMessage(messageBytes);

			// Send to backend
			authResult = 'Sending to backend...';
			const response = await fetch('/api/auth/wallet', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					walletAddress: publicKey,
					signature: Array.from(signature),
					message: message
				})
			});

			const data = await response.json();

			if (response.ok && data.success) {
				user = data.user;
				authResult = '✅ SUCCESS! User authenticated and saved to database!';
			} else {
				authResult = `❌ Error: ${data.error || 'Authentication failed'}`;
			}
		} catch (error: any) {
			authResult = `❌ Error: ${error.message || 'Unknown error'}`;
		} finally {
			loading = false;
		}
	}

	async function checkCurrentUser() {
		try {
			const response = await fetch('/api/auth/user');
			const data = await response.json();
			user = data.user;
			authResult = user ? '✅ User is authenticated!' : '⚠️ No user session found';
		} catch (error: any) {
			authResult = `❌ Error: ${error.message}`;
		}
	}

	async function logout() {
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
			user = null;
			authResult = '✅ Logged out successfully';
		} catch (error: any) {
			authResult = `❌ Error: ${error.message}`;
		}
	}
</script>

<div class="test-page">
	<h1>🧪 Wallet Authentication Test</h1>

	<div class="section">
		<h2>1. Wallet Status</h2>
		<div class="status">
			{#if isConnected}
				<p>✅ Wallet Connected</p>
				<p><strong>Address:</strong> {walletAddress}</p>
			{:else}
				<p>❌ Wallet Not Connected</p>
				<p>Please connect your wallet using the wallet button in the navbar</p>
			{/if}
		</div>
	</div>

	<div class="section">
		<h2>2. Test Authentication</h2>
		<div class="buttons">
			<button on:click={authenticateWithWallet} disabled={!isConnected || loading}>
				{loading ? 'Processing...' : 'Sign Message & Authenticate'}
			</button>
			<button on:click={checkCurrentUser}>Check Current User</button>
			<button on:click={logout}>Logout</button>
		</div>
	</div>

	{#if authResult}
		<div class="section">
			<h2>Result:</h2>
			<pre>{authResult}</pre>
		</div>
	{/if}

	{#if user}
		<div class="section">
			<h2>3. User Info:</h2>
			<pre>{JSON.stringify(user, null, 2)}</pre>
		</div>
	{/if}

	<div class="section">
		<h2>4. Next Steps</h2>
		<ol>
			<li>Connect your wallet using the navbar</li>
			<li>Click "Sign Message & Authenticate"</li>
			<li>Approve the signature in your wallet</li>
			<li>Check the database with: <code>wrangler d1 execute polymock-db --remote --command="SELECT * FROM users;"</code></li>
		</ol>
	</div>
</div>

<style>
	.test-page {
		max-width: 800px;
		margin: 40px auto;
		padding: 20px;
		background: #0a0e1a;
		color: white;
		min-height: 100vh;
	}

	h1 {
		color: #3b82f6;
		margin-bottom: 32px;
	}

	.section {
		background: #141824;
		border: 1px solid #1e2537;
		border-radius: 12px;
		padding: 24px;
		margin-bottom: 24px;
	}

	h2 {
		color: #8b92ab;
		font-size: 18px;
		margin: 0 0 16px 0;
	}

	.status p {
		margin: 8px 0;
		color: #d1d5db;
	}

	.buttons {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}

	button {
		padding: 12px 24px;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	button:hover:not(:disabled) {
		background: #2563eb;
		transform: translateY(-2px);
	}

	button:disabled {
		background: #374151;
		cursor: not-allowed;
		opacity: 0.5;
	}

	pre {
		background: #0a0e1a;
		padding: 16px;
		border-radius: 8px;
		overflow-x: auto;
		color: #10b981;
		font-size: 14px;
		line-height: 1.6;
	}

	code {
		background: #1e2537;
		padding: 2px 8px;
		border-radius: 4px;
		color: #3b82f6;
		font-size: 13px;
	}

	ol {
		color: #8b92ab;
		line-height: 2;
	}

	ol li {
		margin-bottom: 8px;
	}
</style>
