/**
 * Database helper functions for Cloudflare D1
 */
// Cloudflare D1 Database type
export interface D1Database {
	prepare(query: string): D1PreparedStatement;
	exec(query: string): Promise<D1ExecResult>;
	batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	first<T = any>(colName?: string): Promise<T | null>;
	run(): Promise<D1Result>;
	all<T = any>(): Promise<D1Result<T>>;
}

interface D1Result<T = unknown> {
	results: T[];
	success: boolean;
	meta: {
		duration: number;
		rows_read: number;
		rows_written: number;
		last_row_id: number;
		changed_db: boolean;
		changes: number;
	};
}

interface D1ExecResult {
	count: number;
	duration: number;
}

export interface BacktestStrategy {
	id?: number;
	userId: number;
	strategyName: string;

	// Market selection (supports multiple markets)
	marketIds: string[]; // Array of market/condition IDs
	marketQuestion: string;

	// Configuration
	initialCapital: number;
	startDate: string;
	endDate: string;

	// Entry rules
	entryType: string;
	entryConfig: any;

	// Position sizing
	positionSizingType: string;
	positionSizingValue: number;
	maxPositionSize?: number;

	// Exit rules
	stopLoss?: number;
	takeProfit?: number;
	timeBasedExit?: number;

	// Optional features
	useTrailingStop: boolean;
	trailingStopConfig?: any;
	usePartialExits: boolean;
	partialExitsConfig?: any;
	maxTradesPerDay?: number;
	tradeTimeStart?: string;
	tradeTimeEnd?: string;

	// Results
	finalCapital: number;
	totalReturnPercent: number;
	totalTrades: number;
	winningTrades: number;
	losingTrades: number;
	breakEvenTrades: number;
	winRate: number;
	avgWin: number;
	avgLoss: number;
	largestWin: number;
	largestLoss: number;
	profitFactor?: number;
	sharpeRatio?: number;
	maxDrawdown?: number;
	avgTradeDuration?: number;

	// Full data
	tradesData: any[];
	equityCurve: any[];
	pnlDistribution: any;

	createdAt?: string;
}

/**
 * Save a completed backtest strategy
 */
export async function saveBacktestStrategy(
	db: D1Database,
	strategy: BacktestStrategy
): Promise<number> {
	const result = await db
		.prepare(
			`INSERT INTO backtest_strategies (
				user_id, strategy_name, market_ids, market_question,
				initial_capital, start_date, end_date,
				entry_type, entry_config,
				position_sizing_type, position_sizing_value, max_position_size,
				stop_loss, take_profit, time_based_exit,
				use_trailing_stop, trailing_stop_config,
				use_partial_exits, partial_exits_config,
				max_trades_per_day, trade_time_start, trade_time_end,
				final_capital, total_return_percent, total_trades,
				winning_trades, losing_trades, break_even_trades,
				win_rate, avg_win, avg_loss, largest_win, largest_loss,
				profit_factor, sharpe_ratio, max_drawdown, avg_trade_duration,
				trades_data, equity_curve, pnl_distribution
			) VALUES (
				?, ?, ?, ?,
				?, ?, ?,
				?, ?,
				?, ?, ?,
				?, ?, ?,
				?, ?,
				?, ?,
				?, ?, ?,
				?, ?, ?,
				?, ?, ?,
				?, ?, ?, ?, ?,
				?, ?, ?, ?,
				?, ?, ?
			) RETURNING id`
		)
		.bind(
			strategy.userId,
			strategy.strategyName,
			JSON.stringify(strategy.marketIds),
			strategy.marketQuestion,
			strategy.initialCapital,
			strategy.startDate,
			strategy.endDate,
			strategy.entryType,
			JSON.stringify(strategy.entryConfig),
			strategy.positionSizingType,
			strategy.positionSizingValue,
			strategy.maxPositionSize ?? null,
			strategy.stopLoss ?? null,
			strategy.takeProfit ?? null,
			strategy.timeBasedExit ?? null,
			strategy.useTrailingStop ? 1 : 0,
			strategy.trailingStopConfig ? JSON.stringify(strategy.trailingStopConfig) : null,
			strategy.usePartialExits ? 1 : 0,
			strategy.partialExitsConfig ? JSON.stringify(strategy.partialExitsConfig) : null,
			strategy.maxTradesPerDay ?? null,
			strategy.tradeTimeStart ?? null,
			strategy.tradeTimeEnd ?? null,
			strategy.finalCapital,
			strategy.totalReturnPercent,
			strategy.totalTrades,
			strategy.winningTrades,
			strategy.losingTrades,
			strategy.breakEvenTrades,
			strategy.winRate,
			strategy.avgWin,
			strategy.avgLoss,
			strategy.largestWin,
			strategy.largestLoss,
			strategy.profitFactor ?? null,
			strategy.sharpeRatio ?? null,
			strategy.maxDrawdown ?? null,
			strategy.avgTradeDuration ?? null,
			JSON.stringify(strategy.tradesData),
			JSON.stringify(strategy.equityCurve),
			JSON.stringify(strategy.pnlDistribution)
		)
		.first();

	return result?.id as number;
}

