/**
 * Core Backtesting Engine
 * Replays historical market data and simulates trades based on strategy rules
 */

import type {
  StrategyConfig,
  BacktestTrade,
  BacktestMetrics,
  BacktestResult,
  Candlestick,
  EquityPoint,
  DailyPnlPoint,
  DrawdownPoint,
  CapitalUtilizationPoint
} from './types';
import { DomeApiClient } from './domeApiClient';

export class BacktestEngine {
  private domeClient: DomeApiClient;
  private trades: BacktestTrade[] = [];
  private openPositions: Map<string, BacktestTrade> = new Map();
  private equityCurve: EquityPoint[] = [];
  private currentCapital: number = 0;
  private initialBankroll: number = 0;

  // Trade frequency tracking
  private lastTradeTime: Date | null = null;
  private tradesPerDay: Map<string, number> = new Map(); // dateString -> count

  private debugInfo: {
    marketsProcessed: number;
    marketsWithData: number;
    totalCandlesticks: number;
    validCandlesticks: number;
    entryAttempts: number;
    reasons: string[];
  } = {
    marketsProcessed: 0,
    marketsWithData: 0,
    totalCandlesticks: 0,
    validCandlesticks: 0,
    entryAttempts: 0,
    reasons: []
  };

  constructor(apiKey: string) {
    this.domeClient = new DomeApiClient(apiKey);
  }

  /**
   * Main backtest execution
   */
  async runBacktest(config: StrategyConfig): Promise<BacktestResult> {
    const startTime = Date.now();

    // Reset state
    this.trades = [];
    this.openPositions = new Map();
    this.equityCurve = [];
    this.currentCapital = config.initialBankroll;
    this.initialBankroll = config.initialBankroll;
    this.lastTradeTime = null;
    this.tradesPerDay = new Map();
    this.debugInfo = {
      marketsProcessed: 0,
      marketsWithData: 0,
      totalCandlesticks: 0,
      validCandlesticks: 0,
      entryAttempts: 0,
      reasons: []
    };

    // Fetch markets in the date range
    const markets = await this.fetchRelevantMarkets(config);

    if (markets.length === 0) {
      return {
        strategyConfig: config,
        trades: [],
        metrics: this.calculateMetrics(config.initialBankroll),
        startingCapital: config.initialBankroll,
        endingCapital: config.initialBankroll,
        marketsAnalyzed: 0,
        executionTime: Date.now() - startTime
      };
    }

    // Process each market chronologically
    for (const market of markets) {
      this.debugInfo.marketsProcessed++;
      await this.processMarket(market, config);
    }

    // Close any remaining open positions at end date
    this.closeAllPositions(config.endDate, 'RESOLUTION');

    // Calculate metrics
    const metrics = this.calculateMetrics(config.initialBankroll);

    const executionTime = Date.now() - startTime;

    return {
      strategyConfig: config,
      trades: this.trades,
      metrics,
      startingCapital: config.initialBankroll,
      endingCapital: this.currentCapital,
      marketsAnalyzed: markets.length,
      executionTime,
      debugInfo: this.debugInfo
    };
  }

