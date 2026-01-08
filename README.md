
```
 ____   ___  _  __   ____  __  ___   ____ _  __
|  _ \ / _ \| | \ \ / /  \/  |/ _ \ / ___| |/ /
| |_) | | | | |  \ V /| |\/| | | | | |   | ' /
|  __/| |_| | |___| | | |  | | |_| | |___| . \
|_|    \___/|_____|_| |_|  |_|\___/ \____|_|\_\

```

## Overview

PolyMock is a full-stack Web3 application that enables risk-free practice trading on Polymarket prediction markets. Built on Solana using the Anchor framework and MagicBlock's Ephemeral Rollups SDK, it provides a high-performance environment for testing trading strategies with virtual USDC balances.

ProgramID : AmuwGa8LXKW63ZHzGm1TkqSugbJ8fMVXr6HKksYkwUNT

### Key Features

- **Virtual Trading Environment**: Initialize accounts with 10,000 virtual USDC (entry fee: 0.1 SOL minimum)
- **Real-time Market Data Integration**: Live price feeds, order book data, and market statistics from Polymarket API
- **Binary Prediction Markets**: Trade YES/NO positions on real Polymarket events
- **On-chain Position Management**: Smart contract-based position tracking with P&L calculation
- **Competition Leaderboards**: Competitive trading with global rankings
- **Advanced Analytics**:
  - Position tracking dashboard
  - Trade history and performance metrics
  - **Professional Strategy Backtesting Engine**:
    - Test strategies on historical Polymarket data via Dome API
    - Configurable entry/exit rules and position sizing
    - Comprehensive metrics (Win rate, ROI, Sharpe ratio, Max drawdown)
    - Equity curve visualization
    - CSV/JSON export for further analysis

## Architecture

```
PolyMock/
├── frontend/                              # SvelteKit web application
│   ├── src/
│   │   ├── lib/
│   │   │   ├── components/               # Reusable UI components
│   │   │   ├── solana/                   # Solana integration utilities
│   │   │   ├── wallet/                   # Wallet adapter configuration
│   │   │   └── polymarket.ts             # Polymarket API client
│   │   └── routes/
│   │       ├── +page.svelte              # Main trading interface
│   │       ├── api/                      # API endpoints
│   │       ├── dashboard/                # Portfolio dashboard
│   │       ├── competition/              # Leaderboard view
│   │       ├── backtesting/              # Strategy backtesting
│   │       ├── market/[id]/              # Market detail pages
│   │       └── news/                     # Market news feed
│   └── package.json
└── contracts/                             # Solana program (Anchor)
    ├── programs/polymarket-paper/
    │   └── src/lib.rs                    # Anchor program
    ├── tests/                            # Integration tests
    └── Anchor.toml                       # Anchor configuration
```

## Technical Stack

### Frontend Architecture
| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | **SvelteKit 2.x** | Full-stack web framework |
| Language | **TypeScript 5.x** | Type-safe development |
| Build Tool | **Vite 7.x** | Fast HMR and optimized builds |
| Blockchain | **Solana Web3.js v1.98** | Solana RPC interaction |
| Smart Contract SDK | **Anchor 0.32** | Program IDL and client generation |
| Wallet Integration | **@solana/wallet-adapter** | Multi-wallet support (Phantom, Solflare, etc.) |
| Rollups | **@magicblock-labs/ephemeral-rollups-sdk** | High-speed transaction processing |
| Market Data | **Polymarket API** + **Axios** | Real-time prediction market data |
| Price Feeds | **Pyth Network Hermes** | Oracle price data |

### Smart Contract (Rust/Anchor)
- **Framework**: Anchor 0.30.0
- **Blockchain**: Solana (MagicBlock Devnet)
- **Extension**: Bolt Lang (ephemeral rollups support)
- **Program Features**:
  - Account initialization with configurable entry fees
  - Virtual USDC balance management (10,000 USDC initial)
  - YES/NO position management for binary markets
  - P&L calculation and position closing
  - On-chain event emissions for indexing
  - Treasury fee collection system

## Deployment Information

### Smart Contract Deployment

| Environment | Program ID | RPC Endpoint |
|------------|-----------|--------------|
| **MagicBlock Devnet** | `AmuwGa8LXKW63ZHzGm1TkqSugbJ8fMVXr6HKksYkwUNT` | `https://rpc.magicblock.app/devnet/` |
| Localnet | `Azr9LDo9RCEFMzKoC5SA1yeJffD2tyDvnuMyUSFkRT6P` | `http://localhost:8899` |
| Mainnet | `ACiKbUuELDHuVfoaSsZy9EcvPEqktrgxH9VfVEbqnqwU` | `https://api.mainnet-beta.solana.com` |

### Contract Instructions

1. **`initialize_config`**: Set up program treasury and authority
2. **`initialize_account`**: Create user account with 10,000 virtual USDC (requires SOL entry fee)
3. **`buy_yes`** / **`buy_no`**: Open YES/NO positions in prediction markets
4. **`close_position`**: Exit position and realize P&L

