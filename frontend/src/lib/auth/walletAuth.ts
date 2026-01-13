/**
 * Authenticate user with their connected Solana wallet
 */
export async function authenticateWithWallet(walletAddress: string, signMessage: (message: Uint8Array) => Promise<Uint8Array>): Promise<{ success: boolean; user?: any; error?: string }> {
	try {
		// Create a message to sign
		const message = `Sign this message to authenticate with Polymock.\n\nWallet: ${walletAddress}\nTimestamp: ${Date.now()}`;
		const messageBytes = new TextEncoder().encode(message);

		// Request signature from wallet
		const signature = await signMessage(messageBytes);

		// Send to backend for verification
		const response = await fetch('/api/auth/wallet', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				walletAddress,
				signature: Array.from(signature),
				message
			})
		});

		const data = await response.json();

		if (!response.ok) {
			return { success: false, error: data.error || 'Authentication failed' };
		}

		return { success: true, user: data.user };
	} catch (error: any) {
		console.error('Wallet authentication error:', error);
		return { success: false, error: error.message || 'Failed to authenticate' };
	}
}

/**
 * Check if user is authenticated (either via Google or Wallet)
 */
export async function getCurrentUser(): Promise<any | null> {
	try {
		const response = await fetch('/api/auth/user');
		const data = await response.json();
		return data.user || null;
	} catch (error) {
		console.error('Error fetching current user:', error);
		return null;
	}
}
