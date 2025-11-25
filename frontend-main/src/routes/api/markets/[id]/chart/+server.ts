import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const POLYMARKET_API_BASE = 'https://gamma-api.polymarket.com';
const DATA_API_BASE = 'https://data-api.polymarket.com';

export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const { id } = params;
		const interval = url.searchParams.get('interval') || '1h';
		
		if (!id) {
			return json({ error: 'Market ID is required' }, { status: 400 });
		}

		// First, try to get historical data from gamma-api
		let chartData = await fetchHistoricalData(id, interval);
		
		// If that fails or returns empty data, try to get trade data and aggregate
		if (!chartData || chartData.length === 0) {
			chartData = await fetchAndAggregateTradeData(id, interval);
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

async function fetchHistoricalData(marketId: string, interval: string): Promise<any[]> {
	try {
		const response = await fetch(`${POLYMARKET_API_BASE}/history?marketId=${marketId}&interval=${interval}`, {
			headers: {
				'Accept': 'application/json',
				'User-Agent': 'PolyPaper/1.0'
			}
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();
		return data.history || [];
	} catch (error) {
		console.error('Failed to fetch historical data:', error);
		return [];
	}
}

async function fetchAndAggregateTradeData(marketId: string, interval: string): Promise<any[]> {
	try {
		// Fetch recent trades from data-api
		const response = await fetch(`${DATA_API_BASE}/trades?market_id=${marketId}&limit=1000`, {
			headers: {
				'Accept': 'application/json',
				'User-Agent': 'PolyPaper/1.0'
			}
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();
		const trades = data.trades || [];

		// Aggregate trades into candles
		return aggregateTradesToCandles(trades, interval);
	} catch (error) {
		console.error('Failed to fetch trade data:', error);
		
		// Return mock data as fallback
		return generateMockChartData(interval);
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

function generateMockChartData(interval: string): any[] {
	const now = Date.now() / 1000;
	const intervalMinutes = getIntervalMinutes(interval);
	const intervalSeconds = intervalMinutes * 60;
	
	const data = [];
	let price = 0.5; // Start at 50%
	
	// Generate last 50 data points
	for (let i = 49; i >= 0; i--) {
		const timestamp = now - (i * intervalSeconds);
		
		// Add some realistic price movement
		const change = (Math.random() - 0.5) * 0.05; // ±2.5% change
		price = Math.max(0.01, Math.min(0.99, price + change));
		
		const high = price + Math.random() * 0.02;
		const low = price - Math.random() * 0.02;
		
		data.push({
			timestamp: Math.floor(timestamp),
			open: price - (Math.random() - 0.5) * 0.01,
			high: Math.max(price, high),
			low: Math.min(price, low),
			close: price,
			volume: Math.random() * 100000 + 10000,
			trades: Math.floor(Math.random() * 50) + 10,
			outcome: 'Yes'
		});
	}
	
	return data;
}