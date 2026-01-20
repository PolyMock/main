import { json, error } from '@sveltejs/kit';
import { getUserFromSession } from '$lib/server/auth';
import { saveBacktestStrategy, getUserStrategies } from '$lib/server/db';
import type { RequestHandler } from './$types';

/**
 * GET - Retrieve all strategies for logged-in user
 * Supports both session-based auth and wallet address query parameter
 */
export const GET: RequestHandler = async (event) => {
	const db = event.platform?.env?.DB as D1Database;
	if (!db) {
		console.error('[GET /api/strategies] Database not available');
		throw error(500, 'Database not available');
	}

	// Try to get user from session first
	let user = await getUserFromSession(event);
	console.log('[GET /api/strategies] User from session:', user ? `ID: ${user.id}, Wallet: ${user.solanaAddress}` : 'null');

	// If no session, check for wallet address in query params (read-only mode)
	if (!user) {
		const walletAddress = event.url.searchParams.get('wallet');
		console.log('[GET /api/strategies] No session, checking wallet param:', walletAddress);

		if (walletAddress) {
			// Look up user by wallet address
			const result = await db
				.prepare('SELECT id, solana_address, name FROM users WHERE solana_address = ?')
				.bind(walletAddress)
				.first<{ id: number; solana_address: string; name: string }>();

			if (result) {
				user = {
					id: result.id,
					solanaAddress: result.solana_address,
					name: result.name,
					email: null,
					picture: null
				};
				console.log('[GET /api/strategies] Found user by wallet:', user.id);
			}
		}
	}

	if (!user) {
		console.error('[GET /api/strategies] No user found - rejecting request');
		throw error(401, 'Unauthorized');
	}

	try {
		const strategies = await getUserStrategies(db, user.id);
		console.log(`[GET /api/strategies] Found ${strategies.length} strategies for user ${user.id}`);
		return json({ strategies });
	} catch (err) {
		console.error('[GET /api/strategies] Error fetching strategies:', err);
		throw error(500, 'Failed to fetch strategies');
	}
};

/**
 * POST - Save a completed backtest strategy
 */
export const POST: RequestHandler = async (event) => {
	const user = await getUserFromSession(event);

	console.log('[POST /api/strategies] User from session:', user ? `ID: ${user.id}, Wallet: ${user.solanaAddress}` : 'null');

	if (!user) {
		console.error('[POST /api/strategies] No user in session - rejecting request');
		throw error(401, 'Unauthorized');
	}

	const db = event.platform?.env?.DB as D1Database;
	if (!db) {
		console.error('[POST /api/strategies] Database not available');
		throw error(500, 'Database not available');
	}

	try {
		const data = await event.request.json();
		console.log('[POST /api/strategies] Saving strategy for user:', user.id);

		// Validate that backtest is complete
		if (!data.backtestResult || !data.backtestResult.trades || data.backtestResult.trades.length === 0) {
			throw error(400, 'Cannot save incomplete backtest');
		}

		// Build strategy object from backtest data
		const strategy = {
			userId: user.id,
			strategyName: data.strategyName || `Strategy ${new Date().toISOString()}`,

			// Market (supports multiple markets)
			marketIds: data.marketIds || [],
			marketQuestion: data.marketQuestion || '',

			// Configuration
			initialCapital: data.initialCapital || 1000,
			startDate: data.startDate || '',
			endDate: data.endDate || '',

			// Entry rules
			entryType: data.entryType || 'probability_threshold',
			entryConfig: data.entryConfig || {},
			buyThreshold: data.entryConfig?.buyThreshold,
			sellThreshold: data.entryConfig?.sellThreshold,
			entryTimeConstraints: data.entryConfig?.entryTimeConstraints,

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

		console.log('[POST /api/strategies] Strategy saved successfully, ID:', strategyId);
		return json({ success: true, strategyId });
	} catch (err: any) {
		console.error('[POST /api/strategies] Error saving strategy:', err);
		throw error(500, err.message || 'Failed to save strategy');
	}
};
