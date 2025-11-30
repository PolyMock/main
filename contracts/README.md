# Polymarket Paper Trading Smart Contract

A Solana smart contract for paper trading Polymarket predictions using Anchor framework.

## Overview

This contract allows users to:
- Initialize a paper trading account with 10,000 USDC virtual balance
- Buy YES/NO shares in prediction markets
- Close positions and realize profits/losses
- Track trading performance

## Deployment

- **Network**: MagicBlock Devnet
- **Program ID**: `AmuwGa8LXKW63ZHzGm1TkqSugbJ8fMVXr6HKksYkwUNT`
- **RPC URL**: `https://rpc.magicblock.app/devnet/`

## Quick Start

### Build
```bash
anchor build
```

### Deploy
```bash
anchor deploy
```

### Initialize
```bash
anchor run initialise
```

## Contract Functions

### `initialize_config`
Initialize the global program configuration (one-time setup).

### `initialize_account`  
Create a new paper trading account with 10,000 USDC virtual balance.

### `buy_yes` / `buy_no`
Purchase YES or NO shares in a prediction market.

### `close_position`
Close an open position and realize profit/loss.

## Development

### Requirements
- Rust 1.70+
- Solana CLI 1.16+
- Anchor CLI 0.30+
- Node.js 18+

### Scripts
- `anchor run initialise` - Initialize the contract configuration
- `anchor test` - Run tests
- `anchor build` - Build the contract

## License

MIT