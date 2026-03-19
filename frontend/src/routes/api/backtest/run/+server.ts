/**
 * POST /api/backtest/run
 *
 * Runs a backtest using the local TS engine.
 * Streams NDJSON: { type: 'progress' | 'result' | 'error', ... }
 *
 * Later this will be swapped to call the Rust engine on a VM.
 */

import { SYNTHESIS_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import { runBacktest, type RawTrade, type MarketOutcome } from '$lib/backtesting/engine';
import { getStrategy } from '$lib/backtesting/strategies';

const SYNTHESIS_API_BASE = 'https://synthesis.trade/api/v1';
const TRADES_PER_REQUEST = 1000;
const MAX_TRADES_PER_MARKET = 3000; // Cap for faster testing

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const {
		markets,
		strategyType,
		initialCash = 10000,
		reimburseOpenPositions = false,
		priceInf = null,
		priceSup = null,
		position = null,
		timestampStart = null,
		timestampEnd = null,
	} = body;

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const send = (obj: Record<string, unknown>) => {
				controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
			};

			try {
				// ── Validate ───────────────────────────────────────────────
				if (!markets?.length) {
					send({ type: 'error', error: 'No markets provided' });
					controller.close();
					return;
				}

				const strategyFn = getStrategy(strategyType);
				if (!strategyFn) {
					send({ type: 'error', error: `Unknown strategy: ${strategyType}` });
					controller.close();
					return;
				}

				// ── Fetch trades from Synthesis API ────────────────────────
				send({ type: 'progress', progress: 5, message: 'Fetching trades from Synthesis...' });

				const allTrades: RawTrade[] = [];
				const marketOutcomes: MarketOutcome[] = [];
				const marketSlice = markets.slice(0, 15);

				for (let mi = 0; mi < marketSlice.length; mi++) {
					const market = marketSlice[mi];
					const conditionId = market.conditionId || market.id;
					const outcomes = parseOutcomes(market.outcomes);

					send({
						type: 'progress',
						progress: 5 + Math.round((mi / marketSlice.length) * 15),
						message: `Fetching trades for market ${mi + 1}/${marketSlice.length}...`,
					});

					let offset = 0;
					let marketTradeCount = 0;

					while (offset < MAX_TRADES_PER_MARKET) {
						let batch: any[];
						try {
							const resp = await fetch(
								`${SYNTHESIS_API_BASE}/polymarket/market/${conditionId}/trades?limit=${TRADES_PER_REQUEST}&offset=${offset}`,
								{
									headers: {
										Accept: 'application/json',
										'X-PROJECT-API-KEY': SYNTHESIS_API_KEY,
									},
								},
							);
							if (!resp.ok) break;
							const data = await resp.json();
							batch = data.response || [];
						} catch {
							break;
						}

						for (const trade of batch) {
							// Time filter
							if (timestampStart || timestampEnd) {
								const tradeMs = new Date(trade.created_at).getTime();
								if (timestampStart && tradeMs < new Date(timestampStart).getTime()) continue;
								if (timestampEnd && tradeMs > new Date(timestampEnd).getTime()) continue;
							}

							const price = parseFloat(trade.price || '0');

							// Price filter
							if (priceInf !== null && price < priceInf) continue;
							if (priceSup !== null && price > priceSup) continue;

							// Determine position from token
							const tokenId = trade.token_id || '';
							let tradePosition: string;
							if (tokenId === market.clobTokenIds?.[0]) {
								tradePosition = outcomes[0] || 'Yes';
							} else if (tokenId === market.clobTokenIds?.[1]) {
								tradePosition = outcomes[1] || 'No';
							} else {
								tradePosition = trade.outcome || 'Yes';
							}

							// Position filter
							if (position && position !== 'Both') {
								if (tradePosition !== position) continue;
							}

							allTrades.push({
								platform: 'polymarket',
								timestamp: trade.created_at || '',
								title: market.question || market.title || '',
								volume: market.volume || 0,
								market_id: conditionId,
								market_category: market.category || 'unknown',
								position: tradePosition,
								possible_outcomes: outcomes,
								price,
								amount: Math.floor(parseFloat(trade.shares || trade.amount || '0')),
							});
							marketTradeCount++;
						}

						if (batch.length < TRADES_PER_REQUEST) break;
						offset += TRADES_PER_REQUEST;

						// Rate limit
						await new Promise((r) => setTimeout(r, 200));
					}

					// Build outcome for this market
					marketOutcomes.push({
						market_id: conditionId,
						outcome: market.resolvedOutcome || null,
						end_date: market.endDate || market.end_date_iso || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
					});
				}

				if (allTrades.length === 0) {
					send({ type: 'error', error: 'No trades found for the selected markets and filters.' });
					controller.close();
					return;
				}

				send({
					type: 'progress',
					progress: 20,
					message: `Loaded ${allTrades.length} trades across ${marketSlice.length} markets. Running strategy...`,
				});

				// ── Run backtest engine ────────────────────────────────────
				const startTime = Date.now();

				const result = runBacktest(
					allTrades,
					marketOutcomes,
					strategyFn,
					initialCash,
					reimburseOpenPositions,
					(pct, msg) => send({ type: 'progress', progress: pct, message: msg }),
				);

				const executionTime = Date.now() - startTime;

				// ── Build BacktestResult matching the frontend type ────────
				const backtestResult = buildBacktestResult(result, initialCash, marketSlice.length, executionTime);

				send({ type: 'progress', progress: 95, message: 'Finalizing results...' });
				send({ type: 'result', data: backtestResult });
			} catch (err: any) {
				send({ type: 'error', error: err.message || 'Unknown engine error' });
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson',
			'Transfer-Encoding': 'chunked',
			'Cache-Control': 'no-cache',
		},
	});
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseOutcomes(outcomes: any): string[] {
	if (Array.isArray(outcomes)) return outcomes;
	try {
		const parsed = JSON.parse(outcomes);
		if (Array.isArray(parsed)) return parsed;
	} catch {
		/* ignore */
	}
	return ['Yes', 'No'];
}

