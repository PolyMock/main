-- Migration: Add multi-market support to backtest_strategies
-- Changes market_id (single TEXT) to market_ids (JSON array)

-- Step 1: Create new table with updated schema
CREATE TABLE IF NOT EXISTS backtest_strategies_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  strategy_name TEXT NOT NULL,

  -- Market selection (CHANGED: now stores JSON array of market IDs)
  market_ids TEXT NOT NULL, -- JSON array: ["market1", "market2", ...]
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

-- Step 2: Migrate existing data, converting single market_id to JSON array
INSERT INTO backtest_strategies_new (
  id, user_id, strategy_name,
  market_ids, market_question,
  initial_capital, start_date, end_date,
  entry_type, entry_config,
  position_sizing_type, position_sizing_value, max_position_size,
  stop_loss, take_profit, time_based_exit,
  use_trailing_stop, trailing_stop_config,
  use_partial_exits, partial_exits_config,
  max_trades_per_day, trade_time_start, trade_time_end,
  final_capital, total_return_percent, total_trades,
  winning_trades, losing_trades, break_even_trades,
  win_rate, avg_win, avg_loss, largest_win, largest_loss,
  profit_factor, sharpe_ratio, max_drawdown, avg_trade_duration,
  trades_data, equity_curve, pnl_distribution,
  created_at
)
SELECT
  id, user_id, strategy_name,
  -- Convert single market_id to JSON array
  '["' || market_id || '"]' as market_ids,
  market_question,
  initial_capital, start_date, end_date,
  entry_type, entry_config,
  position_sizing_type, position_sizing_value, max_position_size,
  stop_loss, take_profit, time_based_exit,
  use_trailing_stop, trailing_stop_config,
  use_partial_exits, partial_exits_config,
  max_trades_per_day, trade_time_start, trade_time_end,
  final_capital, total_return_percent, total_trades,
  winning_trades, losing_trades, break_even_trades,
  win_rate, avg_win, avg_loss, largest_win, largest_loss,
  profit_factor, sharpe_ratio, max_drawdown, avg_trade_duration,
  trades_data, equity_curve, pnl_distribution,
  created_at
FROM backtest_strategies;

-- Step 3: Drop old table
DROP TABLE backtest_strategies;

-- Step 4: Rename new table to original name
ALTER TABLE backtest_strategies_new RENAME TO backtest_strategies;

-- Step 5: Recreate index
CREATE INDEX IF NOT EXISTS idx_user_strategies ON backtest_strategies(user_id, created_at DESC);
