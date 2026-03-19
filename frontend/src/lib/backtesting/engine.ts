/**
 * Lightweight TypeScript backtest engine — mirrors the Python/Rust BacktestEngine.
 *
 * Runs a strategy function over chronologically-sorted trades, settles resolved
 * positions, and computes metrics.
 *
 * This is the LOCAL engine used by the SvelteKit API route. Later it will be
 * replaced by a call to the Rust engine running on a VM.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RawTrade {
	platform: string;
	timestamp: string;
	title: string;
	volume: number;
	market_id: string;
	market_category: string;
	position: string;
	possible_outcomes: string[];
	price: number;
	amount: number;
}

export interface TradeLogEntry {
	market_id: string;
	position: string;
	amount: number;
	cost: number;
	time: string;
}

export interface Portfolio {
	cash: number;
	positions: Map<string, number>; // key = "market_id|position"
}

export interface Action {
	market_id: string;
	position: string; // outcome name or "hold"
	amount: number;
	user_perso_parameters?: Record<string, unknown>;
}

export interface MarketOutcome {
	market_id: string;
	outcome: string | null; // winning outcome or null
	end_date: string;
}

export type StrategyFn = (
	trade: RawTrade,
	tradeLog: TradeLogEntry[],
	portfolio: { cash: number; positions: Record<string, number> },
	userPersoParameters: Record<string, unknown>,
) => Action;

export interface EngineResult {
	trades_executed: number;
	initial_cash: number;
	final_cash: number;
	total_pnl: number;
	roi_percent: number;
	trade_log: TradeLogEntry[];
	settle_log: Array<Record<string, unknown>>;
	open_positions: Record<string, number>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function posKey(marketId: string, position: string): string {
	return `${marketId}|${position}`;
}

// ── Engine ─────────────────────────────────────────────────────────────────────

export function runBacktest(
	trades: RawTrade[],
	outcomes: MarketOutcome[],
	strategyFn: StrategyFn,
	initialCash: number,
	reimburseOpenPositions: boolean,
	onProgress?: (pct: number, msg: string) => void,
): EngineResult {
	// Sort trades by timestamp
	trades.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

	// Build outcomes map: market_id → { outcome, end_date }
	const outcomeMap = new Map<string, { outcome: string | null; endDate: string }>();
	for (const o of outcomes) {
		outcomeMap.set(o.market_id, { outcome: o.outcome, endDate: o.end_date });
	}

	// Build set of valid market IDs
	const validMarketIds = new Set(trades.map((t) => t.market_id));

	// Build possible outcomes per market
	const marketOutcomesMap = new Map<string, string[]>();
	for (const t of trades) {
		if (!marketOutcomesMap.has(t.market_id)) {
			marketOutcomesMap.set(t.market_id, t.possible_outcomes);
		}
	}

	const portfolio: Portfolio = { cash: initialCash, positions: new Map() };
	const tradeLog: TradeLogEntry[] = [];
	const settleLog: Array<Record<string, unknown>> = [];
	const lastKnownPrice = new Map<string, number>();
	let userPersoParameters: Record<string, unknown> = {};

	const total = trades.length;
	const progressInterval = Math.max(1, Math.floor(total / 20)); // report ~20 times

	for (let idx = 0; idx < total; idx++) {
		const trade = trades[idx];

		// Progress callback
		if (onProgress && idx % progressInterval === 0) {
			const pct = Math.round(20 + (idx / total) * 70); // 20-90%
			onProgress(pct, `Processing trade ${idx + 1}/${total}`);
		}

		// Update rolling price
		lastKnownPrice.set(posKey(trade.market_id, trade.position), trade.price);

		// Settle resolved positions
		settleResolved(portfolio, outcomeMap, trade.timestamp, settleLog, lastKnownPrice);

		// Build portfolio snapshot for strategy (plain object, not Map)
		const posObj: Record<string, number> = {};
		for (const [k, v] of portfolio.positions) posObj[k] = v;

		// Call strategy
		const action = strategyFn(
			trade,
			tradeLog,
			{ cash: portfolio.cash, positions: posObj },
			userPersoParameters,
		);

		// Update user params
		if (action.user_perso_parameters) {
			userPersoParameters = action.user_perso_parameters;
		}

		// Validate
		if (!validMarketIds.has(action.market_id)) continue;
		if (action.position === 'hold') continue;

		const outcomes2 = marketOutcomesMap.get(action.market_id);
		if (outcomes2 && !outcomes2.includes(action.position)) continue;
		if (action.amount <= 0) continue;

		// Get last price
		const price = lastKnownPrice.get(posKey(action.market_id, action.position));
		if (price === undefined) continue;

		const cost = Math.round(action.amount * price * 1e6) / 1e6;
		if (cost > portfolio.cash) continue;

		// Execute
		portfolio.cash -= cost;
		const key = posKey(action.market_id, action.position);
		portfolio.positions.set(key, (portfolio.positions.get(key) || 0) + action.amount);

		tradeLog.push({
			market_id: action.market_id,
			position: action.position,
			amount: action.amount,
			cost,
			time: trade.timestamp,
		});
	}

	// Reimburse open positions
	if (reimburseOpenPositions) {
		for (const [key, amount] of portfolio.positions) {
			const price = lastKnownPrice.get(key);
			if (price !== undefined) {
				const refund = Math.round(amount * price * 1e6) / 1e6;
				portfolio.cash += refund;
				const [mid, pos] = key.split('|');
				settleLog.push({ market_id: mid, position: pos, amount, refund });
			}
		}
		portfolio.positions.clear();
	}

	const openPositions: Record<string, number> = {};
	for (const [k, v] of portfolio.positions) openPositions[k] = v;

	const totalPnl = portfolio.cash - initialCash;
	return {
		trades_executed: tradeLog.length,
		initial_cash: initialCash,
		final_cash: portfolio.cash,
		total_pnl: totalPnl,
		roi_percent: initialCash ? (totalPnl / initialCash) * 100 : 0,
		trade_log: tradeLog,
		settle_log: settleLog,
		open_positions: openPositions,
	};
}

function settleResolved(
	portfolio: Portfolio,
	outcomeMap: Map<string, { outcome: string | null; endDate: string }>,
	currentTimestamp: string,
	settleLog: Array<Record<string, unknown>>,
	lastKnownPrice: Map<string, number>,
) {
	const toSettle: Array<{ key: string; marketId: string; position: string; outcome: string | null }> = [];

	for (const [key] of portfolio.positions) {
		const [marketId, position] = key.split('|');
		const info = outcomeMap.get(marketId);
		if (!info) continue;
		if (currentTimestamp >= info.endDate) {
			toSettle.push({ key, marketId, position, outcome: info.outcome });
		}
	}

	for (const { key, marketId, position, outcome } of toSettle) {
		const amount = portfolio.positions.get(key) || 0;
		if (position === outcome) {
			// Winning side
			portfolio.cash += amount * 1.0;
			settleLog.push({
				market_id: marketId,
				position,
				amount,
				outcome,
				timestamp: currentTimestamp,
			});
		}
		portfolio.positions.delete(key);
	}
}