  /**
   * Fetch markets that match strategy filters
   */
  private async fetchRelevantMarkets(config: StrategyConfig): Promise<any[]> {
    // If specific market is targeted, create a synthetic market object
    // We don't need full market metadata 
    if (config.specificMarket?.conditionId) {

      // Create a minimal market object - the actual data will come from candlesticks
      const syntheticMarket = {
        market_id: config.specificMarket.conditionId,
        condition_id: config.specificMarket.conditionId,
        question: config.specificMarket.conditionId,
        title: config.specificMarket.conditionId,
        end_time: Math.floor(config.endDate.getTime() / 1000),
        end_date_iso: config.endDate.toISOString(),
        outcome: undefined // Will be determined from candlestick data if available
      };

      return [syntheticMarket];
    }

    // If market slug is provided, try to find it
    if (config.specificMarket?.marketSlug) {
      const allMarkets: any[] = [];
      let offset = 0;
      const limit = 100;

      // Fetch markets and find the specific one
      while (true) {
        const batch = await this.domeClient.getMarkets({
          startDate: config.startDate,
          endDate: config.endDate,
          limit,
          offset,
          status: 'closed' // Only backtest closed markets
        });

        if (batch.length === 0) break;

        // Look for the specific market
        const specificMarket = batch.find((market: any) => {
          return market.market_slug === config.specificMarket!.marketSlug;
        });

        if (specificMarket) {
          return [specificMarket];
        }

        offset += limit;
        if (offset >= 500) break; // Safety limit
      }

      return [];
    }

    // Otherwise, fetch all markets matching filters
    const allMarkets: any[] = [];
    let offset = 0;
    const limit = 100;

    // Fetch markets in batches
    while (true) {
      const batch = await this.domeClient.getMarkets({
        startDate: config.startDate,
        endDate: config.endDate,
        limit,
        offset,
        status: 'closed' // Only backtest closed markets
      });

      if (batch.length === 0) break;

      allMarkets.push(...batch);
      offset += limit;

      // Limit total markets for performance
      if (allMarkets.length >= 500) break;
    }

    // Apply filters
    return allMarkets.filter(market => {
      // Category filter
      if (config.categories && config.categories.length > 0) {
        const marketCategory = market.category || (market.tags && market.tags[0]) || '';
        if (!config.categories.includes(marketCategory)) return false;
      }

      // Liquidity filter (use volume_total, volume, or liquidity)
      const liquidityValue = market.liquidity || market.volume_total || market.volume || 0;
      if (config.minLiquidity && liquidityValue < config.minLiquidity) return false;
      if (config.maxLiquidity && liquidityValue > config.maxLiquidity) return false;

      // Time to resolution filter
      const resolutionTime = market.end_time
        ? new Date(market.end_time * 1000)
        : new Date(market.end_date_iso);
      const marketStartTime = config.startDate;
      const hoursToResolution = (resolutionTime.getTime() - marketStartTime.getTime()) / (1000 * 60 * 60);

      if (config.minTimeToResolution && hoursToResolution < config.minTimeToResolution) return false;
      if (config.maxTimeToResolution && hoursToResolution > config.maxTimeToResolution) return false;

      return true;
    });
  }

