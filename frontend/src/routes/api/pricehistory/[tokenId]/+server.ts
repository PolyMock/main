import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const SYNTHESIS_BASE = 'https://synthesis.trade/api/v1';

// GET /api/pricehistory/[tokenId]?interval=1d
export const GET: RequestHandler = async ({ params, url }) => {
	const { tokenId } = params;
	const rawInterval = url.searchParams.get('interval') || '1d';
	// 'all' → daily candles with no date restriction = full market history
	const interval = rawInterval === 'all' ? '1d' : rawInterval;

	try {
		const resp = await fetch(
			`${SYNTHESIS_BASE}/polymarket/market/${tokenId}/price-history?interval=${interval}&volume=true`,
			{ headers: { Accept: 'application/json' } }
		);

		if (!resp.ok) throw new Error(`Synthesis ${resp.status}`);

		const data = await resp.json();
		return json(data);
	} catch (err) {
		console.error('[pricehistory] error:', err);
		return json({ error: 'Failed to fetch price history' }, { status: 500 });
	}
};
