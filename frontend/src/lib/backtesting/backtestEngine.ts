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
  EquityPoint
} from './types';
import { DomeApiClient } from './domeApiClient';

export class BacktestEngine {
  private domeClient: DomeApiClient;
  private trades: BacktestTrade[] = [];
  private openPositions: Map<string, BacktestTrade> = new Map();
  private equityCurve: EquityPoint[] = [];
  private currentCapital: number = 0;
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
    this.debugInfo = {
      marketsProcessed: 0,
      marketsWithData: 0,
      totalCandlesticks: 0,
      validCandlesticks: 0,
      entryAttempts: 0,
      reasons: []
    };

    console.log('\n🚀 Starting backtest:', {
      startDate: config.startDate.toISOString(),
      endDate: config.endDate.toISOString(),
      entryType: config.entryType,
      initialBankroll: config.initialBankroll,
      hasSpecificMarket: !!config.specificMarket?.conditionId,
      entryPriceThreshold: config.entryPriceThreshold,
      positionSizing: config.positionSizing
    });

    // Fetch markets in the date range
    const markets = await this.fetchRelevantMarkets(config);
    console.log(`Found ${markets.length} markets to analyze`);
    
    if (markets.length === 0) {
      console.warn('⚠️  No markets found matching criteria');
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

    console.log('\n📊 Backtest Summary:');
    console.log(`   Markets analyzed: ${markets.length}`);
    console.log(`   Markets with data: ${this.debugInfo.marketsWithData}`);
    console.log(`   Total candlesticks: ${this.debugInfo.totalCandlesticks}`);
    console.log(`   Valid candlesticks: ${this.debugInfo.validCandlesticks}`);
    console.log(`   Entry attempts: ${this.debugInfo.entryAttempts}`);
    console.log(`   Total trades: ${this.trades.length}`);
    console.log(`   Starting capital: $${config.initialBankroll.toLocaleString()}`);
    console.log(`   Ending capital: $${this.currentCapital.toLocaleString()}`);
    console.log(`   Net P&L: $${(this.currentCapital - config.initialBankroll).toLocaleString()}`);
    console.log(`   Execution time: ${(executionTime / 1000).toFixed(2)}s`);
    
    if (this.trades.length === 0 && this.debugInfo.reasons.length > 0) {
      console.log('\n⚠️  Reasons for no trades:');
      this.debugInfo.reasons.forEach((reason, i) => {
        console.log(`   ${i + 1}. ${reason}`);
      });
    }

    const result = {
      strategyConfig: config,
      trades: this.trades,
      metrics,
      startingCapital: config.initialBankroll,
      endingCapital: this.currentCapital,
      marketsAnalyzed: markets.length,
      executionTime,
      debugInfo: this.debugInfo
    };
    
    // Log debug info if no trades
    if (this.trades.length === 0) {
      console.log('\n🔍 Debug Information:');
      console.log(JSON.stringify(this.debugInfo, null, 2));
    }
    
    return result;
  }

  /**
   * Fetch markets that match strategy filters
   */
  private async fetchRelevantMarkets(config: StrategyConfig): Promise<any[]> {
    // If specific market is targeted, create a synthetic market object
    // We don't need full market metadata 
    if (config.specificMarket?.conditionId) {
      console.log(`Using specific market with condition_id: ${config.specificMarket.conditionId}`);

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
          console.log(`Found specific market: ${specificMarket.question || specificMarket.title}`);
          return [specificMarket];
        }

        offset += limit;
        if (offset >= 500) break; // Safety limit
      }

      console.warn('Specific market not found');
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
      console.log(`\n📊 Processing market: ${market.title || market.question || market.condition_id}`);
      console.log(`   Condition ID: ${market.condition_id}`);
      console.log(`   Date range: ${config.startDate.toISOString()} to ${config.endDate.toISOString()}`);

      // Calculate date range and choose appropriate interval
      const rangeDays = (config.endDate.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24);

      // Choose interval based on range (respecting API limits)
      // Start with hourly data for better granularity unless range is too long
      let interval: 1 | 60 | 1440;