  /**
   * Process a single market: fetch historical data and simulate trades
   */
  private async processMarket(market: any, config: StrategyConfig): Promise<void> {
    try {

      // Calculate date range and choose appropriate interval
      const rangeDays = (config.endDate.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24);

      // Choose interval based on range (respecting API limits)
      // Start with hourly data for better granularity unless range is too long
      let interval: 1 | 60 | 1440;
      let intervalLabel: string;

      if (rangeDays <= 7) {
        interval = 60; // Use hourly for up to 1 week (was 1 minute, but that's often too granular)
        intervalLabel = '1 hour';
      } else if (rangeDays <= 30) {
        interval = 60; // 1 hour for up to 1 month
        intervalLabel = '1 hour';
      } else {
        interval = 1440; // 1 day for longer than 1 month
        intervalLabel = '1 day';
      }


      // Try to fetch candlestick data, with fallback to larger intervals if no data
      let candlesticks = await this.domeClient.getCandlesticks(
        market.condition_id,
        interval,
        config.startDate,
        config.endDate
      );

      // If no data with current interval and it's not daily yet, try daily
      if (candlesticks.length === 0 && interval !== 1440) {
        candlesticks = await this.domeClient.getCandlesticks(
          market.condition_id,
          1440,
          config.startDate,
          config.endDate
        );
      }

      this.debugInfo.totalCandlesticks += candlesticks.length;

      if (candlesticks.length === 0) {
        this.debugInfo.reasons.push(`Market ${market.condition_id}: No candlestick data`);
        return;
      }

      this.debugInfo.marketsWithData++;

      // Log sample candlesticks for debugging
      if (candlesticks.length > 0) {
        const first = candlesticks[0];
        const last = candlesticks[candlesticks.length - 1];
          timestamp: first.timestamp.toISOString(),
          close: first.close,
          volume: first.volume
        });
          timestamp: last.timestamp.toISOString(),
          close: last.close,
          volume: last.volume
        });
        
        // Check price range
        const prices = candlesticks.map(c => c.close).filter(p => p > 0 && p <= 1);
        if (prices.length > 0) {
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        }
      }

      // Replay market tick by tick
      let entryAttempts = 0;
      let invalidCandles = 0;
      let processedCandles = 0;
      
        entryType: config.entryType,
        entryPriceThreshold: JSON.stringify(config.entryPriceThreshold),
        positionSizing: config.positionSizing,
        currentCapital: this.currentCapital
      });
      
      for (let i = 0; i < candlesticks.length; i++) {
        const candle = candlesticks[i];

        // Validate candle has valid price
        if (!candle.close || candle.close <= 0 || candle.close > 1) {
          invalidCandles++;
          if (invalidCandles <= 3) { // Only log first few invalid candles
          }
          continue;
        }
        
        processedCandles++;
        
        // Log first valid candle for debugging
        if (processedCandles === 1) {
        }

        // Check exit conditions for open positions
        this.checkExitConditions(market, candle, config);

        // Check entry conditions
        const marketKey = market.market_id || market.condition_id;
        const hadPosition = this.openPositions.has(marketKey);
        this.checkEntryConditions(market, candle, candlesticks, i, config);
        const hasPositionNow = this.openPositions.has(marketKey);
        
        if (!hadPosition && hasPositionNow) {
          entryAttempts++;
        }

        // Record equity point
        this.recordEquityPoint(candle.timestamp);
      }

      this.debugInfo.validCandlesticks += processedCandles;
      this.debugInfo.entryAttempts += entryAttempts;
      
      if (entryAttempts > 0) {
      } else {
        const firstValidPrice = processedCandles > 0 ? candlesticks.find(c => c.close > 0 && c.close <= 1)?.close : null;
        const debugMsg = `Market ${market.condition_id}: No entries - validCandles=${processedCandles}, firstPrice=${firstValidPrice?.toFixed(4) || 'N/A'}, entryType=${config.entryType}, thresholds=${JSON.stringify(config.entryPriceThreshold)}`;
        this.debugInfo.reasons.push(debugMsg);
      }

      // Close position if market resolved
      if (market.outcome) {
        const resolutionTime = market.end_date_iso ? new Date(market.end_date_iso) : config.endDate;
        const marketKey = market.market_id || market.condition_id;
        this.closePositionForMarket(marketKey, resolutionTime, market.outcome, 'RESOLUTION');
      }

    } catch (error) {
    }
  }

  /**
   * Check if strategy entry conditions are met
   */
  private checkEntryConditions(
    market: any,
    candle: Candlestick,
    _allCandles: Candlestick[],
    _currentIndex: number,
    config: StrategyConfig
  ): void {
    const marketKey = market.market_id || market.condition_id;

    // Don't enter if already have position in this market
    if (this.openPositions.has(marketKey)) {
      return;
    }

    // Check entry time constraints
    if (config.entryTimeConstraints) {
      if (config.entryTimeConstraints.earliestEntry && candle.timestamp < config.entryTimeConstraints.earliestEntry) {
        return; // Too early to enter
      }
      if (config.entryTimeConstraints.latestEntry && candle.timestamp > config.entryTimeConstraints.latestEntry) {
        return; // Too late to enter
      }
    }

    // Check trade frequency controls
    if (config.tradeFrequency) {
      // Check cooldown period
      if (config.tradeFrequency.cooldownHours && this.lastTradeTime) {
        const hoursSinceLastTrade = (candle.timestamp.getTime() - this.lastTradeTime.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastTrade < config.tradeFrequency.cooldownHours) {
          return; // Still in cooldown period
        }
      }

      // Check max trades per day
      if (config.tradeFrequency.maxTradesPerDay) {
        const dateKey = candle.timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
        const todayTrades = this.tradesPerDay.get(dateKey) || 0;
        if (todayTrades >= config.tradeFrequency.maxTradesPerDay) {
          return; // Max trades per day reached
        }
      }
    }

    // Check if we have enough capital
    const positionSize = this.calculatePositionSize(config);
    if (positionSize > this.currentCapital) {
      return;
    }

    // Check max exposure
    if (config.positionSizing.maxExposurePercent) {
      const currentExposure = this.calculateCurrentExposure();
      const newExposurePercent = ((currentExposure + positionSize) / this.initialBankroll) * 100;
      if (newExposurePercent > config.positionSizing.maxExposurePercent) {
        return; // Would exceed max exposure
      }
    }

    const yesPrice = candle.close;
    const noPrice = 1 - candle.close;

    // Validate prices are in valid range
    if (yesPrice <= 0 || yesPrice >= 1 || noPrice <= 0 || noPrice >= 1) {
      return;
    }

    // Check YES entry
    if (config.entryType === 'YES' || config.entryType === 'BOTH') {
      const shouldEnter = this.shouldEnterYes(yesPrice, config);
      
      if (shouldEnter) {
        this.openPosition(market, candle, 'YES', positionSize, config);
        return; // Only enter one side at a time
      }
    }

    // Check NO entry
    if (config.entryType === 'NO' || config.entryType === 'BOTH') {
      const shouldEnter = this.shouldEnterNo(noPrice, config);
      
      if (shouldEnter) {
        this.openPosition(market, candle, 'NO', positionSize, config);
      }
    }
  }

  /**
   * Check if YES entry conditions are met
   */
  private shouldEnterYes(yesPrice: number, config: StrategyConfig): boolean {
    const threshold = config.entryPriceThreshold?.yes;
    
    // If no threshold object exists, allow entry (default behavior)
    if (!threshold) {
      return true;
    }

    // If threshold object exists but has no min/max values (empty object after JSON serialization)
    // or both are undefined/null, allow entry
    const hasMin = threshold.min !== undefined && threshold.min !== null;
    const hasMax = threshold.max !== undefined && threshold.max !== null;
    
    if (!hasMin && !hasMax) {
      return true; // No restrictions
    }

    // Check min threshold
    if (hasMin && yesPrice < threshold.min!) {
      return false;
    }

    // Check max threshold
    if (hasMax && yesPrice > threshold.max!) {
      return false;
    }

    return true;
  }

  /**
   * Check if NO entry conditions are met
   */
  private shouldEnterNo(noPrice: number, config: StrategyConfig): boolean {
    const threshold = config.entryPriceThreshold?.no;
    
    // If no threshold object exists, allow entry (default behavior)
    if (!threshold) {
      return true;
    }

    // If threshold object exists but has no min/max values (empty object after JSON serialization)
    // or both are undefined/null, allow entry
    const hasMin = threshold.min !== undefined && threshold.min !== null;
    const hasMax = threshold.max !== undefined && threshold.max !== null;
    
    if (!hasMin && !hasMax) {
      return true; // No restrictions
    }

    // Check min threshold
    if (hasMin && noPrice < threshold.min!) {
      return false;
    }

    // Check max threshold
    if (hasMax && noPrice > threshold.max!) {
      return false;
    }

    return true;
  }

  /**
   * Open a new position
   */
  private openPosition(
    market: any,
    candle: Candlestick,
    side: 'YES' | 'NO',
    amountUsdc: number,
    config: StrategyConfig
  ): void {
    const marketKey = market.market_id || market.condition_id;
    const price = side === 'YES' ? candle.close : (1 - candle.close);
    const shares = amountUsdc / price;
    const fees = amountUsdc * 0.02; // 2% fee estimate

    // Determine entry reason
    const hasThreshold = config.entryPriceThreshold &&
      ((side === 'YES' && config.entryPriceThreshold.yes) ||
       (side === 'NO' && config.entryPriceThreshold.no));
    const entryReason: 'PRICE_THRESHOLD' | 'MARKET_ENTRY' = hasThreshold ? 'PRICE_THRESHOLD' : 'MARKET_ENTRY';

    // Calculate capital allocation percentage
    const capitalAllocation = (amountUsdc / this.initialBankroll) * 100;

    const trade: BacktestTrade = {
      id: `${marketKey}-${candle.timestamp.getTime()}`,
      marketId: marketKey,
      marketName: market.title || market.question || market.condition_id,
      conditionId: market.condition_id,
      entryTime: candle.timestamp,
      side,
      entryPrice: price,
      exitPrice: 0,
      shares,
      amountInvested: amountUsdc,
      pnl: 0,
      pnlPercentage: 0,
      fees,
      status: 'OPEN',
      entryReason,
      capitalAllocation,
      peakPnlPercentage: 0
    };

    this.openPositions.set(marketKey, trade);
    this.currentCapital -= (amountUsdc + fees);

    // Update trade frequency tracking
    this.lastTradeTime = candle.timestamp;
    const dateKey = candle.timestamp.toISOString().split('T')[0];
    this.tradesPerDay.set(dateKey, (this.tradesPerDay.get(dateKey) || 0) + 1);

  }

  /**
   * Check exit conditions for all open positions
   */
  private checkExitConditions(market: any, candle: Candlestick, config: StrategyConfig): void {
    const marketKey = market.market_id || market.condition_id;
    const position = this.openPositions.get(marketKey);
    if (!position) return;

    const currentPrice = position.side === 'YES' ? candle.close : (1 - candle.close);
    const currentValue = position.shares * currentPrice;
    const pnl = currentValue - position.amountInvested;
    const pnlPercentage = (pnl / position.amountInvested) * 100;

    // Update peak PnL for trailing stop tracking
    if (position.peakPnlPercentage === undefined || pnlPercentage > position.peakPnlPercentage) {
      position.peakPnlPercentage = pnlPercentage;
    }

    // Check partial exits first (if enabled)
    if (config.exitRules.partialExits?.enabled) {
      const pe = config.exitRules.partialExits;

      // Partial exit 1
      if (pe.takeProfit1 && pnlPercentage >= pe.takeProfit1.percent && !position.partialExitNumber) {
        const sharesToSell = position.shares * (pe.takeProfit1.sellPercent / 100);
        this.partialExit(position, candle.timestamp, currentPrice, sharesToSell, 1, config);
        return;
      }

      // Partial exit 2
      if (pe.takeProfit2 && pnlPercentage >= pe.takeProfit2.percent && position.partialExitNumber === 1) {
        const sharesToSell = position.shares * (pe.takeProfit2.sellPercent / 100);
        this.partialExit(position, candle.timestamp, currentPrice, sharesToSell, 2, config);
        return;
      }
    }

    // Trailing stop loss (check if activated and triggered)
    if (config.exitRules.trailingStop?.enabled &&
        config.exitRules.trailingStop.activationPercent !== undefined &&
        config.exitRules.trailingStop.trailPercent !== undefined) {
      const activationPercent = config.exitRules.trailingStop.activationPercent;
      const trailPercent = config.exitRules.trailingStop.trailPercent;

      // Check if trailing stop is activated (reached activation profit)
      if (position.peakPnlPercentage !== undefined && position.peakPnlPercentage >= activationPercent) {
        // Check if current PnL has dropped by trail percent from peak
        const dropFromPeak = position.peakPnlPercentage - pnlPercentage;
        if (dropFromPeak >= trailPercent) {
          this.closePosition(position, candle.timestamp, currentPrice, 'TRAILING_STOP');
          return;
        }
      }
    }

    // Stop loss
    if (config.exitRules.stopLoss && pnlPercentage <= -config.exitRules.stopLoss) {
      this.closePosition(position, candle.timestamp, currentPrice, 'STOP_LOSS');
      return;
    }

    // Take profit (only if not using partial exits)
    if (config.exitRules.takeProfit && pnlPercentage >= config.exitRules.takeProfit && !config.exitRules.partialExits?.enabled) {
      this.closePosition(position, candle.timestamp, currentPrice, 'TAKE_PROFIT');
      return;
    }

    // Max hold time
    if (config.exitRules.maxHoldTime) {
      const holdTime = (candle.timestamp.getTime() - position.entryTime.getTime()) / (1000 * 60 * 60);
      if (holdTime >= config.exitRules.maxHoldTime) {
        this.closePosition(position, candle.timestamp, currentPrice, 'MAX_HOLD_TIME');
        return;
      }
    }
  }

  /**
   * Partially exit a position
   */
  private partialExit(
    position: BacktestTrade,
    exitTime: Date,
    exitPrice: number,
    sharesToSell: number,
    exitNumber: 1 | 2,
    _config: StrategyConfig
  ): void {
    // Create a trade record for this partial exit
    const exitValue = sharesToSell * exitPrice;
    const exitFees = exitValue * 0.02;
    const netExitValue = exitValue - exitFees;

    const partialExitTrade: BacktestTrade = {
      ...position,
      id: `${position.id}-partial-${exitNumber}`,
      exitTime,
      exitPrice,
      shares: sharesToSell,
      originalShares: position.originalShares || position.shares,
      partialExitNumber: exitNumber,
      status: 'CLOSED' as const,
      exitReason: (exitNumber === 1 ? 'PARTIAL_EXIT_1' : 'PARTIAL_EXIT_2') as any
    };

    // Calculate PnL for this partial exit
    const proportionalInvestment = (sharesToSell / position.shares) * position.amountInvested;
    const proportionalEntryFees = (sharesToSell / position.shares) * position.fees;
    const totalCost = proportionalInvestment + proportionalEntryFees;
    partialExitTrade.pnl = netExitValue - totalCost;
    partialExitTrade.pnlPercentage = (partialExitTrade.pnl / proportionalInvestment) * 100;
    partialExitTrade.amountInvested = proportionalInvestment;
    partialExitTrade.fees = proportionalEntryFees + exitFees;

    // Calculate holding duration
    partialExitTrade.holdingDuration = (exitTime.getTime() - position.entryTime.getTime()) / (1000 * 60 * 60);

    // Add to trades list
    this.trades.push(partialExitTrade);
    this.currentCapital += netExitValue;

    // Update the original position (reduce shares)
    position.shares -= sharesToSell;
    position.status = 'PARTIAL' as const;
    if (!position.originalShares) {
      position.originalShares = position.shares + sharesToSell;
    }
    position.partialExitNumber = exitNumber;

  }

  /**
   * Close a position
   */
  private closePosition(
    position: BacktestTrade,
    exitTime: Date,
    exitPrice: number,
    exitReason: 'RESOLUTION' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MAX_HOLD_TIME' | 'TRAILING_STOP'
  ): void {
    const exitValue = position.shares * exitPrice;
    const exitFees = exitValue * 0.02; // 2% fee
    const netExitValue = exitValue - exitFees;

    position.exitTime = exitTime;
    position.exitPrice = exitPrice;

    // IMPORTANT: PnL must account for BOTH entry and exit fees
    // Entry fees were already deducted from capital when opening the position
    // So total cost = amountInvested + entryFees
    const totalCost = position.amountInvested + position.fees; // position.fees contains entry fees
    position.pnl = netExitValue - totalCost; // Net PnL after all fees
    position.pnlPercentage = (position.pnl / position.amountInvested) * 100;
    position.fees += exitFees; // Add exit fees to total fees
    position.status = 'CLOSED';
    position.exitReason = exitReason;

    // Calculate holding duration
    position.holdingDuration = (exitTime.getTime() - position.entryTime.getTime()) / (1000 * 60 * 60);

    this.currentCapital += netExitValue;
    this.trades.push(position);
    this.openPositions.delete(position.marketId);

  }

  /**
   * Close position when market resolves
   */
  private closePositionForMarket(
    marketId: string,
    exitTime: Date,
    outcome: string,
    exitReason: 'RESOLUTION'
  ): void {
    const position = this.openPositions.get(marketId);
    if (!position) return;

    // Determine exit price based on outcome
    let exitPrice = 0;
    if (outcome.toUpperCase() === position.side) {
      exitPrice = 1.0; // Won
    } else if (outcome.toUpperCase() === 'INVALID') {
      exitPrice = position.entryPrice; // Refund
    } else {
      exitPrice = 0; // Lost
    }

    this.closePosition(position, exitTime, exitPrice, exitReason);
  }

  /**
   * Close all open positions (at end of backtest)
   */
  private closeAllPositions(exitTime: Date, exitReason: 'RESOLUTION'): void {
    for (const position of this.openPositions.values()) {
      // Close at current price (market still unresolved)
      this.closePosition(position, exitTime, position.entryPrice, exitReason);
    }
  }

  /**
   * Calculate position size based on strategy config
   */
  private calculatePositionSize(config: StrategyConfig): number {
    if (config.positionSizing.type === 'FIXED') {
      return config.positionSizing.fixedAmount || 100;
    } else {
      const percentage = config.positionSizing.percentageOfBankroll || 5;
      return this.currentCapital * (percentage / 100);
    }
  }

  /**
   * Calculate current exposure (capital in open positions)
   */
  private calculateCurrentExposure(): number {
    let exposure = 0;
    for (const position of this.openPositions.values()) {
      exposure += position.amountInvested;
    }
    return exposure;
  }

  /**
   * Record equity curve point
   */
  private recordEquityPoint(timestamp: Date): void {
    // Calculate total equity (capital + open positions value)
    let openPositionsValue = 0;
    for (const position of this.openPositions.values()) {
      openPositionsValue += position.amountInvested; // Simplified: use entry value
    }

    const totalEquity = this.currentCapital + openPositionsValue;
    const peak = Math.max(...this.equityCurve.map(p => p.equity), totalEquity);
    const drawdown = peak - totalEquity;
    const drawdownPercentage = peak > 0 ? (drawdown / peak) * 100 : 0;

    this.equityCurve.push({
      timestamp,
      equity: totalEquity,
      drawdown,
      drawdownPercentage
    });
  }

  /**
   * Calculate comprehensive metrics
   */
  private calculateMetrics(initialBankroll: number): BacktestMetrics {
    const closedTrades = this.trades.filter(t => t.status === 'CLOSED');
    const winningTrades = closedTrades.filter(t => t.pnl > 0);
    const losingTrades = closedTrades.filter(t => t.pnl < 0);

    const totalPnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalFees = closedTrades.reduce((sum, t) => sum + t.fees, 0);
    const netPnl = totalPnl;

    const totalWinAmount = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLossAmount = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

    // YES/NO performance
    const yesTrades = closedTrades.filter(t => t.side === 'YES');
    const noTrades = closedTrades.filter(t => t.side === 'NO');
    const yesWins = yesTrades.filter(t => t.pnl > 0);
    const yesLosses = yesTrades.filter(t => t.pnl < 0);
    const noWins = noTrades.filter(t => t.pnl > 0);
    const noLosses = noTrades.filter(t => t.pnl < 0);

    // Exit reason distribution
    const exitReasonDist = {
      resolution: closedTrades.filter(t => t.exitReason === 'RESOLUTION').length,
      stopLoss: closedTrades.filter(t => t.exitReason === 'STOP_LOSS').length,
      takeProfit: closedTrades.filter(t => t.exitReason === 'TAKE_PROFIT').length,
      maxHoldTime: closedTrades.filter(t => t.exitReason === 'MAX_HOLD_TIME').length,
      trailingStop: closedTrades.filter(t => t.exitReason === 'TRAILING_STOP').length,
      partialExits: closedTrades.filter(t => t.exitReason === 'PARTIAL_EXIT_1' || t.exitReason === 'PARTIAL_EXIT_2').length
    };

    // Pro metrics
    const maxDrawdown = Math.max(...this.equityCurve.map(p => p.drawdown), 0);
    const maxDrawdownPercentage = Math.max(...this.equityCurve.map(p => p.drawdownPercentage), 0);

    const returns = closedTrades.map(t => t.pnlPercentage / 100);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / (returns.length || 1);
    const volatility = this.calculateStdDev(returns, avgReturn) * 100;
    const sharpeRatio = volatility > 0 ? (avgReturn * 100) / volatility : 0;

    const expectancy = closedTrades.length > 0 ? totalPnl / closedTrades.length : 0;

    const medianWin = this.calculateMedian(winningTrades.map(t => t.pnl));
    const medianLoss = this.calculateMedian(losingTrades.map(t => Math.abs(t.pnl)));

    // Holding time metrics
    const holdTimes = closedTrades.map(t => t.holdingDuration || 0).filter(h => h > 0);
    const avgHoldTime = holdTimes.length > 0
      ? holdTimes.reduce((sum, h) => sum + h, 0) / holdTimes.length
      : 0;
    const medianHoldTime = this.calculateMedian(holdTimes);

    // Capital allocation metrics
    const capitalAllocations = closedTrades.map(t => t.capitalAllocation).filter(c => c > 0);
    const avgCapitalAllocation = capitalAllocations.length > 0
      ? capitalAllocations.reduce((sum, c) => sum + c, 0) / capitalAllocations.length
      : 0;

    // Calculate consecutive wins/losses and streaks
    let consecutiveWins = 0;
    let consecutiveLosses = 0;
    let longestWinStreak = 0;
    let longestLossStreak = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    for (const trade of closedTrades) {
      if (trade.pnl > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        consecutiveWins = Math.max(consecutiveWins, currentWinStreak);
        longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
      } else {
        currentLossStreak++;
        currentWinStreak = 0;
        consecutiveLosses = Math.max(consecutiveLosses, currentLossStreak);
        longestLossStreak = Math.max(longestLossStreak, currentLossStreak);
      }
    }

    // Time-series analytics
    const dailyPnl = this.calculateDailyPnl(closedTrades);
    const drawdownCurve = this.calculateDrawdownCurve();
    const capitalUtilizationOverTime = this.calculateCapitalUtilization();

    return {
      // Free metrics
      totalTrades: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0,
      totalPnl,
      totalFees,
      netPnl,
      roi: initialBankroll > 0 ? (netPnl / initialBankroll) * 100 : 0,
      avgWin: winningTrades.length > 0 ? totalWinAmount / winningTrades.length : 0,
      avgLoss: losingTrades.length > 0 ? totalLossAmount / losingTrades.length : 0,
      bestTrade: winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnl)) : 0,
      worstTrade: losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl)) : 0,
      yesPerformance: {
        count: yesTrades.length,
        winRate: yesTrades.length > 0 ? (yesWins.length / yesTrades.length) * 100 : 0,
        pnl: yesTrades.reduce((sum, t) => sum + t.pnl, 0),
        avgWin: yesWins.length > 0 ? yesWins.reduce((sum, t) => sum + t.pnl, 0) / yesWins.length : 0,
        avgLoss: yesLosses.length > 0 ? Math.abs(yesLosses.reduce((sum, t) => sum + t.pnl, 0)) / yesLosses.length : 0
      },
      noPerformance: {
        count: noTrades.length,
        winRate: noTrades.length > 0 ? (noWins.length / noTrades.length) * 100 : 0,
        pnl: noTrades.reduce((sum, t) => sum + t.pnl, 0),
        avgWin: noWins.length > 0 ? noWins.reduce((sum, t) => sum + t.pnl, 0) / noWins.length : 0,
        avgLoss: noLosses.length > 0 ? Math.abs(noLosses.reduce((sum, t) => sum + t.pnl, 0)) / noLosses.length : 0
      },

      // Exit reason distribution
      exitReasonDistribution: exitReasonDist,

      // Risk & Drawdown metrics
      equityCurve: this.equityCurve,
      maxDrawdown,
      maxDrawdownPercentage,
      sharpeRatio,
      volatility,
      expectancy,
      profitFactor: totalLossAmount > 0 ? totalWinAmount / totalLossAmount : totalWinAmount > 0 ? 999 : 0,

      // Trade distribution
      medianWin,
      medianLoss,
      avgHoldTime,
      medianHoldTime,
      capitalUtilization: avgCapitalAllocation,
      avgCapitalAllocation,

      // Streak analysis
      consecutiveWins,
      consecutiveLosses,
      longestWinStreak,
      longestLossStreak,

      // Time-series outputs
      dailyPnl,
      drawdownCurve,
      capitalUtilizationOverTime
    };
  }

  private calculateStdDev(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
    return Math.sqrt(variance);
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Calculate daily PnL time series
   */
  private calculateDailyPnl(trades: BacktestTrade[]): DailyPnlPoint[] {
    const dailyMap = new Map<string, { pnl: number; count: number }>();

    for (const trade of trades) {
      if (!trade.exitTime) continue;
      const dateKey = trade.exitTime.toISOString().split('T')[0];
      const existing = dailyMap.get(dateKey) || { pnl: 0, count: 0 };
      dailyMap.set(dateKey, {
        pnl: existing.pnl + trade.pnl,
        count: existing.count + 1
      });
    }

    const result: DailyPnlPoint[] = [];
    let cumulativePnl = 0;

    const sortedDates = Array.from(dailyMap.keys()).sort();
    for (const dateKey of sortedDates) {
      const data = dailyMap.get(dateKey)!;
      cumulativePnl += data.pnl;
      result.push({
        date: new Date(dateKey),
        dailyPnl: data.pnl,
        cumulativePnl,
        tradesCount: data.count
      });
    }

    return result;
  }

  /**
   * Calculate drawdown curve from equity curve
   */
  private calculateDrawdownCurve(): DrawdownPoint[] {
    const result: DrawdownPoint[] = [];
    let peak = this.initialBankroll;

    for (const point of this.equityCurve) {
      if (point.equity > peak) {
        peak = point.equity;
      }
      const drawdown = peak - point.equity;
      const drawdownPercentage = peak > 0 ? (drawdown / peak) * 100 : 0;
      result.push({
        timestamp: point.timestamp,
        drawdown,
        drawdownPercentage,
        inDrawdown: drawdown > 0
      });
    }

    return result;
  }

  /**
   * Calculate capital utilization over time
   */
  private calculateCapitalUtilization(): CapitalUtilizationPoint[] {
    // This is a simplified version - in a real implementation,
    // we'd track this during the backtest execution
    const result: CapitalUtilizationPoint[] = [];

    for (const point of this.equityCurve) {
      // Simplified: use equity curve points
      const capitalInUse = this.initialBankroll - point.equity + point.drawdown;
      const utilizationPercentage = this.initialBankroll > 0
        ? (capitalInUse / this.initialBankroll) * 100
        : 0;

      result.push({
        timestamp: point.timestamp,
        capitalInUse,
        utilizationPercentage,
        openPositions: 0 // Would need to track this during execution
      });
    }

    return result;
  }
}
