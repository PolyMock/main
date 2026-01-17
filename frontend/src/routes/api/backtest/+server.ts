/**
 * API endpoint for running backtests
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BacktestEngine } from '$lib/backtesting/backtestEngine';
import type { StrategyConfig } from '$lib/backtesting/types';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const strategyConfig: StrategyConfig = await request.json();

    // Validate config
    if (!strategyConfig.startDate || !strategyConfig.endDate) {
      return json({ error: 'Start date and end date are required' }, { status: 400 });
    }

    if (!strategyConfig.initialBankroll || strategyConfig.initialBankroll <= 0) {
      return json({ error: 'Initial bankroll must be greater than 0' }, { status: 400 });
    }

    // Convert date strings to Date objects
    strategyConfig.startDate = new Date(strategyConfig.startDate);
    strategyConfig.endDate = new Date(strategyConfig.endDate);
    
    // Validate dates are valid
    if (isNaN(strategyConfig.startDate.getTime())) {
      return json({ error: 'Invalid start date' }, { status: 400 });
    }
    if (isNaN(strategyConfig.endDate.getTime())) {
      return json({ error: 'Invalid end date' }, { status: 400 });
    }
    if (strategyConfig.startDate >= strategyConfig.endDate) {
      return json({ error: 'Start date must be before end date' }, { status: 400 });
    }
    
      startDate: strategyConfig.startDate.toISOString(),
      endDate: strategyConfig.endDate.toISOString(),
      startUnix: Math.floor(strategyConfig.startDate.getTime() / 1000),
      endUnix: Math.floor(strategyConfig.endDate.getTime() / 1000),
      rangeDays: (strategyConfig.endDate.getTime() - strategyConfig.startDate.getTime()) / (1000 * 60 * 60 * 24)
    });

    // Initialize backtest engine
    // Get API key from environment variable set in .env file
    const apiKey = env.DOME_API_KEY || '';
    if (!apiKey) {
      return json({ error: 'DOME_API_KEY not configured in .env file' }, { status: 500 });
    }

    const engine = new BacktestEngine(apiKey);

    // Run backtest
    const result = await engine.runBacktest(strategyConfig);
    
    // Add debug info to result
      marketsAnalyzed: result.marketsAnalyzed,
      totalTrades: result.trades.length,
      startingCapital: result.startingCapital,
      endingCapital: result.endingCapital
    });

    return json(result);
  } catch (error: any) {
    console.error('Backtest error:', error);
    return json(
      { error: error.message || 'An error occurred while running the backtest' },
      { status: 500 }
    );
  }
};
