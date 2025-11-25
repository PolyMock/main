import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const POLYMARKET_API_BASE = 'https://gamma-api.polymarket.com';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const { id } = params;
		
		if (!id) {
			return json({ error: 'Market ID is required' }, { status: 400 });
		}

		// Fetch single market data by ID
		const response = await fetch(`${POLYMARKET_API_BASE}/markets?id=${id}`, {
			headers: {
				'Accept': 'application/json',
				'User-Agent': 'PolyPaper/1.0'
			}
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();
		
		// Polymarket returns an array, we want the first (and should be only) market
		const market = Array.isArray(data) ? data[0] : data;
		
		if (!market) {
			return json({ error: 'Market not found' }, { status: 404 });
		}

		// Process the market data to extract YES/NO prices
		const processedMarket = processMarketTokens(market);

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

function processMarketTokens(market: any): any {
	// Extract Yes/No prices from tokens or outcomePrices
	if (market.tokens && market.tokens.length >= 2) {
		// Look for Yes/No tokens
		const yesToken = market.tokens.find((token: any) => 
			token.outcome?.toLowerCase().includes('yes') || 
			token.outcome?.toLowerCase() === 'true' ||
			token.outcome === '1'
		);
		const noToken = market.tokens.find((token: any) => 
			token.outcome?.toLowerCase().includes('no') || 
			token.outcome?.toLowerCase() === 'false' ||
			token.outcome === '0'
		);

		market.yesPrice = yesToken?.price || 0;
		market.noPrice = noToken?.price || 0;
	} else if (market.outcomePrices && market.outcomePrices.length >= 2) {
		// Parse from outcomePrices array
		market.yesPrice = parseFloat(market.outcomePrices[0]) || 0;
		market.noPrice = parseFloat(market.outcomePrices[1]) || 0;
	} else {
		// Fallback - assume binary market with complementary prices
		const price = market.last_trade_price || 0.5;
		market.yesPrice = price;
		market.noPrice = 1 - price;
	}

	return market;
}