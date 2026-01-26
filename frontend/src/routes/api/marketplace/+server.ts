import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET - Retrieve top backtest strategies sorted by PnL
 */
export const GET: RequestHandler = async (event) => {
	const db = event.platform?.env?.DB as D1Database;
	if (!db) {
		console.error('[GET /api/marketplace] Database not available');
		throw error(500, 'Database not available');
	}

	try {
		const limit = parseInt(event.url.searchParams.get('limit') || '50');
		const offset = parseInt(event.url.searchParams.get('offset') || '0');

		console.log(`[GET /api/marketplace] Fetching top ${limit} strategies (offset: ${offset})`);

		// Fetch strategies sorted by total return percentage (descending)
		// Join with users table to get user info
		const result = await db
			.prepare(`
				SELECT
					s.*,
					u.solana_address,
					u.name as user_name
				FROM backtest_strategies s
				LEFT JOIN users u ON s.user_id = u.id
				WHERE s.total_return_percent IS NOT NULL
				ORDER BY s.total_return_percent DESC
				LIMIT ? OFFSET ?
			`)
			.bind(limit, offset)
			.all();

		const strategies = result.results.map((row: any) => {
			// Parse JSON fields
			let marketIds = [];
			let tradesData = [];
			let equityCurve = [];
			let pnlDistribution = {};
			let entryConfig = {};

			try { marketIds = JSON.parse(row.market_ids || '[]'); } catch (e) {}
			try { tradesData = JSON.parse(row.trades_data || '[]'); } catch (e) {}
			try { equityCurve = JSON.parse(row.equity_curve || '[]'); } catch (e) {}
			try { pnlDistribution = JSON.parse(row.pnl_distribution || '{}'); } catch (e) {}
			try { entryConfig = JSON.parse(row.entry_config || '{}'); } catch (e) {}

			return {
				id: row.id,
				userId: row.user_id,
				strategyName: row.strategy_name,
				userName: row.user_name || 'Anonymous',
				walletAddress: row.solana_address,

				// Market info
				marketIds,
				marketQuestion: row.market_question,

				// Configuration
				initialCapital: row.initial_capital,
				startDate: row.start_date,
				endDate: row.end_date,

				// Entry rules
				entryType: row.entry_type,
				entryConfig,

				// Position sizing
				positionSizingType: row.position_sizing_type,
				positionSizingValue: row.position_sizing_value,
				maxPositionSize: row.max_position_size,

				// Exit rules
				stopLoss: row.stop_loss,
				takeProfit: row.take_profit,
				timeBasedExit: row.time_based_exit,

				// Results
				finalCapital: row.final_capital,
				totalReturnPercent: row.total_return_percent,
				totalTrades: row.total_trades,
				winningTrades: row.winning_trades,
				losingTrades: row.losing_trades,
				breakEvenTrades: row.break_even_trades,
				winRate: row.win_rate,
				avgWin: row.avg_win,
				avgLoss: row.avg_loss,
				largestWin: row.largest_win,
				largestLoss: row.largest_loss,
				profitFactor: row.profit_factor,
				sharpeRatio: row.sharpe_ratio,
				maxDrawdown: row.max_drawdown,
				avgTradeDuration: row.avg_trade_duration,

				// Full data
				tradesData,
				equityCurve,
				pnlDistribution,

				createdAt: row.created_at
			};
		});

		console.log(`[GET /api/marketplace] Found ${strategies.length} strategies`);

		return json({ strategies });
	} catch (err) {
		console.error('[GET /api/marketplace] Error fetching strategies:', err);
		throw error(500, 'Failed to fetch marketplace strategies');
	}
};
