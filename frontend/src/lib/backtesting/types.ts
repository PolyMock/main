/**
 * Backtesting Engine Type Definitions
 */

export interface StrategyConfig {
  // Market Filters
  specificMarket?: {
    conditionId?: string;
    marketSlug?: string;
  };
  categories?: string[];
  minLiquidity?: number;
  maxLiquidity?: number;
  minTimeToResolution?: number; // hours
  maxTimeToResolution?: number; // hours

  // Entry Rules
  entryType: 'YES' | 'NO' | 'BOTH';
  entryPriceThreshold?: {
    yes?: { min?: number; max?: number };
    no?: { min?: number; max?: number };
  };

  // Exit Rules
  exitRules: {
    resolveOnExpiry: boolean;
    stopLoss?: number; // percentage
    takeProfit?: number; // percentage
    maxHoldTime?: number; // hours
  };

  // Position Sizing
  positionSizing: {
    type: 'FIXED' | 'PERCENTAGE';
    fixedAmount?: number; // USDC
    percentageOfBankroll?: number; // 1-100
  };

  // Backtest Parameters
  startDate: Date;
  endDate: Date;
  initialBankroll: number;
}

export interface BacktestTrade {
  id: string;
  marketId: string;
  marketName: string;
  conditionId: string;
  entryTime: Date;
  exitTime?: Date;
  side: 'YES' | 'NO';
  entryPrice: number;
  exitPrice: number;
  shares: number;
  amountInvested: number;
  pnl: number;
  pnlPercentage: number;
  fees: number;
  status: 'OPEN' | 'CLOSED';
  exitReason?: 'RESOLUTION' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MAX_HOLD_TIME';
}

export interface BacktestMetrics {
  // Free Tier Metrics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalFees: number;
  netPnl: number;
  roi: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  yesPerformance: {
    count: number;
    winRate: number;
    pnl: number;
  };
  noPerformance: {
    count: number;
    winRate: number;
    pnl: number;
  };

  // Pro Tier Metrics
  equityCurve: EquityPoint[];
  maxDrawdown: number;
  maxDrawdownPercentage: number;
  sharpeRatio: number;
  volatility: number;
  expectancy: number;
  medianWin: number;
  medianLoss: number;
  avgHoldTime: number; // hours
  capitalUtilization: number; // percentage
  consecutiveWins: number;
  consecutiveLosses: number;
  profitFactor: number;
}

export interface EquityPoint {
  timestamp: Date;
  equity: number;
  drawdown: number;
  drawdownPercentage: number;
}

export interface BacktestResult {
  strategyConfig: StrategyConfig;
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
  startingCapital: number;
  endingCapital: number;
  marketsAnalyzed: number;
  executionTime: number; // ms
}

export interface MarketSnapshot {
  marketId: string;
  conditionId: string;
  marketName: string;
  category: string;
  liquidity: number;
  yesPrice: number;
  noPrice: number;
  timestamp: Date;
  resolutionTime: Date;
  resolved: boolean;
  outcome?: 'YES' | 'NO' | 'INVALID';
}

export interface CachedMarketData {
  marketId: string;
  conditionId: string;
  candlesticks: Candlestick[];
  metadata: {
    name: string;
    category: string;
    resolutionTime: Date;
    outcome?: 'YES' | 'NO' | 'INVALID';
  };
  cachedAt: Date;
}

export interface Candlestick {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
