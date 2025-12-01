# Polymarket Position Closer Bot

Automated bot that monitors user positions and automatically closes them when Polymarket markets are resolved.

## Features

-  **Continuous Monitoring** - Checks positions at regular intervals
-  **Automatic Closure** - Closes positions when markets are resolved
-  **Smart Pricing** - Uses final market outcome price (0 or 1)
-  **Safe** - Only closes positions once, prevents duplicates
-  **Detailed Logging** - Track every action with timestamps
-  **MagicBlock ER** - Uses MagicBlock RPC for fast transactions

## How It Works

1. **Monitor** - Fetches all active positions for your wallet
2. **Check** - Queries Polymarket API for market resolution status
3. **Close** - If resolved, automatically closes the position
4. **Repeat** - Continues monitoring every 60 seconds (configurable)

## Setup

### 1. Install Dependencies

```bash
cd bot
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Solana RPC (MagicBlock for ER support)
SOLANA_RPC_ENDPOINT=https://rpc.magicblock.app/devnet/

# Your deployed program ID
SOLANA_PROGRAM_ID=AmuwGa8LXKW63ZHzGm1TkqSugbJ8fMVXr6HKksYkwUNT

# Your wallet private key (see below for how to get this)
WALLET_PRIVATE_KEY=your_base58_private_key_here

# Check interval (milliseconds)
CHECK_INTERVAL_MS=60000

# Logging level
LOG_LEVEL=info
```

### 3. Get Your Wallet Private Key

#### Option A: Export from Solana CLI

If you have a Solana wallet:

```bash
# For base58 format (recommended)
solana-keygen pubkey ~/.config/solana/id.json
cat ~/.config/solana/id.json

# Copy the array and use in .env as:
# WALLET_PRIVATE_KEY=[1,2,3,4,...]
```

#### Option B: Create New Wallet

```bash
solana-keygen new --no-bip39-passphrase --outfile bot-wallet.json
cat bot-wallet.json
```

Then copy the array to your `.env` file.

#### Option C: Use Base58 Encoded Key

If you have a base58 encoded private key, use it directly:

```env
WALLET_PRIVATE_KEY=5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP...
```

### 4. Fund Your Wallet

Make sure your wallet has SOL for transaction fees:

```bash
# Get your wallet address
solana-keygen pubkey bot-wallet.json

# Airdrop SOL (devnet only)
solana airdrop 2 YOUR_WALLET_ADDRESS --url devnet
```

## Running the Bot

### Development Mode

With auto-restart on file changes:

```bash
npm run dev
```

### Production Mode

Build and run:

```bash
npm run build
npm start
```

### Using nodemon

Watch for changes:

```bash
npm run watch
```

## Configuration

### Check Interval

Adjust how often the bot checks for resolved markets:

```env
CHECK_INTERVAL_MS=60000  # 60 seconds (default)
CHECK_INTERVAL_MS=30000  # 30 seconds (more frequent)
CHECK_INTERVAL_MS=300000 # 5 minutes (less frequent)
```

### Logging Level

Control verbosity:

```env
LOG_LEVEL=debug  # Show everything
LOG_LEVEL=info   # Normal operation (default)
LOG_LEVEL=warn   # Only warnings and errors
LOG_LEVEL=error  # Only errors
```

## How Positions Are Closed

When a market is resolved:

1. **Fetch Market Status** - Checks Polymarket API for resolution
2. **Determine Outcome** - Gets YES or NO winner
3. **Calculate Price**:
   - YES wins: `finalPrice = 1.0`
   - NO wins: `finalPrice = 0.0`
4. **Execute Close** - Calls `close_position` on your Solana program
5. **Update Balance** - User receives payout based on shares × final price

## Architecture

```
src/
├── index.ts              # Main entry point
├── logger.ts             # Logging utility
├── solana-client.ts      # Solana/Anchor interactions
├── market-resolver.ts    # Polymarket API client
├── position-monitor.ts   # Main monitoring logic
└── idl/
    └── polymarket_paper.json  # Program IDL
```

### Key Components

#### `SolanaClient`
- Connects to Solana RPC
- Loads wallet from private key
- Fetches user positions
- Executes close_position transactions

#### `MarketResolver`
- Queries Polymarket API
- Determines if markets are resolved
- Caches results to reduce API calls
- Handles rate limiting

#### `PositionMonitor`
- Orchestrates the monitoring loop
- Tracks processed positions
- Prevents duplicate closures
- Handles errors gracefully

## Troubleshooting

### "Wallet not loaded" Error

Make sure your private key is correctly formatted in `.env`:

```env
# JSON array format (most common)
WALLET_PRIVATE_KEY=[1,2,3,...]

# OR base58 format
WALLET_PRIVATE_KEY=5KQwr...
```

### "Insufficient SOL" Error

Fund your wallet:

```bash
solana airdrop 2 YOUR_WALLET_ADDRESS --url devnet
```

### "Program not found" Error

Check that your `SOLANA_PROGRAM_ID` matches your deployed program.

### "Market not found" Error

The bot will continue running. This happens if:
- Market ID is invalid
- Polymarket API is down
- Network issues

The bot will retry on the next check interval.

### No Positions Found

This is normal if you don't have any active positions. The bot will continue monitoring.

## Advanced Usage

### Run as System Service (Linux)

Create `/etc/systemd/system/polymarket-bot.service`:

```ini
[Unit]
Description=Polymarket Position Closer Bot
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/bot
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable polymarket-bot
sudo systemctl start polymarket-bot
sudo systemctl status polymarket-bot
```

### Run with PM2

```bash
npm install -g pm2
pm2 start dist/index.js --name polymarket-bot
pm2 save
pm2 startup
```

### Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
COPY src/idl ./src/idl
CMD ["node", "dist/index.js"]
```

Build and run:

```bash
docker build -t polymarket-bot .
docker run -d --env-file .env --name polymarket-bot polymarket-bot
```

## Security Notes

 **IMPORTANT SECURITY CONSIDERATIONS:**

1. **Never commit `.env` file** - Contains your private key!
2. **Use separate wallet** - Don't use your main wallet for the bot
3. **Limit funds** - Only keep enough SOL for transaction fees
4. **Secure storage** - Store private keys securely
5. **Monitor logs** - Check for suspicious activity

## Testing

### Dry Run Mode

To test without closing positions, modify `position-monitor.ts`:

```typescript
// Comment out the actual close call
// const tx = await this.solanaClient.closePosition(...)

// Replace with:
logger.info(`[DRY RUN] Would close position ${position.positionId}`);
```

### Manual Market Check

Test market resolution checking:

```typescript
import { MarketResolver } from './market-resolver.js';

const resolver = new MarketResolver();
const resolution = await resolver.getMarketResolution('YOUR_MARKET_ID');
console.log(resolution);
```

## Monitoring & Alerts

### Log to File

```bash
npm start > bot.log 2>&1
```

### Send Alerts (Example with Discord Webhook)

Add to `logger.ts`:

```typescript
async success(...args: any[]) {
    console.log(...args);

    // Send to Discord
    await fetch('YOUR_DISCORD_WEBHOOK_URL', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: args.join(' ') })
    });
}
```




