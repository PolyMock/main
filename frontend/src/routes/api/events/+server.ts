import { json } from '@sveltejs/kit';
import { SYNTHESIS_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

const SYNTHESIS_API_BASE = 'https://synthesis.trade/api/v1';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const limit = url.searchParams.get('limit') || '10';
		const active = url.searchParams.get('active') || 'true';
		const closed = url.searchParams.get('closed') || 'false';
		const offset = url.searchParams.get('offset') || '0';

		// Fetch events from Synthesis API
		const response = await fetch(
			`${SYNTHESIS_API_BASE}/polymarket/markets?limit=${limit}&offset=${offset}&sort=volume1wk&order=DESC`,
			{
				headers: {
					'Accept': 'application/json',
					'X-PROJECT-API-KEY': SYNTHESIS_API_KEY
				}
			}
		);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();

		if (!data.success || !data.response) {
			throw new Error('Invalid response from Synthesis API');
		}

		// Transform Synthesis format to match existing Gamma event format
		const events = data.response
			.filter((item: any) => {
				if (!item.event) return false;
				if (active === 'true' && !item.event.active) return false;
				return true;
			})
			.map((item: any) => {
				const event = item.event;
				const markets = (item.markets || []).map((market: any) => ({
					id: market.condition_id,
					question: market.question,
					title: market.question,
					description: market.description,
					slug: market.slug,
					image: market.image || event.image,
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
					tags: event.tags || [],
					enableOrderBook: true,
					enable_order_book: true,
					yesPrice: parseFloat(market.left_price || '0'),
					noPrice: parseFloat(market.right_price || '0'),
					last_trade_price: parseFloat(market.left_price || '0'),
				}));

				return {
					id: String(event.event_id),
					slug: event.slug,
					title: event.title,
					description: event.description,
					image: event.image,
					active: event.active,
					closed: event.live?.ended || false,
					archived: false,
					liquidity: parseFloat(event.liquidity || '0'),
					volume: parseFloat(event.volume || '0'),
					startDate: event.created_at,
					endDate: event.ends_at,
					createdAt: event.created_at,
					updatedAt: event.updated_at,
					categories: event.labels || [],
					tags: event.tags || [],
					markets,
				};
			});

		return json(events, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET',
				'Access-Control-Allow-Headers': 'Content-Type'
			}
		});
	} catch (error) {
		console.error('Error fetching Polymarket events:', error);
		return json(
			{ error: 'Failed to fetch events', details: error instanceof Error ? error.message : 'Unknown error' },
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