      if (rangeDays <= 7) {
        interval = 60; // Use hourly for up to 1 week (was 1 minute, but that's often too granular)
      } else if (rangeDays <= 30) {
        interval = 60; // 1 hour for up to 1 month
      } else {
        interval = 1440; // 1 day for longer than 1 month
      }

      console.log(`   Date range: ${rangeDays.toFixed(1)} days, using interval: ${interval} (${interval === 1 ? '1 minute' : interval === 60 ? '1 hour' : '1 day'})`);

      // Try to fetch candlestick data, with fallback to larger intervals if no data
      let candlesticks = await this.domeClient.getCandlesticks(
        market.condition_id,
        interval,
        config.startDate,
        config.endDate
      );

      // If no data with current interval and it's not daily yet, try daily
      if (candlesticks.length === 0 && interval < 1440) {
        console.log(`   No data with ${interval === 1 ? '1-minute' : '1-hour'} interval, trying daily interval...`);
        candlesticks = await this.domeClient.getCandlesticks(
          market.condition_id,
          1440,
          config.startDate,
          config.endDate
        );
      }

      console.log(`   Fetched ${candlesticks.length} candlesticks`);
      this.debugInfo.totalCandlesticks += candlesticks.length;

      if (candlesticks.length === 0) {
        console.log(`   ⚠️  No candlestick data for market ${market.condition_id}`);
        this.debugInfo.reasons.push(`Market ${market.condition_id}: No candlestick data`);
        return;
      }
      
      this.debugInfo.marketsWithData++;

