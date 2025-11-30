# PolyPaper

A paper trading platform for Polymarket prediction markets, built with SvelteKit.

## Overview

PolyPaper is a demo trading platform that allows users to explore and simulate trading on Polymarket prediction markets. It features real-time market data, live news feeds, and SOL price tracking from Pyth Network.

## Features

- **Live Polymarket Data**: Fetch and display real prediction markets from Polymarket API
- **Real-time Price Feeds**: SOL/USD prices from Pyth Network
- **Crypto News**: Live news feed from CryptoCompare
- **Paper Trading**: Simulate trading without real money (demo mode)
- **Competition Mode**: Mock leaderboards and trading activity
- **Terminal-style UI**: Bloomberg-inspired interface design

## Data Sources

- **Polymarket API**: Prediction market data (https://docs.polymarket.com/developers/gamma-markets-api/get-markets)
- **Pyth Network**: Real-time SOL price feeds
- **CryptoCompare**: Cryptocurrency news and market data

## Tech Stack

- **Framework**: SvelteKit
- **Language**: TypeScript
- **Styling**: Pure CSS (terminal/Bloomberg-inspired design)
- **API Integration**: Axios for HTTP requests
- **Price Data**: Pyth Hermes client

## Getting Started

### Installation

1. Clone the repository
2. Install dependencies:

```sh
npm install
```

### Development

Start the development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

### Building

To create a production version:

```sh
npm run build
```

Preview the production build:

```sh
npm run preview
```

## Project Structure

```
src/
├── lib/
│   └── polymarket.ts    # Polymarket API client
├── routes/
│   ├── +page.svelte     # Main terminal interface
│   └── competition/     # Competition/leaderboard page
└── app.html             # HTML template
```

## API Integration

### Polymarket Markets

The platform fetches live prediction markets from the Polymarket API, displaying:
- Market questions and descriptions
- Current prices and trading volume
- End dates and market categories
- Tags and market metadata

### Price Feeds

Real-time SOL/USD price data is fetched from Pyth Network's Hermes API, showing:
- Current spot price
- Price changes and trends
- Confidence intervals
- EMA (Exponential Moving Average) prices

### News Feed

Cryptocurrency news is sourced from CryptoCompare API, featuring:
- Latest crypto market news
- Article timestamps and sources
- Clickable links to full articles
- Real-time updates

## Demo Mode

This is a demo/paper trading platform. No real trades are executed, and all trading activity is simulated for educational and demonstration purposes.

## Deployment

To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## License
