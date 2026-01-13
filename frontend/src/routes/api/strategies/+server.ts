import { json, error } from '@sveltejs/kit';
import { getUserFromSession } from '$lib/server/auth';
import { saveBacktestStrategy, getUserStrategies } from '$lib/server/db';
import type { RequestHandler } from './$types';

/**
 * GET - Retrieve all strategies for logged-in user
 */
export const GET: RequestHandler = async (event) => {
	const user = await getUserFromSession(event);

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const db = event.platform?.env?.DB as D1Database;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		const strategies = await getUserStrategies(db, user.id);
		return json({ strategies });
	} catch (err) {
		console.error('Error fetching strategies:', err);
		throw error(500, 'Failed to fetch strategies');
	}
};

/**
 * POST - Save a completed backtest strategy
 */
export const POST: RequestHandler = async (event) => {
	const user = await getUserFromSession(event);

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const db = event.platform?.env?.DB as D1Database;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		const data = await event.request.json();

		// Validate that backtest is complete
		if (!data.backtestResult || !data.backtestResult.trades || data.backtestResult.trades.length === 0) {
			throw error(400, 'Cannot save incomplete backtest');
		}

		// Build strategy object from backtest data
		const strategy = {
			userId: user.id,
			strategyName: data.strategyName || `Strategy ${new Date().toISOString()}`,

			// Market
			marketId: data.marketId || '',
			marketQuestion: data.marketQuestion || '',

			// Configuration
			initialCapital: data.initialCapital || 1000,
			startDate: data.startDate || '',
			endDate: data.endDate || '',

			// Entry rules
			entryType: data.entryType || 'probability_threshold',
			entryConfig: data.entryConfig || {},

			// Position sizing
			positionSizingType: data.positionSizingType || 'fixed_percentage',
			positionSizingValue: data.positionSizingValue || 10,
			maxPositionSize: data.maxPositionSize,

			// Exit rules
			stopLoss: data.stopLoss,
			takeProfit: data.takeProfit,
			timeBasedExit: data.timeBasedExit,

			// Optional features
			useTrailingStop: data.useTrailingStop || false,
			trailingStopConfig: data.trailingStopConfig,
			usePartialExits: data.usePartialExits || false,
			partialExitsConfig: data.partialExitsConfig,
			maxTradesPerDay: data.maxTradesPerDay,
			tradeTimeStart: data.tradeTimeStart,
			tradeTimeEnd: data.tradeTimeEnd,

			// Results from backtestResult
			finalCapital: data.backtestResult.finalCapital,
			totalReturnPercent: data.backtestResult.totalReturnPercent,
			totalTrades: data.backtestResult.totalTrades,
			winningTrades: data.backtestResult.winningTrades,
			losingTrades: data.backtestResult.losingTrades,
			breakEvenTrades: data.backtestResult.breakEvenTrades,
			winRate: data.backtestResult.winRate,
			avgWin: data.backtestResult.avgWin,
			avgLoss: data.backtestResult.avgLoss,
			largestWin: data.backtestResult.largestWin,
			largestLoss: data.backtestResult.largestLoss,
			profitFactor: data.backtestResult.profitFactor,
			sharpeRatio: data.backtestResult.sharpeRatio,
			maxDrawdown: data.backtestResult.maxDrawdown,
			avgTradeDuration: data.backtestResult.avgTradeDuration,

			// Full data
			tradesData: data.backtestResult.trades,
			equityCurve: data.backtestResult.equityCurve || [],
			pnlDistribution: data.backtestResult.pnlDistribution || {}
		};

		const strategyId = await saveBacktestStrategy(db, strategy);

		return json({ success: true, strategyId });
	} catch (err: any) {
		console.error('Error saving strategy:', err);
		throw error(500, err.message || 'Failed to save strategy');
	}
};
