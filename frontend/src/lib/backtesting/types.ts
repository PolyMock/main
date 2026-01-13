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

  // Time Constraints
  entryTimeConstraints?: {
    earliestEntry?: Date; // Don't enter before this time
    latestEntry?: Date;   // Don't enter after this time
  };

  // Trade Frequency Controls
  tradeFrequency?: {
    maxTradesPerDay?: number;
    cooldownHours?: number; // Minimum hours between trades
  };

  // Exit Rules
  exitRules: {
    resolveOnExpiry: boolean;
    stopLoss?: number; // percentage
    takeProfit?: number; // percentage
    maxHoldTime?: number; // hours

    // Trailing Stop Loss
    trailingStop?: {
      enabled: boolean;
      activationPercent?: number; // Activate after this % profit
      trailPercent?: number; // Trail by this %
    };

    // Partial Exits
    partialExits?: {
      enabled: boolean;
      takeProfit1?: { percent: number; sellPercent: number }; // At +X%, sell Y%
      takeProfit2?: { percent: number; sellPercent: number }; // At +X%, sell remaining
    };
  };

  // Position Sizing
  positionSizing: {
    type: 'FIXED' | 'PERCENTAGE';
    fixedAmount?: number; // USDC
    percentageOfBankroll?: number; // 1-100
    maxExposurePercent?: number; // Max % of capital in market
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
  status: 'OPEN' | 'CLOSED' | 'PARTIAL';

  // Enhanced entry/exit tracking
  entryReason: 'PRICE_THRESHOLD' | 'MARKET_ENTRY';
  exitReason?: 'RESOLUTION' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MAX_HOLD_TIME' | 'TRAILING_STOP' | 'PARTIAL_EXIT_1' | 'PARTIAL_EXIT_2';

  // Time and capital metrics
  holdingDuration?: number; // hours
  capitalAllocation: number; // % of bankroll at entry
  peakPnlPercentage?: number; // Highest PnL achieved before exit (for trailing stop tracking)

  // Partial exit tracking
  originalShares?: number; // If this is a partial exit, store original share count
  partialExitNumber?: number; // 1 or 2 to indicate which partial exit
}

export interface BacktestMetrics {
  // Basic Performance Metrics
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

  // Side-Based Performance
  yesPerformance: {
    count: number;
    winRate: number;
    pnl: number;
    avgWin: number;
    avgLoss: number;
  };
  noPerformance: {
    count: number;
    winRate: number;
    pnl: number;
    avgWin: number;
    avgLoss: number;
  };

  // Exit Reason Distribution
  exitReasonDistribution: {
    resolution: number;
    stopLoss: number;
    takeProfit: number;
    maxHoldTime: number;
    trailingStop: number;
    partialExits: number;
  };

  // Risk & Drawdown Metrics
  equityCurve: EquityPoint[];
  maxDrawdown: number;
  maxDrawdownPercentage: number;
  sharpeRatio: number;
  volatility: number;
  expectancy: number;
  profitFactor: number;

  // Trade Distribution
  medianWin: number;
  medianLoss: number;
  avgHoldTime: number; // hours
  medianHoldTime: number; // hours
  capitalUtilization: number; // percentage
  avgCapitalAllocation: number; // percentage

  // Streak Analysis
  consecutiveWins: number;
  consecutiveLosses: number;
  longestWinStreak: number;
  longestLossStreak: number;

  // Time-Series Outputs
  dailyPnl: DailyPnlPoint[];
  drawdownCurve: DrawdownPoint[];
  capitalUtilizationOverTime: CapitalUtilizationPoint[];
}

export interface EquityPoint {
  timestamp: Date;
  equity: number;
  drawdown: number;
  drawdownPercentage: number;
}

export interface DailyPnlPoint {
  date: Date;
  dailyPnl: number;
  cumulativePnl: number;
  tradesCount: number;
}

export interface DrawdownPoint {
  timestamp: Date;
  drawdown: number;
  drawdownPercentage: number;
  inDrawdown: boolean;
}

export interface CapitalUtilizationPoint {
  timestamp: Date;
  capitalInUse: number;
  utilizationPercentage: number;
  openPositions: number;
}

export interface BacktestResult {
  strategyConfig: StrategyConfig;
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
  startingCapital: number;
  endingCapital: number;
  marketsAnalyzed: number;
  executionTime: number; // ms
  debugInfo?: {
    marketsProcessed: number;
    marketsWithData: number;
    totalCandlesticks: number;
    validCandlesticks: number;
    entryAttempts: number;
    reasons: string[];
  };
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