function buildBacktestResult(
	engine: ReturnType<typeof runBacktest>,
	initialCash: number,
	marketsAnalyzed: number,
	executionTime: number,
) {
	// Compute trade-level metrics from the trade log
	const trades = engine.trade_log.map((t, i) => ({
		id: `trade-${i}`,
		marketId: t.market_id,
		marketName: t.market_id,
		conditionId: t.market_id,
		entryTime: t.time,
		side: t.position as 'YES' | 'NO',
		entryPrice: t.amount > 0 ? t.cost / t.amount : 0,
		exitPrice: 0,
		shares: t.amount,
		amountInvested: t.cost,
		pnl: 0,
		pnlPercentage: 0,
		fees: 0,
		status: 'CLOSED' as const,
		entryReason: 'PRICE_THRESHOLD' as const,
		holdingDuration: 0,
		capitalAllocation: initialCash > 0 ? (t.cost / initialCash) * 100 : 0,
	}));

	const winningTrades = engine.total_pnl > 0 ? engine.trades_executed : 0;
	const losingTrades = engine.total_pnl <= 0 ? engine.trades_executed : 0;

	// Build equity curve from trade log
	let equity = initialCash;
	const equityCurve = engine.trade_log.map((t) => {
		equity -= t.cost;
		return {
			timestamp: t.time,
			equity,
			drawdown: Math.max(0, initialCash - equity),
			drawdownPercentage: initialCash > 0 ? Math.max(0, ((initialCash - equity) / initialCash) * 100) : 0,
		};
	});

	return {
		strategyConfig: {
			entryType: 'BOTH',
			exitRules: { resolveOnExpiry: true },
			positionSizing: { type: 'FIXED', fixedAmount: 10 },
			startDate: engine.trade_log[0]?.time || new Date().toISOString(),
			endDate: engine.trade_log[engine.trade_log.length - 1]?.time || new Date().toISOString(),
			initialBankroll: initialCash,
		},
		trades,
		metrics: {
			totalTrades: engine.trades_executed,
			winningTrades,
			losingTrades,
			winRate: engine.trades_executed > 0 ? (winningTrades / engine.trades_executed) * 100 : 0,
			totalPnl: engine.total_pnl,
			totalFees: 0,
			netPnl: engine.total_pnl,
			roi: engine.roi_percent,
			avgWin: 0,
			avgLoss: 0,
			bestTrade: 0,
			worstTrade: 0,
			yesPerformance: { count: 0, winRate: 0, pnl: 0, avgWin: 0, avgLoss: 0 },
			noPerformance: { count: 0, winRate: 0, pnl: 0, avgWin: 0, avgLoss: 0 },
			exitReasonDistribution: {
				resolution: engine.settle_log.length,
				stopLoss: 0,
				takeProfit: 0,
				maxHoldTime: 0,
				trailingStop: 0,
				partialExits: 0,
			},
			equityCurve,
			maxDrawdown: 0,
			maxDrawdownPercentage: 0,
			sharpeRatio: 0,
			volatility: 0,
			expectancy: 0,
			profitFactor: 0,
			medianWin: 0,
			medianLoss: 0,
			avgHoldTime: 0,
			medianHoldTime: 0,
			capitalUtilization: 0,
			avgCapitalAllocation: 0,
			consecutiveWins: 0,
			consecutiveLosses: 0,
			longestWinStreak: 0,
			longestLossStreak: 0,
			dailyPnl: [],
			drawdownCurve: [],
			capitalUtilizationOverTime: [],
		},
		startingCapital: initialCash,
		endingCapital: engine.final_cash,
		marketsAnalyzed,
		executionTime,
	};
}
