import { json } from '@sveltejs/kit';
import { SYNTHESIS_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

const SYNTHESIS_API_BASE = 'https://synthesis.trade/api/v1';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const limit = url.searchParams.get('limit') || '5';
		const active = url.searchParams.get('active') || 'true';
		const closed = url.searchParams.get('closed') || 'false';

		// Fetch from Synthesis API - returns events with nested markets
		const response = await fetch(`${SYNTHESIS_API_BASE}/polymarket/markets?limit=${limit}&sort=volume1wk&order=DESC`, {
			headers: {
				'Accept': 'application/json',
				'X-PROJECT-API-KEY': SYNTHESIS_API_KEY
			}
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();

		if (!data.success || !data.response) {
			throw new Error('Invalid response from Synthesis API');
		}

		// Transform Synthesis format to match existing Gamma format
		// Synthesis returns { event, markets[] } objects, we need flat market array
		const markets: any[] = [];
		for (const item of data.response) {
			if (!item.markets) continue;
			for (const market of item.markets) {
				// Filter by active/closed
				if (active === 'true' && !market.active) continue;
				if (closed === 'false' && market.resolved) continue;

				markets.push({
					id: market.condition_id,
					question: market.question,
					title: market.question,
					description: market.description,
					slug: market.slug,
					image: market.image || item.event?.image,
					active: market.active,
					closed: market.resolved,
					volume: parseFloat(market.volume || '0'),
					volume_24hr: parseFloat(market.volume24hr || '0'),
					liquidity: parseFloat(market.liquidity || '0'),
					outcomePrices: [market.left_price, market.right_price],
					clobTokenIds: [market.left_token_id, market.right_token_id],
					outcomes: JSON.stringify([market.left_outcome || 'Yes', market.right_outcome || 'No']),
					end_date_iso: market.ends_at,
					endDate: market.ends_at,
					createdAt: market.created_at,
					conditionId: market.condition_id,
					tags: item.event?.tags || [],
					enableOrderBook: true,
					enable_order_book: true,
					yesPrice: parseFloat(market.left_price || '0'),
					noPrice: parseFloat(market.right_price || '0'),
					last_trade_price: parseFloat(market.left_price || '0'),
					neg_risk: item.event?.neg_risk || false,
				});
			}
		}

		return json(markets, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET',
				'Access-Control-Allow-Headers': 'Content-Type'
			}
		});
	} catch (error) {
		console.error('Error fetching Polymarket markets:', error);
		return json(
			{ error: 'Failed to fetch markets', details: error instanceof Error ? error.message : 'Unknown error' },
			{
				status: 500,
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET',
					'Access-Control-Allow-Headers': 'Content-Type'
				}
			}
		);
	}
};
