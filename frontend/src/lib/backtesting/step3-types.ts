/**
 * Type definitions for Step 3 (New Backtesting UI)
 */

// Filter parameters for /trades endpoint
export interface TradeFilters {
  page?: number;
  limit?: number;
  platform?: string[];
  strat_var?: boolean[] | null;
  timestamp_start?: string | null;
  timestamp_end?: string | null;
  market_id?: string[] | null;
  market_title?: string[] | null;
  market_category?: string[] | null;
  volume_inf?: number | null;
  volume_sup?: number | null;
  position?: string[] | null;
  possible_outcomes?: string[] | null;
  price_inf?: number;
  price_sup?: number;
  amount_inf?: number | null;
  amount_sup?: number | null;
  wallet_maker?: string[] | null;
  wallet_taker?: string[] | null;
}

// Single trade from /trades response
export interface Trade {
  platform: string;
  timestamp: string;
  title: string;
  volume?: number;
  market_id: string;
  category?: string;
  position: string;
  possible_outcomes?: string[];
  price: number;
  amount: number;
  wallet_maker?: string;
  wallet_taker?: string;
}

// Response from /trades endpoint
export interface TradesResponse {
  trades: Trade[];
  page: number;
  limit: number;
  total_trades: number;
  total_pages: number;
  platform: string;
}

// Response from /validate-strategy endpoint
export interface ValidationResponse {
  status: 'valid' | 'error';
  message: string;
}

// Strategy validation state
export interface ValidationStatus {
  isValid: boolean;
  message: string;
  isChecking: boolean;
}

// Backtest execution result
export interface BacktestResult {
  status: string;
  trades_executed: number;
  buy_count: number;
  sell_count: number;
  unique_markets_traded: number;
  final_cash: number;
  total_pnl: number;
  roi_percent: number;
  max_drawdown: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  volatility: number;
  downside_risk: number;
  total_positions_settled: number;
  winning_positions: number;
  losing_positions: number;
  execution_time_seconds: number;
  [key: string]: any;
}

// State for the entire Step 3 flow
export interface Step3State {
  // Step 1: Filters
  filters: TradeFilters;
  trades: Trade[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalTrades: number;
  };
  tradesLoading: boolean;
  tradesError: string | null;

  // Step 2: Code Editor
  strategyCode: string;
  validationStatus: ValidationStatus;

  // Step 3: Results
  backtestResult: any | null;
  isBacktestRunning: boolean;
  backTestError: string | null;
  backTestProgress: number;
}
