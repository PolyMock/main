import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { BacktestEngine } from './lib/backtesting/backtestEngine.js';
import type { StrategyConfig } from './lib/backtesting/types.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'https://polymock.app', 'https://*.pages.dev'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Backtest endpoint
app.post('/api/backtest', async (req, res) => {
  const startTime = Date.now();
  console.log('[Backtest API] Received backtest request');

  try {
    const strategyConfig: StrategyConfig = req.body;

    // Validate config
    if (!strategyConfig.startDate || !strategyConfig.endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    if (!strategyConfig.initialBankroll || strategyConfig.initialBankroll <= 0) {
      return res.status(400).json({ error: 'Initial bankroll must be greater than 0' });
    }

    // Convert date strings to Date objects
    strategyConfig.startDate = new Date(strategyConfig.startDate);
    strategyConfig.endDate = new Date(strategyConfig.endDate);

    // Validate dates are valid
    if (isNaN(strategyConfig.startDate.getTime())) {
      return res.status(400).json({ error: 'Invalid start date' });
    }
    if (isNaN(strategyConfig.endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid end date' });
    }
    if (strategyConfig.startDate >= strategyConfig.endDate) {
      return res.status(400).json({ error: 'Start date must be before end date' });
    }

    // Initialize backtest engine
    const apiKey = process.env.DOME_API_KEY || '';
    if (!apiKey) {
      return res.status(500).json({ error: 'DOME_API_KEY not configured' });
    }

    console.log('[Backtest API] Starting backtest...');
    console.log('[Backtest API] Markets:', strategyConfig.marketIds?.length || 0);
    console.log('[Backtest API] Date range:', strategyConfig.startDate, 'to', strategyConfig.endDate);

    const engine = new BacktestEngine(apiKey);

    // Run backtest
    const result = await engine.runBacktest(strategyConfig);

    const duration = Date.now() - startTime;
    console.log(`[Backtest API] Backtest completed in ${duration}ms`);
    console.log(`[Backtest API] Total trades: ${result.metrics.totalTrades}`);

    res.json(result);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[Backtest API] Error after ${duration}ms:`, error);
    res.status(500).json({
      error: error.message || 'An error occurred during backtesting',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Markets endpoint (for fetching available markets)
app.post('/api/backtest/markets', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      status,
      tag,
      minVolume,
      maxVolume,
      marketStartDate,
      marketEndDate,
      fetchMode
    } = req.body;

    const apiKey = process.env.DOME_API_KEY || '';
    if (!apiKey) {
      return res.status(500).json({ error: 'DOME_API_KEY not configured' });
    }

    console.log('[Markets API] Fetching markets, mode:', fetchMode);

    const { DomeApiClient } = await import('./lib/backtesting/domeApiClient.js');
    const domeClient = new DomeApiClient(apiKey);

    // Fetch markets in batches
    const allMarkets: any[] = [];
    let offset = 0;
    const limit = 100;

    // If fetchMode is 'list', we're just getting closed markets without date filtering
    if (fetchMode === 'list') {
      while (true) {
        const batch = await domeClient.getMarkets({
          limit,
          offset,
          status: 'closed'
        });

        if (batch.length === 0) break;

        allMarkets.push(...batch);
        offset += limit;

        if (allMarkets.length >= 500) break;
      }
    } else {
      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Start date and end date are required for backtest mode' });
      }

      const backtestStartDate = new Date(startDate);
      const backtestEndDate = new Date(endDate);

      while (true) {
        const batch = await domeClient.getMarkets({
          startDate: backtestStartDate,
          endDate: backtestEndDate,
          limit,
          offset,
          status: status || 'closed'
        });

        if (batch.length === 0) break;

        allMarkets.push(...batch);
        offset += limit;

        if (allMarkets.length >= 500) break;
      }
    }

    // Filter markets
    const filteredMarkets = allMarkets.filter(market => {
      const marketStartTime = market.start_time ? new Date(market.start_time * 1000) : null;
      const marketEndTime = market.end_time
        ? new Date(market.end_time * 1000)
        : (market.close_time ? new Date(market.close_time * 1000) : null);

      if (fetchMode === 'list') {
        if (market.status !== 'closed' || (!market.winning_side && !market.outcome)) {
          return false;
        }

        if (marketEndTime && marketEndTime > new Date()) {
          return false;
        }

        // Tag filtering
        if (tag && market.tags && !market.tags.includes(tag)) {
          return false;
        }

        // Volume filtering
        if (minVolume !== undefined && market.volume < minVolume) {
          return false;
        }
        if (maxVolume !== undefined && market.volume > maxVolume) {
          return false;
        }

        return true;
      }

      // Normal backtest mode filtering...
      return market.status === 'closed';
    });

    console.log(`[Markets API] Found ${filteredMarkets.length} markets`);
    res.json({ markets: filteredMarkets });
  } catch (error: any) {
    console.error('[Markets API] Error:', error);
    res.status(500).json({ error: error.message || 'An error occurred' });
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Server Error]:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backtest API server running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Backtest endpoint: http://localhost:${PORT}/api/backtest`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
