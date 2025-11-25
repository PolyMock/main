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
				'User-Agent': 'PolyPaper/1.0'
			}
		});

		if (!marketResponse.ok) {
			// Fallback: try to find market in markets list
			const marketsListResponse = await fetch(`${GAMMA_API_BASE}/markets?limit=100&active=true`, {
				headers: {
					'Accept': 'application/json',
					'User-Agent': 'PolyPaper/1.0'
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
	
	// Get current prices from CLOB API if we have token IDs
	if (market.clobTokenIds && market.clobTokenIds.length >= 2) {
		try {
			// Fetch current prices for both outcome tokens
			const yesTokenId = market.clobTokenIds[0];
			const noTokenId = market.clobTokenIds[1];
			
			const [yesPrice, noPrice] = await Promise.allSettled([
				fetchTokenPrice(yesTokenId),
				fetchTokenPrice(noTokenId)
			]);
			
			market.yesPrice = yesPrice.status === 'fulfilled' ? yesPrice.value : 0.5;
			market.noPrice = noPrice.status === 'fulfilled' ? noPrice.value : 0.5;
			
			console.log('Fetched prices from CLOB:', { yes: market.yesPrice, no: market.noPrice });
		} catch (error) {
			console.error('Error fetching prices from CLOB:', error);
		}
	} else if (market.outcomePrices && market.outcomePrices.length >= 2) {
		console.log('Using outcomePrices:', market.outcomePrices);
		market.yesPrice = parseFloat(market.outcomePrices[0]) || 0.5;
		market.noPrice = parseFloat(market.outcomePrices[1]) || 0.5;
	} else {
		console.log('No prices found');
	}

	console.log('Final enriched prices:', { yes: market.yesPrice, no: market.noPrice });
	return market;
}

async function fetchTokenPrice(tokenId: string): Promise<number> {
	try {
		// Fetch current midpoint price from CLOB API
		const response = await fetch(`${CLOB_API_BASE}/midpoint?token_id=${tokenId}`, {
			headers: {
				'Accept': 'application/json',
				'User-Agent': 'PolyPaper/1.0'
			}
		});
		
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		
		const data = await response.json();
		return parseFloat(data.mid) || 0.5;
	} catch (error) {
		console.error('Error fetching token price:', tokenId, error);
		return 0.5; // Default fallback
	}
}