import { json } from '@sveltejs/kit';
import { SYNTHESIS_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

const SYNTHESIS_API_BASE = 'https://synthesis.trade/api/v1';

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

		// Try to get historical data
		let chartData = await fetchHistoricalPriceData(market, interval);

		if (!chartData || chartData.length === 0) {
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
		// Try to get specific market from Synthesis
		const response = await fetch(`${SYNTHESIS_API_BASE}/polymarket/market/${marketId}`, {
			headers: {
				'Accept': 'application/json',
				'X-PROJECT-API-KEY': SYNTHESIS_API_KEY
			}
		});

		if (response.ok) {
			const data = await response.json();
			if (data.success && data.response?.market) {
				const m = data.response.market;
				return {
					id: m.condition_id,
					condition_id: m.condition_id,
					left_token_id: m.left_token_id,
					right_token_id: m.right_token_id,
					clobTokenIds: [m.left_token_id, m.right_token_id],
					outcomePrices: [m.left_price, m.right_price],
					volume: parseFloat(m.volume || '0'),
				};
			}
		}

		// Fallback: search in markets list
		const listResponse = await fetch(`${SYNTHESIS_API_BASE}/polymarket/markets?limit=100`, {
			headers: {
				'Accept': 'application/json',
				'X-PROJECT-API-KEY': SYNTHESIS_API_KEY
			}
		});

		if (listResponse.ok) {
			const listData = await listResponse.json();
			if (listData.success && listData.response) {
				for (const item of listData.response) {
					const found = item.markets?.find((m: any) => m.condition_id === marketId);
					if (found) {
						return {
							id: found.condition_id,
							condition_id: found.condition_id,
							left_token_id: found.left_token_id,
							right_token_id: found.right_token_id,
							clobTokenIds: [found.left_token_id, found.right_token_id],
							outcomePrices: [found.left_price, found.right_price],
							volume: parseFloat(found.volume || '0'),
						};
					}
				}
			}
		}

		return null;
	} catch (error) {
		console.error('Error fetching market:', error);
		return null;
	}
}

// Map our interval format to Synthesis format
function mapInterval(interval: string): string {
	switch (interval) {
		case '1h': return '1h';
		case '4h': return '6h'; // Synthesis uses 6h, closest to 4h
		case '6h': return '6h';
		case '1d': return '1d';
		case '1w': return '1w';
		case '1m': return '1m';
		default: return '1d';
	}
}

async function fetchHistoricalPriceData(market: any, interval: string): Promise<any[]> {
	try {
		const tokenId = market.left_token_id || market.clobTokenIds?.[0];
		if (!tokenId) return [];

		const synthInterval = mapInterval(interval);

		// Fetch price history from Synthesis
		const response = await fetch(
			`${SYNTHESIS_API_BASE}/polymarket/market/${tokenId}/price-history?interval=${synthInterval}&volume=true`,
			{
				headers: {
					'Accept': 'application/json',
					'X-PROJECT-API-KEY': SYNTHESIS_API_KEY
				}
			}
		);

		if (response.ok) {
			const data = await response.json();
			if (data.success && data.response) {
				const { ohlc, volume } = data.response;

				if (ohlc && Array.isArray(ohlc)) {
					return ohlc.map((candle: any, i: number) => ({
						timestamp: candle.time,
						open: candle.open,
						high: candle.high,
						low: candle.low,
						close: candle.close,
						volume: volume?.[i] || 0,
						trades: 1,
						outcome: 'Yes'
					})).slice(-100);
				}
			}
		}

		// Fallback: try trades endpoint
		return await fetchAndAggregateTradeData(market.id || market.condition_id, interval);
	} catch (error) {
		console.error('Error fetching historical price data:', error);
		return [];
	}
}

async function fetchAndAggregateTradeData(conditionId: string, interval: string): Promise<any[]> {
	try {
		const response = await fetch(
			`${SYNTHESIS_API_BASE}/polymarket/market/${conditionId}/trades?limit=1000`,
			{
				headers: {
					'Accept': 'application/json',
					'X-PROJECT-API-KEY': SYNTHESIS_API_KEY
				}
			}
		);

		if (response.ok) {
			const data = await response.json();
			if (data.success && Array.isArray(data.response) && data.response.length > 0) {
				const trades = data.response.map((t: any) => ({
					timestamp: Math.floor(new Date(t.created_at).getTime() / 1000),
					price: parseFloat(t.price),
					size: parseFloat(t.shares || t.amount),
				}));
				return aggregateTradesToCandles(trades, interval);
			}
		}

		return [];
	} catch (error) {
		console.error('Failed to fetch trade data:', error);
		return [];
	}
}

function aggregateTradesToCandles(trades: any[], intervalStr: string): any[] {
	if (!trades || trades.length === 0) return [];

	const intervalMinutes = getIntervalMinutes(intervalStr);
	const intervalSeconds = intervalMinutes * 60;
	const candles: { [key: number]: any } = {};

	trades.forEach((trade: any) => {
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
				outcome: 'Yes'
			};
		}

		candles[candleTime].close = trade.price;
		candles[candleTime].high = Math.max(candles[candleTime].high, trade.price);
		candles[candleTime].low = Math.min(candles[candleTime].low, trade.price);
		candles[candleTime].volume += trade.size * trade.price;
		candles[candleTime].trades += 1;
	});

	return Object.values(candles)
		.sort((a: any, b: any) => a.timestamp - b.timestamp)
		.slice(-100);
}

function getIntervalMinutes(interval: string): number {
	switch (interval) {
		case '1h': return 60;
		case '4h': return 240;
		case '1d': return 1440;
		case '1w': return 10080;
		case '1m': return 43200;
		default: return 60;
	}
}
