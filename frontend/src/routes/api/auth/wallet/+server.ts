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

		console.log('[POST /api/auth/wallet] Authenticating wallet:', walletAddress);

		if (!walletAddress || !signature || !message) {
			console.error('[POST /api/auth/wallet] Missing required fields');
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// TODO: Verify the signature (for now, we'll trust the client)
		// In production, you should verify the signature server-side
		// using @solana/web3.js to ensure the user owns the wallet

		const db = event.platform?.env?.DB as D1Database | undefined;

		let user;
		if (db) {
			// Production (Cloudflare): persist user in D1
			user = await upsertWalletUser(db, walletAddress);
		} else {
			// Local dev: no database — create a session user in memory so wallet connect works
			const displayName = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
			user = {
				id: 0,
				solanaAddress: walletAddress,
				email: null as string | null,
				name: displayName,
				picture: null as string | null
			};
		}

		console.log('[POST /api/auth/wallet] User created/updated:', user.id, user.solanaAddress);

		// Set session cookie
		setSessionCookie(event, user);

		console.log('[POST /api/auth/wallet] Session cookie set successfully');

		return json({ success: true, user });
	} catch (error: any) {
		console.error('[POST /api/auth/wallet] Wallet auth error:', error);
		return json({ error: error.message || 'Authentication failed' }, { status: 500 });
	}
};