/**
 * Get all strategies for a user
 */
export async function getUserStrategies(
	db: D1Database,
	userId: number
): Promise<BacktestStrategy[]> {
	const result = await db
		.prepare(
			`SELECT
				id, user_id, strategy_name, market_ids, market_question,
				initial_capital, start_date, end_date,
				final_capital, total_return_percent, total_trades,
				winning_trades, losing_trades, break_even_trades,
				win_rate, avg_win, avg_loss, largest_win, largest_loss,
				profit_factor, sharpe_ratio, max_drawdown, avg_trade_duration,
				equity_curve,
				created_at
			FROM backtest_strategies
			WHERE user_id = ?
			ORDER BY created_at DESC`
		)
		.bind(userId)
		.all();

	return (result.results || []).map((row: any) => ({
		id: row.id,
		userId: row.user_id,
		strategyName: row.strategy_name,
		marketIds: row.market_ids ? JSON.parse(row.market_ids) : [],
		marketQuestion: row.market_question,
		initialCapital: row.initial_capital,
		startDate: row.start_date,
		endDate: row.end_date,
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
		createdAt: row.created_at,
		// Parse equity curve for list view
		equityCurve: row.equity_curve ? JSON.parse(row.equity_curve) : [],
		// These will be loaded separately when viewing details
		tradesData: [],
		pnlDistribution: {},
		entryType: '',
		entryConfig: {},
		positionSizingType: '',
		positionSizingValue: 0,
		useTrailingStop: false,
		usePartialExits: false
	}));
}

/**
 * Get full strategy details including trades data
 */
export async function getStrategyById(
	db: D1Database,
	strategyId: number,
	userId: number
): Promise<BacktestStrategy | null> {
	const result = await db
		.prepare(
			`SELECT * FROM backtest_strategies
			WHERE id = ? AND user_id = ?`
		)
		.bind(strategyId, userId)
		.first();

	if (!result) return null;

	return {
		id: result.id as number,
		userId: result.user_id as number,
		strategyName: result.strategy_name as string,
		marketIds: result.market_ids ? JSON.parse(result.market_ids as string) : [],
		marketQuestion: result.market_question as string,
		initialCapital: result.initial_capital as number,
		startDate: result.start_date as string,
		endDate: result.end_date as string,
		entryType: result.entry_type as string,
		entryConfig: JSON.parse(result.entry_config as string),
		positionSizingType: result.position_sizing_type as string,
		positionSizingValue: result.position_sizing_value as number,
		maxPositionSize: result.max_position_size as number | undefined,
		stopLoss: result.stop_loss as number | undefined,
		takeProfit: result.take_profit as number | undefined,
		timeBasedExit: result.time_based_exit as number | undefined,
		useTrailingStop: Boolean(result.use_trailing_stop),
		trailingStopConfig: result.trailing_stop_config
			? JSON.parse(result.trailing_stop_config as string)
			: undefined,
		usePartialExits: Boolean(result.use_partial_exits),
		partialExitsConfig: result.partial_exits_config
			? JSON.parse(result.partial_exits_config as string)
			: undefined,
		maxTradesPerDay: result.max_trades_per_day as number | undefined,
		tradeTimeStart: result.trade_time_start as string | undefined,
		tradeTimeEnd: result.trade_time_end as string | undefined,
		finalCapital: result.final_capital as number,
		totalReturnPercent: result.total_return_percent as number,
		totalTrades: result.total_trades as number,
		winningTrades: result.winning_trades as number,
		losingTrades: result.losing_trades as number,
		breakEvenTrades: result.break_even_trades as number,
		winRate: result.win_rate as number,
		avgWin: result.avg_win as number,
		avgLoss: result.avg_loss as number,
		largestWin: result.largest_win as number,
		largestLoss: result.largest_loss as number,
		profitFactor: result.profit_factor as number | undefined,
		sharpeRatio: result.sharpe_ratio as number | undefined,
		maxDrawdown: result.max_drawdown as number | undefined,
		avgTradeDuration: result.avg_trade_duration as number | undefined,
		tradesData: result.trades_data ? JSON.parse(result.trades_data as string) : [],
		equityCurve: result.equity_curve && result.equity_curve !== '[]' ? JSON.parse(result.equity_curve as string) : [],
		pnlDistribution: result.pnl_distribution && result.pnl_distribution !== '{}' ? JSON.parse(result.pnl_distribution as string) : {},
		createdAt: result.created_at as string
	};
}

/**
 * Delete a strategy
 */
export async function deleteStrategy(
	db: D1Database,
	strategyId: number,
	userId: number
): Promise<boolean> {
	const result = await db
		.prepare('DELETE FROM backtest_strategies WHERE id = ? AND user_id = ?')
		.bind(strategyId, userId)
		.run();

	return result.success;
}
