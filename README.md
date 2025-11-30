# PolyMock

A paper trading platform for Polymarket predictions built on Solana blockchain.

## Overview

PolyMock allows users to practice trading on Polymarket predictions with virtual USDC, providing a risk-free environment to test strategies and learn about prediction markets.

### Features

- **Virtual Trading**: Start with 10,000 USDC virtual balance
- **Real Market Data**: Live price feeds from Polymarket
- **Market Analysis**: Interactive charts and market information
- **Position Tracking**: Monitor your trades and performance
- **Competition Mode**: Compete with other paper traders

## Project Structure

```
PolyMock/
├── frontend/           # Svelte web application
│   ├── src/
│   │   ├── lib/       # Components and utilities
│   │   └── routes/    # Pages and API endpoints
│   └── static/        # Static assets
└── contracts/         # Solana smart contracts
    ├── programs/      # Anchor program source
    └── tests/         # Contract tests
```

## Quick Start

### Prerequisites

- Node.js 18+
- Rust 1.70+
- Solana CLI 1.16+
- Anchor CLI 0.30+

### Setup

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

### Development

#### Frontend Development
```bash
cd frontend
npm run dev
```

#### Smart Contract Development
```bash
cd contracts
anchor build
anchor deploy
anchor run initialise
```

## Smart Contract

**Network**: MagicBlock Devnet  
**Program ID**: `AmuwGa8LXKW63ZHzGm1TkqSugbJ8fMVXr6HKksYkwUNT`  
**RPC URL**: `https://rpc.magicblock.app/devnet/`

### Contract Features
- Initialize paper trading accounts
- Buy YES/NO shares with virtual USDC
- Close positions and track P&L
- Competition leaderboards

## Tech Stack

### Frontend
- **Svelte/SvelteKit**: Modern web framework
- **TypeScript**: Type-safe development
- **Vite**: Build tool and dev server

### Backend
- **Solana**: Blockchain platform
- **Anchor**: Solana development framework
- **Rust**: Smart contract language

### APIs
- **Polymarket API**: Live market data
- **Chart.js**: Interactive price charts

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details