## Installation & Development

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ | Frontend runtime |
| npm/yarn | Latest | Package management |
| Rust | 1.70+ | Smart contract compilation |
| Solana CLI | 1.16+ | Solana development tools |
| Anchor CLI | 0.30+ | Anchor framework |

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd PolyMock
   ```

2. **Install frontend dependencies**
   ```bash
   cd frontend
   npm install
   ```

3. **Install contract dependencies**
   ```bash
   cd ../contracts
   npm install
   ```

4. **Configure Solana CLI** (for contract development)
   ```bash
   # Set cluster to MagicBlock devnet
   solana config set --url https://rpc.magicblock.app/devnet/

   # Create/configure wallet
   solana-keygen new --outfile ~/.config/solana/phantom.json

   # Request devnet SOL airdrop
   solana airdrop 2
   ```

### Development Workflow

#### Frontend Development
```bash
cd frontend
npm run dev
# Opens development server at http://localhost:5173
```

**Available Scripts:**
- `npm run dev` - Start Vite dev server with HMR
- `npm run build` - Production build with optimizations
- `npm run preview` - Preview production build locally
- `npm run check` - Run Svelte type checking

#### Smart Contract Development

**Build the program:**
```bash
cd contracts
anchor build
```

**Deploy to devnet:**
```bash
anchor deploy --provider.cluster https://rpc.magicblock.app/devnet/
```

**Initialize program configuration:**
```bash
anchor run initialise
# This script initializes the program config with treasury settings
```

**Run integration tests:**
```bash
anchor test
# Or with custom script:
npm run test
```

**Local development:**
```bash
# Terminal 1: Start local validator
solana-test-validator

# Terminal 2: Deploy to local
anchor deploy --provider.cluster localnet
```

## API Integration

### Polymarket API Endpoints

The application integrates with Polymarket's public API:

- **Markets List**: `GET https://clob.polymarket.com/markets`
- **Market Details**: `GET https://clob.polymarket.com/markets/{market_id}`
- **Order Book**: `GET https://clob.polymarket.com/order-book/{token_id}`

### Dome API (Backtesting)

Historical market data powered by Dome API:

- **Markets**: `GET /v1/polymarket/markets`
- **Candlesticks**: `GET /v1/polymarket/candlesticks/{condition_id}`
- **Historical Prices**: `GET /v1/polymarket/market-price/{token_id}`
- **Orderbooks**: `GET /v1/polymarket/orderbooks`

Documentation: https://docs.domeapi.io/

## Using the Backtesting Engine

### Quick Start

1. Navigate to `/backtesting-v2` in your browser
2. Configure your strategy:
   - Set date range (e.g., last 30 days)
   - Choose entry type (YES, NO, or BOTH)
   - Set position sizing (fixed amount or % of bankroll)
   - Configure exit rules (stop loss, take profit, max hold time)
3. Click "Run Backtest"
4. View results: metrics, equity curve, and trade history
5. Export data (CSV or JSON) for further analysis

### Strategy Examples

**Conservative Strategy:**
- Entry: YES positions only, price 0.35-0.65
- Exit: 15% stop loss, 40% take profit
- Position: 5% of bankroll

**Aggressive Strategy:**
- Entry: Both YES and NO, price 0.60-0.80
- Exit: 10% stop loss, 20% take profit, max 24h hold
- Position: Fixed $200

See `BACKTESTING_GUIDE.md` for detailed documentation.

### Metrics Explained

**Free Metrics:**
- Total trades, win rate, P&L, ROI
- Average win/loss, best/worst trade
- YES vs NO performance breakdown

**Pro Metrics:**
- Equity curve over time
- Max drawdown, Sharpe ratio, volatility
- Expectancy, median win/loss
- Consecutive wins/losses

### Performance

- 50-100 markets, 30 days: ~30-60 seconds
- Results depend on market filters and date range
- Export to CSV for Excel analysis

## Environment Variables

Create `.env` files in the respective directories:

### Frontend `.env`
```bash
PUBLIC_SOLANA_RPC_URL=https://rpc.magicblock.app/devnet/
PUBLIC_PROGRAM_ID=AmuwGa8LXKW63ZHzGm1TkqSugbJ8fMVXr6HKksYkwUNT
PUBLIC_POLYMARKET_API=https://clob.polymarket.com
DOME_API_KEY=your_dome_api_key_here  # Required for backtesting
```

**Get your Dome API key:**
1. Visit https://domeapi.io
2. Sign up for an account
3. Generate API key from dashboard
4. Add to `.env` file

### Contracts `.env`
```bash
ANCHOR_PROVIDER_URL=https://rpc.magicblock.app/devnet/
ANCHOR_WALLET=~/.config/solana/phantom.json
TREASURY_WALLET=<treasury-public-key>
```

### Frontend Tests
```bash
cd frontend
npm run test
```

### Smart Contract Tests
```bash
cd contracts
anchor test
```

**Test Coverage:**
- Account initialization with various entry fees
- Position opening and closing logic
- P&L calculation accuracy
- Balance validation and overflow protection
- Authority and ownership checks


MIT License


curl --request GET \
  --url 'https://api.domeapi.io/v1/polymarket/markets?market_slug=will-gavin-newsom-win-the-2028-us-presidential-election' \
  --header 'Authorization: Bearer ab2f39be5223770bbef420594277b9db2768bb89'


  ab2f39be5223770bbef420594277b9db2768bb89



