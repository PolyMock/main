/**
 * Mean reversion example strategies — mirrors the Python/Rust strategies.
 * Same logic, same function signatures.
 */

import type { RawTrade, TradeLogEntry, Action } from './engine';

type PortfolioSnapshot = { cash: number; positions: Record<string, number> };
type UserParams = Record<string, unknown>;

function hold(marketId: string): Action {
	return { market_id: marketId, position: 'hold', amount: 0 };
}

function posKey(marketId: string, position: string): string {
	return `${marketId}|${position}`;
}

// ── Strategy 1: Basic mean reversion ───────────────────────────────────────────

export function mean_reversion(
	trade: RawTrade, _tradeLog: TradeLogEntry[], _portfolio: PortfolioSnapshot, _params: UserParams,
): Action {
	const thresholdLow = 0.01;
	if ((trade.price ?? Infinity) <= thresholdLow) {
		return { market_id: trade.market_id, position: trade.position, amount: 10 };
	}
	return hold(trade.market_id);
}

// ── Strategy 2: Dynamic sizing from cash ───────────────────────────────────────

export function mean_reversion_with_portfolio_cash(
	trade: RawTrade, _tradeLog: TradeLogEntry[], portfolio: PortfolioSnapshot, _params: UserParams,
): Action {
	const thresholdLow = 0.01;
	if ((trade.price ?? Infinity) <= thresholdLow) {
		const amount = Math.floor(portfolio.cash / 100);
		return { market_id: trade.market_id, position: trade.position, amount };
	}
	return hold(trade.market_id);
}

// ── Strategy 3: No duplicate positions ─────────────────────────────────────────

export function mean_reversion_with_portfolio_positions(
	trade: RawTrade, _tradeLog: TradeLogEntry[], portfolio: PortfolioSnapshot, _params: UserParams,
): Action {
	const thresholdLow = 0.01;
	if ((trade.price ?? Infinity) <= thresholdLow) {
		const key = posKey(trade.market_id, trade.position);
		if (portfolio.positions[key]) return hold(trade.market_id);
		return { market_id: trade.market_id, position: trade.position, amount: 10 };
	}
	return hold(trade.market_id);
}

// ── Strategy 4: Buy only at better price ───────────────────────────────────────

export function mean_reversion_with_trade_log(
	trade: RawTrade, tradeLog: TradeLogEntry[], _portfolio: PortfolioSnapshot, _params: UserParams,
): Action {
	const thresholdLow = 0.01;
	if ((trade.price ?? Infinity) <= thresholdLow) {
		const tradesOnMarket = tradeLog.filter(
			(t) => t.market_id === trade.market_id && t.position === trade.position,
		);
		if (tradesOnMarket.length > 0) {
			const minPrice = Math.min(...tradesOnMarket.map((t) => t.cost / t.amount));
			if (trade.price < minPrice) {
				return { market_id: trade.market_id, position: trade.position, amount: 10 };
			}
			return hold(trade.market_id);
		}
		return { market_id: trade.market_id, position: trade.position, amount: 10 };
	}
	return hold(trade.market_id);
}

// ── Strategy 5: Cooldown (1 day between trades) ───────────────────────────────

export function mean_reversion_with_trade_log_time(
	trade: RawTrade, tradeLog: TradeLogEntry[], _portfolio: PortfolioSnapshot, params: UserParams,
): Action {
	const thresholdLow = 0.01;
	if ((trade.price ?? Infinity) <= thresholdLow) {
		const tradesOnMarket = tradeLog.filter(
			(t) => t.market_id === trade.market_id && t.position === trade.position,
		);
		if (tradesOnMarket.length > 0) {
			const latestTime = tradesOnMarket.reduce((max, t) => (t.time > max ? t.time : max), '');
			const diffMs = new Date(trade.timestamp).getTime() - new Date(latestTime).getTime();
			const diffDays = diffMs / (1000 * 60 * 60 * 24);
			if (diffDays > 1) {
				return { market_id: trade.market_id, position: trade.position, amount: 10, user_perso_parameters: params };
			}
			return { market_id: trade.market_id, position: 'hold', amount: 0, user_perso_parameters: params };
		}
		return { market_id: trade.market_id, position: trade.position, amount: 10, user_perso_parameters: params };
	}
	return { market_id: trade.market_id, position: 'hold', amount: 0, user_perso_parameters: params };
}

// ── Strategy 6: Scaled by exposure (trade count) ──────────────────────────────

export function mean_reversion_with_user_perso_parameter_internal(
	trade: RawTrade, _tradeLog: TradeLogEntry[], _portfolio: PortfolioSnapshot, params: UserParams,
): Action {
	const thresholdLow = 0.01;

	if (!params.trade_count) params.trade_count = {} as Record<string, number>;
	const tc = params.trade_count as Record<string, number>;
	tc[trade.market_id] = (tc[trade.market_id] || 0) + 1;
	const tradeCount = tc[trade.market_id];

	if ((trade.price ?? Infinity) <= thresholdLow) {
		const amount = Math.min(100, tradeCount);
		return { market_id: trade.market_id, position: trade.position, amount, user_perso_parameters: params };
	}
	return { market_id: trade.market_id, position: 'hold', amount: 0, user_perso_parameters: params };
}

// ── Strategy lookup ────────────────────────────────────────────────────────────

const STRATEGIES: Record<string, typeof mean_reversion> = {
	mean_reversion,
	mean_reversion_with_portfolio_cash,
	mean_reversion_with_portfolio_positions,
	mean_reversion_with_trade_log,
	mean_reversion_with_trade_log_time,
	mean_reversion_with_user_perso_parameter_internal,
};

export function getStrategy(name: string) {
	return STRATEGIES[name] ?? null;
}
