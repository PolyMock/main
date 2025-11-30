import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';
const CLOB_API_BASE = 'https://clob.polymarket.com';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const { id } = params;
		
		if (!id) {
			return json({ error: 'Market ID is required' }, { status: 400 });
		}

		// Fetch market data from Gamma API
		const marketResponse = await fetch(`${GAMMA_API_BASE}/markets/${id}`, {
			headers: {
				'Accept': 'application/json',
				'User-Agent': 'PolyMock/1.0'
			}
		});

		if (!marketResponse.ok) {
			// Fallback: try to find market in markets list
			const marketsListResponse = await fetch(`${GAMMA_API_BASE}/markets?limit=100&active=true`, {
				headers: {
					'Accept': 'application/json',
					'User-Agent': 'PolyMock/1.0'
				}
			});

			if (marketsListResponse.ok) {
				const marketsData = await marketsListResponse.json();
				const markets = Array.isArray(marketsData) ? marketsData : [];
				const market = markets.find((m: any) => m.id === id);
				
				if (market) {
					// Get current prices from CLOB API
					const processedMarket = await enrichMarketWithPrices(market);
					return json(processedMarket, {
						headers: {
							'Access-Control-Allow-Origin': '*',
							'Access-Control-Allow-Methods': 'GET',
							'Access-Control-Allow-Headers': 'Content-Type'
						}
					});
				}
			}
			
			return json({ error: 'Market not found' }, { status: 404 });
		}

		const market = await marketResponse.json();
		
		// Get current prices from CLOB API
		const processedMarket = await enrichMarketWithPrices(market);

		return json(processedMarket, {
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

async function enrichMarketWithPrices(market: any): Promise<any> {
	console.log('Enriching market with prices:', market.id);

	try {
		// Parse clobTokenIds
		const tokenIds = market.clobTokenIds
			? (typeof market.clobTokenIds === 'string' ? JSON.parse(market.clobTokenIds) : market.clobTokenIds)
			: [];

		if (!Array.isArray(tokenIds) || tokenIds.length < 2) {
			console.log('No token IDs available');
			return market;
		}

		// Binary market - fetch YES/NO prices
		const [yesPrice, noPrice] = await Promise.allSettled([
			fetchTokenPrice(tokenIds[0]),
			fetchTokenPrice(tokenIds[1])
		]);

		let yes = yesPrice.status === 'fulfilled' && yesPrice.value !== null ? yesPrice.value : 0;
		let no = noPrice.status === 'fulfilled' && noPrice.value !== null ? noPrice.value : 0;

		// Calculate inverse when one price is 0
		if (yes > 0 && no === 0) {
			no = 1 - yes;
		} else if (no > 0 && yes === 0) {
			yes = 1 - no;
		} else if (yes === 0 && no === 0) {
			// Both are 0, set to 50/50
			yes = 0.5;
			no = 0.5;
		}

		market.yesPrice = yes;
		market.noPrice = no;

		console.log('Binary market prices:', { yes: market.yesPrice, no: market.noPrice });
	} catch (error) {
		console.error('Error enriching market with prices:', error);
		// Fallback
		market.yesPrice = 0.5;
		market.noPrice = 0.5;
	}

	return market;
}

async function fetchTokenPrice(tokenId: string): Promise<number | null> {
	try {
		// Fetch current price from CLOB API using the /price endpoint with side=buy
		const response = await fetch(`${CLOB_API_BASE}/price?token_id=${tokenId}&side=buy`, {
			headers: {
				'Accept': 'application/json',
				'User-Agent': 'PolyMock/1.0'
			}
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			// Return null for markets without orderbooks (common for inactive markets)
			if (errorData.error?.includes('No orderbook')) {
				return null;
			}
			throw new Error(`HTTP ${response.status}`);
		}

		const data = await response.json();
		if (data.price) {
			return parseFloat(data.price);
		}
		return null;
	} catch (error: any) {
		console.error('Error fetching token price:', tokenId, error.message || error);
		return null;
	}
}