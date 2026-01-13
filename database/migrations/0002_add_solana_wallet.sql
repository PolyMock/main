-- Migration: Add Solana wallet support to users table
-- Run this with: wrangler d1 execute polymock-db --file=./database/migrations/0002_add_solana_wallet.sql

-- Add solana_address column to users table
ALTER TABLE users ADD COLUMN solana_address TEXT UNIQUE;

-- Make google_id nullable (since users can now authenticate with Solana wallet only)
-- Note: SQLite doesn't support ALTER COLUMN, so we need to recreate the table

-- Create new users table with updated schema
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

-- Copy data from old table
INSERT INTO users_new (id, google_id, email, name, picture, created_at, last_login)
SELECT id, google_id, email, name, picture, created_at, last_login FROM users;

-- Drop old table
DROP TABLE users;

-- Rename new table
ALTER TABLE users_new RENAME TO users;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_solana_address ON users(solana_address);
CREATE INDEX IF NOT EXISTS idx_user_strategies ON backtest_strategies(user_id, created_at DESC);
