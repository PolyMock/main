import { json } from '@sveltejs/kit';
import { SYNTHESIS_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

const SYNTHESIS_API_BASE = 'https://synthesis.trade/api/v1';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const { id } = params;

		if (!id) {
			return json({ error: 'Market ID is required' }, { status: 400 });
		}

		// Fetch market data from Synthesis API by condition_id
		const marketResponse = await fetch(`${SYNTHESIS_API_BASE}/polymarket/market/${id}`, {
			headers: {
				'Accept': 'application/json',
				'X-PROJECT-API-KEY': SYNTHESIS_API_KEY
			}
		});

		if (!marketResponse.ok) {
			// Fallback: search in markets list by condition_id or polymarket_id
			const marketsListResponse = await fetch(`${SYNTHESIS_API_BASE}/polymarket/markets?limit=200`, {
				headers: {
					'Accept': 'application/json',
					'X-PROJECT-API-KEY': SYNTHESIS_API_KEY
				}
			});

			if (marketsListResponse.ok) {
				const marketsData = await marketsListResponse.json();
				if (marketsData.success && marketsData.response) {
					for (const item of marketsData.response) {
						const found = item.markets?.find((m: any) =>
							m.condition_id === id ||
							String(m.polymarket_id) === id ||
							String(m.id) === id
						);
						if (found) {
							const market = transformMarket(found, item.event);
							return json(market, {
								headers: {
									'Access-Control-Allow-Origin': '*',
									'Access-Control-Allow-Methods': 'GET',
									'Access-Control-Allow-Headers': 'Content-Type'
								}
							});
						}
					}
				}
			}

			return json({ error: 'Market not found' }, { status: 404 });
		}

		const data = await marketResponse.json();

		if (!data.success || !data.response) {
			return json({ error: 'Market not found' }, { status: 404 });
		}

		const market = transformMarket(data.response.market, data.response.event);

		// Enrich with real-time prices from Synthesis
		await enrichMarketWithPrices(market);

		return json(market, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET',
				'Access-Control-Allow-Headers': 'Content-Type'
			}
		});
	} catch (error) {
		console.error('Error fetching market by ID:', error);
		return json(
			{ error: 'Failed to fetch market', details: error instanceof Error ? error.message : 'Unknown error' },
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

function transformMarket(market: any, event?: any): any {
	return {
		id: market.condition_id,
		question: market.question,
		title: market.question,
		description: market.description,
		slug: market.slug,
		image: market.image || event?.image,
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
		tags: event?.tags || [],
		enableOrderBook: true,
		enable_order_book: true,
		yesPrice: parseFloat(market.left_price || '0'),
		noPrice: parseFloat(market.right_price || '0'),
		last_trade_price: parseFloat(market.left_price || '0'),
		winner_token_id: market.winner_token_id,
	};
}

async function enrichMarketWithPrices(market: any): Promise<any> {
	try {
		// If market is closed, use the existing prices
		if (market.closed && market.outcomePrices) {
			const prices = typeof market.outcomePrices === 'string'
				? JSON.parse(market.outcomePrices)
				: market.outcomePrices;

			if (Array.isArray(prices) && prices.length >= 2) {
				market.yesPrice = parseFloat(prices[0]);
				market.noPrice = parseFloat(prices[1]);
				return market;
			}
		}

		// For open markets, fetch current prices from Synthesis
		const tokenIds = market.clobTokenIds;
		if (!Array.isArray(tokenIds) || tokenIds.length < 2) {
			return market;
		}

		const [yesPrice, noPrice] = await Promise.allSettled([
			fetchTokenPrice(tokenIds[0]),
			fetchTokenPrice(tokenIds[1])
		]);

		let yes = yesPrice.status === 'fulfilled' && yesPrice.value !== null ? yesPrice.value : 0;
		let no = noPrice.status === 'fulfilled' && noPrice.value !== null ? noPrice.value : 0;

		if (yes > 0 && no === 0) {
			no = 1 - yes;
		} else if (no > 0 && yes === 0) {
			yes = 1 - no;
		} else if (yes === 0 && no === 0) {
			yes = 0.5;
			no = 0.5;
		}

		market.yesPrice = yes;
		market.noPrice = no;

	} catch (error) {
		console.error('Error enriching market with prices:', error);
		market.yesPrice = 0.5;
		market.noPrice = 0.5;
	}

	return market;
}

async function fetchTokenPrice(tokenId: string): Promise<number | null> {
	try {
		// Use Synthesis batch prices endpoint
		const response = await fetch(`${SYNTHESIS_API_BASE}/markets/prices`, {
			method: 'POST',
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json',
				'X-PROJECT-API-KEY': SYNTHESIS_API_KEY
			},
			body: JSON.stringify({ markets: [tokenId] })
		});

		if (!response.ok) {
			return null;
		}

		const data = await response.json();
		if (data.success && data.response?.prices) {
			const price = data.response.prices[tokenId];
			if (typeof price === 'number') {
				return price;
			}
		}
		return null;
	} catch (error: any) {
		console.error('Error fetching token price:', tokenId, error.message || error);
		return null;
	}
}
