import { json } from '@sveltejs/kit';
import { SYNTHESIS_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

const SYNTHESIS_API_BASE = 'https://synthesis.trade/api/v1';
const TRADES_PER_REQUEST = 1000;
const MAX_TRADES_PER_MARKET = 3000; // Cap for faster testing

/**
 * Streams trades as NDJSON to avoid building a huge JSON response in memory.
 *
 * Protocol:
 *   - Each line is a JSON object.
 *   - { "type": "progress", "market": "...", "tradesSoFar": N }
 *   - { "type": "trades", "trades": [...batch...] }
 *   - { "type": "done", "outcomes": [...], "totalTrades": N }
 *   - { "type": "error", "error": "..." }
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { markets, timestampStart, timestampEnd } = await request.json();

		if (!markets || !Array.isArray(markets) || markets.length === 0) {
			return json({ error: 'No markets provided' }, { status: 400 });
		}

		const startMs = timestampStart ? new Date(timestampStart).getTime() : null;
		const endMs = timestampEnd ? new Date(timestampEnd).getTime() : null;

		const stream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();
				const send = (obj: Record<string, unknown>) => {
					controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
				};

				try {
					const marketOutcomes: any[] = [];
					let totalTrades = 0;

					for (const market of markets.slice(0, 15)) {
						const conditionId = market.conditionId || market.id;
						const outcomes = parseOutcomes(market.outcomes);

						// Stream trades page by page instead of accumulating all in memory
						let offset = 0;
						while (true) {
							let batch: any[];
							try {
								const response = await fetch(
									`${SYNTHESIS_API_BASE}/polymarket/market/${conditionId}/trades?limit=${TRADES_PER_REQUEST}&offset=${offset}`,
									{
										headers: {
											'Accept': 'application/json',
											'X-PROJECT-API-KEY': SYNTHESIS_API_KEY
										}
									}
								);

								if (!response.ok) break;

								const data = await response.json();
								batch = data.response || [];
							} catch {
								break;
							}

							// Transform and filter the batch
							const standardized: any[] = [];
							for (const trade of batch) {
								if (startMs || endMs) {
									const tradeMs = new Date(trade.created_at).getTime();
									if (startMs && tradeMs < startMs) continue;
									if (endMs && tradeMs > endMs) continue;
								}

								standardized.push({
									platform: 'polymarket',
									timestamp: trade.created_at,
									title: market.question || market.title || '',
									volume: market.volume || 0,
									market_id: conditionId,
									market_category: market.category || 'unknown',
									position: trade.outcome || 'Yes',
									possible_outcomes: outcomes,
									price: parseFloat(trade.price || '0'),
									amount: parseFloat(trade.shares || trade.amount || '0'),
								});
							}

							if (standardized.length > 0) {
								totalTrades += standardized.length;
								send({ type: 'trades', trades: standardized });
							}

							send({
								type: 'progress',
								market: market.question || market.title || conditionId,
								tradesSoFar: totalTrades
							});

							if (batch.length < TRADES_PER_REQUEST) break;
							offset += TRADES_PER_REQUEST;
							if (offset >= MAX_TRADES_PER_MARKET) break;

							// Rate limit
							await new Promise(r => setTimeout(r, 200));
						}

						marketOutcomes.push({
							market_id: conditionId,
							outcome: market.closed ? (market.winner || null) : null,
							end_date: market.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
						});
					}

					send({ type: 'done', outcomes: marketOutcomes, totalTrades });
				} catch (err) {
					send({
						type: 'error',
						error: err instanceof Error ? err.message : 'Unknown error'
					});
				} finally {
					controller.close();
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'application/x-ndjson',
				'Transfer-Encoding': 'chunked',
				'Cache-Control': 'no-cache',
			}
		});
	} catch (error) {
		console.error('Error fetching backtest trades:', error);
		return json(
			{ error: 'Failed to fetch trades', details: error instanceof Error ? error.message : 'Unknown' },
			{ status: 500 }
		);
	}
};

function parseOutcomes(outcomes: any): string[] {
	if (Array.isArray(outcomes)) return outcomes;
	try {
		const parsed = JSON.parse(outcomes);
		if (Array.isArray(parsed)) return parsed;
	} catch { /* ignore */ }
	return ['Yes', 'No'];
}
