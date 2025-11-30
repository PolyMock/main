import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';
const CLOB_API_BASE = 'https://clob.polymarket.com';

export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const { id } = params;
		const interval = url.searchParams.get('interval') || '1d';
		
		if (!id) {
			return json({ error: 'Market ID is required' }, { status: 400 });
		}

		// First, get the market to find token IDs
		const market = await getMarketById(id);
		if (!market) {
			return json({ error: 'Market not found' }, { status: 404 });
		}

		// Try to get historical data from various sources
		let chartData = await fetchHistoricalPriceData(market, interval);
		
		// If no real data available, return empty array
		if (!chartData || chartData.length === 0) {
			console.log('No historical price data available for market:', id);
			chartData = [];
		}

		return json({ history: chartData }, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET',
				'Access-Control-Allow-Headers': 'Content-Type'
			}
		});
	} catch (error) {
		console.error('Error fetching chart data:', error);
		return json(
			{ error: 'Failed to fetch chart data', details: error instanceof Error ? error.message : 'Unknown error' },
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

async function getMarketById(marketId: string): Promise<any | null> {
	try {
		// Try to get specific market
		const response = await fetch(`${GAMMA_API_BASE}/markets/${marketId}`, {
			headers: {
				'Accept': 'application/json',
				'User-Agent': 'PolyMock/1.0'
			}
		});

		if (response.ok) {
			return await response.json();
		}

		// Fallback: search in markets list
		const listResponse = await fetch(`${GAMMA_API_BASE}/markets?limit=100&active=true`, {
			headers: {
				'Accept': 'application/json',
				'User-Agent': 'PolyMock/1.0'
			}
		});

		if (listResponse.ok) {
			const markets = await listResponse.json();
			const marketArray = Array.isArray(markets) ? markets : [];
			return marketArray.find((m: any) => m.id === marketId) || null;
		}

		return null;
	} catch (error) {
		console.error('Error fetching market:', error);
		return null;
	}
}

async function fetchHistoricalPriceData(market: any, interval: string): Promise<any[]> {
	try {
		console.log('Fetching historical price data for market:', market.id);
		
		// Try to fetch historical price data from Polymarket APIs
		const endpoints = [
			// Try CLOB API for price data
			`${CLOB_API_BASE}/prices-history?market=${market.id}&interval=${interval}`,
			// Try Gamma API for market prices
			`${GAMMA_API_BASE}/markets/${market.id}/prices?interval=${interval}`,
			// Try direct market endpoint
			`${GAMMA_API_BASE}/markets/${market.id}`
		];
		
		for (const endpoint of endpoints) {
			try {
				console.log('Trying endpoint:', endpoint);
				const response = await fetch(endpoint, {
					headers: {
						'Accept': 'application/json',
						'User-Agent': 'PolyMock/1.0'
					}
				});

				if (response.ok) {
					const data = await response.json();
					console.log('Response data keys:', Object.keys(data));
					
					// Transform the data based on response structure
					if (Array.isArray(data)) {
						console.log('Got array data with', data.length, 'items');
						return transformPriceData(data, interval);
					} else if (data.prices && Array.isArray(data.prices)) {
						console.log('Got prices array with', data.prices.length, 'items');
						return transformPriceData(data.prices, interval);
					} else if (data.history && Array.isArray(data.history)) {
						console.log('Got history array with', data.history.length, 'items');
						return transformPriceData(data.history, interval);
					} else if (data.outcomePrices && Array.isArray(data.outcomePrices)) {
						// Create a single data point from current prices
						console.log('Using current outcome prices as single data point');
						const timestamp = Math.floor(Date.now() / 1000);
						const yesPrice = parseFloat(data.outcomePrices[0]) || 0.5;
						return [{
							timestamp: timestamp,
							open: yesPrice,
							high: yesPrice,
							low: yesPrice,
							close: yesPrice,
							volume: data.volume || 0,
							trades: 1,
							outcome: 'Yes'
						}];
					}
					console.log('No usable price data found in response');
				} else {
					console.log('Failed request:', response.status, response.statusText);
				}
			} catch (err: any) {
				console.log('Failed endpoint:', endpoint, err.message || err);
				continue;
			}
		}
		
		console.log('No historical price data found');
		return [];
	} catch (error) {
		console.error('Error fetching historical price data:', error);
		return [];
	}
}

function transformPriceData(rawData: any[], interval: string): any[] {
	if (!Array.isArray(rawData) || rawData.length === 0) return [];
	
	return rawData.map((item: any) => ({
		timestamp: item.timestamp || item.time || Math.floor(Date.now() / 1000),
		open: parseFloat(item.open || item.price || item.mid || 0.5),
		high: parseFloat(item.high || item.price || item.mid || 0.5),
		low: parseFloat(item.low || item.price || item.mid || 0.5),
		close: parseFloat(item.close || item.price || item.mid || 0.5),
		volume: parseFloat(item.volume || 0),
		trades: item.trades || 1,
		outcome: 'Yes'
	})).slice(-50); // Limit to last 50 points
}

async function fetchAndAggregateTradeData(marketId: string, interval: string): Promise<any[]> {
	try {
		console.log('Fetching trade data for aggregation:', marketId);
		
		// Try multiple endpoints for trade data
		const endpoints = [
			`${CLOB_API_BASE}/trades?market=${marketId}&limit=1000`,
			`${GAMMA_API_BASE}/markets/${marketId}/trades?limit=1000`
		];
		
		for (const endpoint of endpoints) {
			try {
				const response = await fetch(endpoint, {
					headers: {
						'Accept': 'application/json',
						'User-Agent': 'PolyMock/1.0'
					}
				});

				if (response.ok) {
					const data = await response.json();
					const trades = data.trades || data || [];
					
					if (trades.length > 0) {
						console.log('Got trade data, aggregating:', trades.length, 'trades');
						return aggregateTradesToCandles(trades, interval);
					}
				}
			} catch (err: any) {
				console.log('Failed trade endpoint:', endpoint, err.message || err);
				continue;
			}
		}
		
		console.log('No trade data found');
		return [];
	} catch (error) {
		console.error('Failed to fetch trade data:', error);
		
		// Return empty array as fallback
		return [];
	}
}

function aggregateTradesToCandles(trades: any[], intervalStr: string): any[] {
	if (!trades || trades.length === 0) return [];

	// Convert interval string to minutes
	const intervalMinutes = getIntervalMinutes(intervalStr);
	const intervalSeconds = intervalMinutes * 60;

	const candles: { [key: number]: any } = {};

	trades.forEach((trade: any) => {
		// Round timestamp to nearest interval
		const candleTime = Math.floor(trade.timestamp / intervalSeconds) * intervalSeconds;

		if (!candles[candleTime]) {
			candles[candleTime] = {
				timestamp: candleTime,
				open: trade.price,
				high: trade.price,
				low: trade.price,
				close: trade.price,
				volume: 0,
				trades: 0,
				outcome: 'Yes' // Default to Yes, could be determined from tokenId
			};
		}

		// Update candle data
		candles[candleTime].close = trade.price; // Last trade becomes close
		candles[candleTime].high = Math.max(candles[candleTime].high, trade.price);
		candles[candleTime].low = Math.min(candles[candleTime].low, trade.price);
		candles[candleTime].volume += trade.size * trade.price; // Volume in USDC
		candles[candleTime].trades += 1;
	});

	// Convert to array and sort by timestamp
	return Object.values(candles)
		.sort((a: any, b: any) => a.timestamp - b.timestamp)
		.slice(-100); // Return last 100 candles
}

function getIntervalMinutes(interval: string): number {
	switch (interval) {
		case '1h': return 60;
		case '4h': return 240;
		case '1d': return 1440;
		case '1w': return 10080;
		case '1m': return 43200; // 30 days
		default: return 60;
	}
}

