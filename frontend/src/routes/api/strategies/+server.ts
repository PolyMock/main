import { json } from '@sveltejs/kit';
import { getUserFromSession } from '$lib/server/auth';
import { supabase } from '$lib/supabase';
import type { RequestHandler } from './$types';

/**
 * GET - Retrieve all strategies for logged-in user
 */
export const GET: RequestHandler = async (event) => {
	const sessionUser = await getUserFromSession(event);
	if (!sessionUser) return json({ error: 'Unauthorized' }, { status: 401 });

	const { data: dbUser } = await supabase
		.from('users')
		.select('id')
		.eq('wallet_address', sessionUser.walletAddress)
		.maybeSingle();

	if (!dbUser) return json({ strategies: [] });

	const { data, error: dbErr } = await supabase
		.from('backtest_strategies')
		.select('*')
		.eq('user_id', dbUser.id)
		.order('created_at', { ascending: false });

	if (dbErr) {
		console.error('[strategies] GET error:', dbErr);
		return json({ error: 'Failed to fetch strategies' }, { status: 500 });
	}

	return json({ strategies: data ?? [] });
};

/**
 * POST - Save a completed backtest to Supabase
 */
export const POST: RequestHandler = async (event) => {
	const sessionUser = await getUserFromSession(event);
	if (!sessionUser) {
		return json({ error: 'Not authenticated. Please connect your wallet or sign in.' }, { status: 401 });
	}

	try {
		// Look up the actual UUID from the users table by wallet address
		const { data: dbUser, error: userErr } = await supabase
			.from('users')
			.select('id')
			.eq('wallet_address', sessionUser.walletAddress)
			.maybeSingle();

		if (userErr || !dbUser) {
			console.error('[strategies] user lookup error:', userErr);
			return json({ error: 'User not found. Please set a username first.' }, { status: 404 });
		}

		const body = await event.request.json();

		if (!body.strategyName?.trim()) {
			return json({ error: 'Strategy name is required' }, { status: 400 });
		}

		// Build the row for backtest_strategies
		const metrics = body.backtestResult || {};
		const trades = metrics.trades || [];

		// Limit trades stored in backtest_data to avoid huge payloads (keep first 1000)
		const trimmedTrades = trades.slice(0, 1000);

		// Build PnL distribution from trades
		const pnlDistribution = trimmedTrades
			.map((t: any) => t.pnl ?? 0)
			.filter((v: number) => v !== 0);

		const row: Record<string, unknown> = {
			user_id: dbUser.id,
			strategy_name: body.strategyName.trim(),
			description: body.strategyDescription || null,
			strategy_type: body.strategyType || null,
			platform: ['polymarket'],
			is_published: true,
			likes_count: 0,
			comments_count: 0,

			// Core metrics
			initial_capital: body.initialCapital ?? metrics.initialCapital ?? 10000,
			final_capital: metrics.finalCapital ?? null,
			total_return_percent: metrics.totalReturnPercent ?? null,
			roi_percent: metrics.totalReturnPercent ?? null,
			total_trades: metrics.totalTrades ?? 0,
			winning_trades: metrics.winningTrades ?? 0,
			losing_trades: metrics.losingTrades ?? 0,
			win_rate: metrics.winRate ?? 0,
			profit_factor: metrics.profitFactor ?? null,
			sharpe_ratio: metrics.sharpeRatio ?? 0,
			max_drawdown: metrics.maxDrawdown ?? 0,
			max_drawdown_percent: metrics.maxDrawdownPercent ?? 0,
			avg_win: metrics.avgWin ?? 0,
			avg_loss: metrics.avgLoss ?? 0,
			best_trade: metrics.bestTrade ?? 0,
			worst_trade: metrics.worstTrade ?? 0,
			avg_hold_time: metrics.avgHoldTime ?? 0,
			execution_time: metrics.executionTime ?? 0,
			markets_analyzed: metrics.marketsAnalyzed ?? 0,

			// Config (all NOT NULL in DB)
			entry_type: body.entryType || 'BOTH',
			entry_config: body.entryConfig || {},
			stop_loss: body.stopLoss ?? 0,
			take_profit: body.takeProfit ?? 0,
			time_based_exit: body.timeBasedExit ?? 0,
			position_sizing_type: body.positionSizingType || 'FIXED',
			position_sizing_value: body.positionSizingValue ?? 0,
			max_position_size: body.maxPositionSize ?? 0,
			start_date: body.startDate || new Date().toISOString(),
			end_date: body.endDate || new Date().toISOString(),

			// JSON/array fields
			market_ids: body.marketIds || [],
			equity_curve: metrics.equityCurve || [],
			exit_reasons: metrics.exitReasons || {},
			trades_data: trimmedTrades,
			pnl_distribution: pnlDistribution,

			// Full backtest data for reconstructing results page
			backtest_data: {
				trades: trimmedTrades,
				metrics: {
					totalPnl: metrics.totalPnl,
					netPnl: metrics.netPnl,
					roi: metrics.totalReturnPercent,
					avgWin: metrics.avgWin,
					avgLoss: metrics.avgLoss,
					bestTrade: metrics.bestTrade,
					worstTrade: metrics.worstTrade,
					expectancy: metrics.expectancy,
					medianWin: metrics.medianWin,
					medianLoss: metrics.medianLoss,
					volatility: metrics.volatility,
					capitalUtilization: metrics.capitalUtilization,
					longestWinStreak: metrics.longestWinStreak,
					longestLossStreak: metrics.longestLossStreak,
					yesPerformance: metrics.yesPerformance,
					noPerformance: metrics.noPerformance,
					exitReasonDistribution: metrics.exitReasons,
				},
				startingCapital: metrics.initialCapital ?? body.initialCapital,
				endingCapital: metrics.finalCapital,
				marketsAnalyzed: metrics.marketsAnalyzed,
				executionTime: metrics.executionTime,
				totalTradesCount: metrics.totalTrades,
				strategyConfig: metrics.strategyConfig || null,
				description: body.strategyDescription || null,
			},
		};

		const { data, error: dbErr } = await supabase
			.from('backtest_strategies')
			.insert(row)
			.select('id')
			.single();

		if (dbErr) {
			console.error('[strategies] POST error:', dbErr);
			return json({ error: `Database error: ${dbErr.message}` }, { status: 500 });
		}

		return json({ success: true, strategyId: data?.id ?? null });
	} catch (err: any) {
		console.error('[strategies] POST unexpected error:', err);
		return json({ error: err.message || 'Unexpected error saving strategy' }, { status: 500 });
	}
};
