-- Migration: Add Solana wallet support to users table (FIXED VERSION)
-- Run this with: wrangler d1 execute polymock-db --file=./database/migrations/0002_add_solana_wallet_fixed.sql

-- Step 1: Create new users table with updated schema
CREATE TABLE users_new (
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

-- Step 2: Copy existing data from old table (if it exists)
INSERT INTO users_new (id, google_id, email, name, picture, created_at, last_login)
SELECT id, google_id, email, name, picture, created_at, last_login
FROM users
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='users');

-- Step 3: Drop old table
DROP TABLE IF EXISTS users;

-- Step 4: Rename new table to users
ALTER TABLE users_new RENAME TO users;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_solana_address ON users(solana_address);
CREATE INDEX IF NOT EXISTS idx_user_strategies ON backtest_strategies(user_id, created_at DESC);
