import { json } from '@sveltejs/kit';
import { SYNTHESIS_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

const SYNTHESIS_BASE = 'https://synthesis.trade/api/v1';

// POST /api/orderbook  body: { tokenIds: string[] }
// Returns Synthesis orderbook data for up to 2 token IDs (YES + NO side)
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { tokenIds } = await request.json();
		if (!Array.isArray(tokenIds) || tokenIds.length === 0) {
			return json({ error: 'tokenIds array required' }, { status: 400 });
		}

		// Synthesis requires a plain JSON array as body
		const resp = await fetch(`${SYNTHESIS_BASE}/markets/orderbooks`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-PROJECT-API-KEY': SYNTHESIS_API_KEY,
			},
			body: JSON.stringify(tokenIds),
		});

		if (!resp.ok) {
			throw new Error(`Synthesis ${resp.status}`);
		}

		const data = await resp.json();
		return json(data);
	} catch (err) {
		console.error('[orderbook] error:', err);
		return json({ error: 'Failed to fetch orderbook' }, { status: 500 });
	}
};
