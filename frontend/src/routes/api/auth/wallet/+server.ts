import { json } from '@sveltejs/kit';
import { setSessionCookie } from '$lib/server/auth';
import type { RequestHandler } from './$types';

/**
 * POST - Authenticate with Solana wallet
 * TODO: Wire up to Supabase for user upsert
 */
export const POST: RequestHandler = async (event) => {
	try {
		const { walletAddress, signature, message } = await event.request.json();

		if (!walletAddress || !signature || !message) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// TODO: Verify signature server-side with @solana/web3.js
		// TODO: Upsert user in Supabase

		const displayName = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
		const user = {
			id: walletAddress, // use wallet as ID until Supabase is wired
			walletAddress,
			username: displayName,
			email: null,
			picture: null
		};

		setSessionCookie(event, user);

		return json({ success: true, user });
	} catch (err: any) {
		console.error('[POST /api/auth/wallet] Error:', err);
		return json({ error: err.message || 'Authentication failed' }, { status: 500 });
	}
};