      // Log sample candlesticks for debugging
      if (candlesticks.length > 0) {
        const first = candlesticks[0];
        const last = candlesticks[candlesticks.length - 1];
        console.log(`   📈 First candlestick:`, {
          timestamp: first.timestamp.toISOString(),
          close: first.close,
          volume: first.volume
        });
        console.log(`   📈 Last candlestick:`, {
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
          console.log(`   📊 Price stats: min=${minPrice.toFixed(4)}, max=${maxPrice.toFixed(4)}, avg=${avgPrice.toFixed(4)}, valid=${prices.length}/${candlesticks.length}`);
        }
      }

      // Replay market tick by tick
      let entryAttempts = 0;
      let invalidCandles = 0;
      let processedCandles = 0;
      
      console.log(`   🔄 Processing ${candlesticks.length} candlesticks...`);
      console.log(`   📋 Entry config:`, {
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
            console.warn(`   ⚠️  Skipping invalid candle at ${candle.timestamp.toISOString()}: close=${candle.close}`);
          }
          continue;
        }
        
        processedCandles++;
        
        // Log first valid candle for debugging
        if (processedCandles === 1) {
          console.log(`   🕯️  First valid candle: price=${candle.close.toFixed(4)}, timestamp=${candle.timestamp.toISOString()}`);
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

      console.log(`   📊 Processed ${processedCandles} valid candles (${invalidCandles} invalid)`);
      this.debugInfo.validCandlesticks += processedCandles;
      this.debugInfo.entryAttempts += entryAttempts;
      
      if (entryAttempts > 0) {
        console.log(`   ✅ Made ${entryAttempts} entry attempt(s)`);
      } else {
        console.log(`   ⚠️  No entry attempts made`);
        const firstValidPrice = processedCandles > 0 ? candlesticks.find(c => c.close > 0 && c.close <= 1)?.close : null;
        const debugMsg = `Market ${market.condition_id}: No entries - validCandles=${processedCandles}, firstPrice=${firstValidPrice?.toFixed(4) || 'N/A'}, entryType=${config.entryType}, thresholds=${JSON.stringify(config.entryPriceThreshold)}`;
        console.log(`   💡 ${debugMsg}`);
        this.debugInfo.reasons.push(debugMsg);
      }

      // Close position if market resolved
      if (market.outcome) {
        const resolutionTime = market.end_date_iso ? new Date(market.end_date_iso) : config.endDate;
        const marketKey = market.market_id || market.condition_id;
        this.closePositionForMarket(marketKey, resolutionTime, market.outcome, 'RESOLUTION');
      }

    } catch (error) {
      console.error(`Error processing market ${market.market_id}:`, error);
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

    // Check if we have enough capital
    const positionSize = this.calculatePositionSize(config);
    if (positionSize > this.currentCapital) {
      console.log(`   💰 Insufficient capital: need ${positionSize.toFixed(2)}, have ${this.currentCapital.toFixed(2)}`);
      return;
    }

    const yesPrice = candle.close;
    const noPrice = 1 - candle.close;

    // Validate prices are in valid range
    if (yesPrice <= 0 || yesPrice >= 1 || noPrice <= 0 || noPrice >= 1) {
      console.warn(`   ⚠️  Invalid prices: yes=${yesPrice}, no=${noPrice}`);
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
    _config: StrategyConfig
  ): void {
    const marketKey = market.market_id || market.condition_id;
    const price = side === 'YES' ? candle.close : (1 - candle.close);
    const shares = amountUsdc / price;
    const fees = amountUsdc * 0.02; // 2% fee estimate

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
      status: 'OPEN'
    };

    this.openPositions.set(marketKey, trade);
    this.currentCapital -= (amountUsdc + fees);

    console.log(`   🎯 OPEN ${side} position: ${trade.marketName.substring(0, 50)}... @ ${price.toFixed(4)} (${shares.toFixed(2)} shares, $${amountUsdc.toFixed(2)} invested)`);
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

    // Stop loss
    if (config.exitRules.stopLoss && pnlPercentage <= -config.exitRules.stopLoss) {
      this.closePosition(position, candle.timestamp, currentPrice, 'STOP_LOSS');
      return;
    }

    // Take profit
    if (config.exitRules.takeProfit && pnlPercentage >= config.exitRules.takeProfit) {
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
   * Close a position
   */
  private closePosition(
    position: BacktestTrade,
    exitTime: Date,
    exitPrice: number,
    exitReason: 'RESOLUTION' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MAX_HOLD_TIME'
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

    this.currentCapital += netExitValue;
    this.trades.push(position);
    this.openPositions.delete(position.marketId);

    console.log(`CLOSE ${position.side} position: ${position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)} USDC (${position.pnlPercentage.toFixed(2)}%) - ${exitReason}`);
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
    const noWins = noTrades.filter(t => t.pnl > 0);

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

    const avgHoldTime = closedTrades.length > 0
      ? closedTrades.reduce((sum, t) => {
          const holdTime = t.exitTime ? (t.exitTime.getTime() - t.entryTime.getTime()) / (1000 * 60 * 60) : 0;
          return sum + holdTime;
        }, 0) / closedTrades.length
      : 0;

    // Calculate consecutive wins/losses
    let consecutiveWins = 0;
    let consecutiveLosses = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    for (const trade of closedTrades) {
      if (trade.pnl > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        consecutiveWins = Math.max(consecutiveWins, currentWinStreak);
      } else {
        currentLossStreak++;
        currentWinStreak = 0;
        consecutiveLosses = Math.max(consecutiveLosses, currentLossStreak);
      }
    }

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
        pnl: yesTrades.reduce((sum, t) => sum + t.pnl, 0)
      },
      noPerformance: {
        count: noTrades.length,
        winRate: noTrades.length > 0 ? (noWins.length / noTrades.length) * 100 : 0,
        pnl: noTrades.reduce((sum, t) => sum + t.pnl, 0)
      },

      // Pro metrics
      equityCurve: this.equityCurve,
      maxDrawdown,
      maxDrawdownPercentage,
      sharpeRatio,
      volatility,
      expectancy,
      medianWin,
      medianLoss,
      avgHoldTime,
      capitalUtilization: 0, // TODO: calculate average capital in use
      consecutiveWins,
      consecutiveLosses,
      profitFactor: totalLossAmount > 0 ? totalWinAmount / totalLossAmount : totalWinAmount > 0 ? 999 : 0
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
}
