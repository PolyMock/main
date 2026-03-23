/**
 * API service for Step 3 Backtesting UI
 * Handles calls to the backtest engine API
 */

import type { TradeFilters, TradesResponse, ValidationResponse } from '$lib/backtesting/step3-types';

const BACKTEST_API_URL = 'https://backtest-engine-api.fly.dev';

/**
 * Fetch trades with filters and pagination
 */
export async function fetchTrades(
  filters: TradeFilters,
  page: number = 1,
  limit: number = 100
): Promise<TradesResponse> {
  const requestBody = {
    ...filters,
    page,
    limit,
  };

  const response = await fetch(`${BACKTEST_API_URL}/trades`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || `Failed to fetch trades: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Validate strategy code syntax and security
 */
export async function validateStrategy(strategyCode: string): Promise<ValidationResponse> {
  const response = await fetch(`${BACKTEST_API_URL}/validate-strategy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy_code: strategyCode }),
  });

  if (!response.ok) {
    const error = await response.json();
    return {
      status: 'error',
      message: error.error || error.detail || `Validation failed: ${response.statusText}`,
    };
  }

  return response.json();
}

/**
 * Run a backtest with the given strategy code and filters
 * Returns the backtest results
 */
export async function runBacktest(
  strategyCode: string,
  filters: TradeFilters,
  initialCash: number = 10000,
  reimburseOpenPositions: boolean = false,
  signal?: AbortSignal
) {
  const requestBody = {
    strategy_code: strategyCode,
    initial_cash: initialCash,
    platform: filters.platform || ['polymarket'],
    reimburse_open_positions: reimburseOpenPositions,
    strat_var: filters.strat_var || [true, true, true, true, true, true, true, true, true, true, true, true],
    timestamp_start: filters.timestamp_start || null,
    timestamp_end: filters.timestamp_end || null,
    market_id: filters.market_id || null,
    market_title: filters.market_title || null,
    market_category: filters.market_category || null,
    volume_inf: filters.volume_inf || null,
    volume_sup: filters.volume_sup || null,
    position: filters.position || null,
    possible_outcomes: filters.possible_outcomes || null,
    price_inf: filters.price_inf || 0.0,
    price_sup: filters.price_sup || 1.0,
    amount_inf: filters.amount_inf || null,
    amount_sup: filters.amount_sup || null,
    wallet_maker: filters.wallet_maker || null,
    wallet_taker: filters.wallet_taker || null,
  };

  const response = await fetch(`${BACKTEST_API_URL}/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || `Backtest execution failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get example strategy and parameter documentation
 */
export async function getExampleStrategy() {
  const response = await fetch(`${BACKTEST_API_URL}/strategies/example`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch example strategy');
  }

  return response.json();
}
