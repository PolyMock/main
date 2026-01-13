-- Complete Polymock Database Schema
-- Includes: Users (Google + Wallet auth), Backtest Strategies
-- Run with: wrangler d1 execute polymock-db --remote --file=./database/migrations/0001_complete_schema.sql

-- Users table - supports both Google OAuth and Solana Wallet authentication
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id TEXT UNIQUE,
  solana_address TEXT UNIQUE,
  email TEXT,
  name TEXT,
  picture TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_auth CHECK (google_id IS NOT NULL OR solana_address IS NOT NULL)
);

-- Backtest strategies table - stores completed backtest results
CREATE TABLE IF NOT EXISTS backtest_strategies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  strategy_name TEXT NOT NULL,

  -- Market selection
  market_id TEXT NOT NULL,
  market_question TEXT,

  -- Backtest configuration
  initial_capital REAL NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,

  -- Entry rules
  entry_type TEXT NOT NULL,
  entry_config JSON NOT NULL,

  -- Position sizing
  position_sizing_type TEXT NOT NULL,
  position_sizing_value REAL NOT NULL,
  max_position_size REAL,

  -- Exit rules
  stop_loss REAL,
  take_profit REAL,
  time_based_exit INTEGER,

  -- Optional features
  use_trailing_stop BOOLEAN DEFAULT 0,
  trailing_stop_config JSON,
  use_partial_exits BOOLEAN DEFAULT 0,
  partial_exits_config JSON,
  max_trades_per_day INTEGER,
  trade_time_start TEXT,
  trade_time_end TEXT,

  -- Backtest results
  final_capital REAL NOT NULL,
  total_return_percent REAL NOT NULL,
  total_trades INTEGER NOT NULL,
  winning_trades INTEGER NOT NULL,
  losing_trades INTEGER NOT NULL,
  break_even_trades INTEGER NOT NULL,
  win_rate REAL NOT NULL,
  avg_win REAL NOT NULL,
  avg_loss REAL NOT NULL,
  largest_win REAL NOT NULL,
  largest_loss REAL NOT NULL,
  profit_factor REAL,
  sharpe_ratio REAL,
  max_drawdown REAL,
  avg_trade_duration REAL,

  -- Full backtest data
  trades_data JSON NOT NULL,
  equity_curve JSON NOT NULL,
  pnl_distribution JSON NOT NULL,

  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_solana_address ON users(solana_address);
CREATE INDEX IF NOT EXISTS idx_user_strategies ON backtest_strategies(user_id, created_at DESC);
