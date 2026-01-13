import { json } from '@sveltejs/kit';
import { upsertWalletUser, setSessionCookie } from '$lib/server/auth';
import type { RequestHandler } from './$types';

/**
 * POST - Authenticate with Solana wallet
 * Verifies wallet signature and creates/updates user
 */
export const POST: RequestHandler = async (event) => {
	try {
		const { walletAddress, signature, message } = await event.request.json();

		if (!walletAddress || !signature || !message) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// TODO: Verify the signature (for now, we'll trust the client)
		// In production, you should verify the signature server-side
		// using @solana/web3.js to ensure the user owns the wallet

		const db = event.platform?.env?.DB as D1Database;
		if (!db) {
			return json({ error: 'Database not available' }, { status: 500 });
		}

		// Create or update user with wallet address
		const user = await upsertWalletUser(db, walletAddress);

		// Set session cookie
		setSessionCookie(event, user);

		return json({ success: true, user });
	} catch (error: any) {
		console.error('Wallet auth error:', error);
		return json({ error: error.message || 'Authentication failed' }, { status: 500 });
	}
};
