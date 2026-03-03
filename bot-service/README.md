# Polymarket SL/TP Bot Service

Automated monitoring and execution service for Stop Loss and Take Profit orders on Polymarket paper trading.

## Overview

This bot continuously monitors all open positions on the Solana program that have Stop Loss (SL) or Take Profit (TP) set, fetches current market prices from Polymarket, and automatically executes position closes when conditions are met.

## Architecture

```
Bot Service (Railway)
    ↓
1. Query Solana Program → Fetch all active positions with SL/TP
2. Fetch Polymarket Prices → Get current market prices
3. Check Conditions → Compare prices with SL/TP
4. Execute Closes → Call close_position_auto instruction
```

## Features

- ✅ Monitors all positions 24/7
- ✅ Checks prices every 30 seconds (configurable)
- ✅ Executes closes automatically when SL/TP triggered
- ✅ No database needed - reads directly from blockchain
- ✅ Graceful error handling and retries
- ✅ Detailed logging for transparency

## Environment Variables

```bash
# Required
RPC_URL=https://api.devnet.solana.com
BOT_PRIVATE_KEY=your_bot_wallet_private_key

# Optional
CHECK_INTERVAL_MS=30000  # Check interval in milliseconds
PROGRAM_ID=cWcQsqrGLagy6KfjKkFjeNWm651s85b7q2ehKp7zSmL
```

## Setup

### 1. Create Bot Wallet

Generate a new Solana keypair for the bot:

```bash
solana-keygen new --outfile bot-keypair.json
```

Get the private key as JSON array:

```bash
cat bot-keypair.json
```

Or as base58:

```bash
solana-keygen pubkey bot-keypair.json --outfile /dev/stdout
```

### 2. Fund Bot Wallet

The bot needs SOL for transaction fees:

```bash
# For devnet
solana airdrop 2 <BOT_PUBLIC_KEY> --url devnet

# For mainnet, transfer SOL from your wallet
```

### 3. Local Development

```bash
# Install dependencies
npm install

# Copy .env.example to .env and fill in values
cp .env.example .env

# Run in development mode
npm run dev
```

### 4. Deploy to Railway

1. **Create New Project**
   - Go to [Railway](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository

2. **Configure Environment Variables**
   - Go to project settings → Variables
   - Add:
     - `RPC_URL`: `https://api.devnet.solana.com` (or mainnet)
     - `BOT_PRIVATE_KEY`: Your bot wallet private key (JSON array or base58)
     - `CHECK_INTERVAL_MS`: `30000` (optional)

3. **Set Root Directory**
   - Go to project settings → Build
   - Set "Root Directory" to `bot-service`

4. **Deploy**
   - Railway will automatically build and deploy
   - Monitor logs to ensure bot is running

## How It Works

### Position Monitoring

The bot queries all `PredictionPosition` accounts from the Solana program and filters for:
- Status = Active
- Stop Loss > 0 OR Take Profit > 0

### Price Fetching

For each unique market ID, the bot fetches the latest price from Polymarket's CLOB API:

```
GET https://clob.polymarket.com/prices-history?market={market_id}&interval=1m&fidelity=1
```

### Condition Checking

For each position:
- **Stop Loss**: Triggered when `current_price <= stop_loss`
- **Take Profit**: Triggered when `current_price >= take_profit`

### Execution

When triggered, the bot calls the `close_position_auto` instruction:

```typescript
await program.methods
  .closePositionAuto(currentPrice)
  .accounts({
    userAccount: userAccountPDA,
    positionAccount: positionPDA,
  })
  .rpc();
```

The program validates the condition on-chain and closes the position, returning funds to the user's account.

## Logs

The bot provides detailed console logs:

```
✅ Bot initialized
🔑 Bot wallet: ABC123...
🌐 RPC URL: https://api.devnet.solana.com
📊 Program ID: cWcQsqrGLagy6KfjKkFjeNWm651s85b7q2ehKp7zSmL
🚀 Starting SL/TP monitoring bot...

⏰ [2025-01-27T15:00:00.000Z] Checking positions...
📋 Found 5 active positions with SL/TP
📈 Fetching prices for 3 unique markets
  💰 market1: $0.6543
  💰 market2: $0.3421
  💰 market3: $0.7890

🎯 STOP LOSS TRIGGERED!
  Position: XYZ789...
  Market: market1
  Current Price: $0.6543
  Trigger Price: $0.6550
📤 Sending close_position_auto transaction...
✅ Position closed successfully!
   Transaction: 5JK7...
   Explorer: https://explorer.solana.com/tx/5JK7...?cluster=devnet
```

## Troubleshooting

### Bot Not Starting

- Check that `BOT_PRIVATE_KEY` is set correctly
- Verify RPC URL is accessible
- Ensure bot wallet has SOL for transaction fees

### Positions Not Closing

- Check program logs for errors
- Verify position still exists and is Active
- Ensure price data is being fetched correctly
- Check bot wallet has enough SOL for fees

### Price Fetching Errors

- Polymarket API may have rate limits
- Market ID may be incorrect or market may be closed
- Network connectivity issues

## Program Information

- **Program ID**: `cWcQsqrGLagy6KfjKkFjeNWm651s85b7q2ehKp7zSmL`
- **Network**: Solana Devnet
- **Explorer**: [View on Solana Explorer](https://explorer.solana.com/address/cWcQsqrGLagy6KfjKkFjeNWm651s85b7q2ehKp7zSmL?cluster=devnet)

## Development

### Build

```bash
npm run build
```

### Type Check

```bash
npm run typecheck
```

## License

MIT
