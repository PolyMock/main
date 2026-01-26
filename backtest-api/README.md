# Polymock Backtest API

Standalone backtest engine API for Polymock. This service runs backtests independently from the main application to avoid timeout issues.

## Features

- **Standalone Service**: Runs independently from the main Polymock app
- **No Timeouts**: Can handle long-running backtests without worker time limits
- **Scalable**: Deploy on Railway, Render, or any Node.js hosting platform
- **RESTful API**: Simple JSON API for running backtests

## Quick Start

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
# Edit .env and add your DOME_API_KEY
```

3. Run in development mode:
```bash
npm run dev
```

The API will be available at `http://localhost:3001`

### Build for Production

```bash
npm run build
npm start
```

## API Endpoints

### Health Check
```
GET /health
```

Returns the API status.

### Run Backtest
```
POST /api/backtest
Content-Type: application/json

{
  "marketIds": ["market_id_1", "market_id_2"],
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "initialBankroll": 10000,
  "entryType": "YES",
  "positionSizing": {
    "type": "PERCENTAGE",
    "value": 10
  },
  ...
}
```

Returns backtest results with trades, metrics, and equity curve.

## Deploy to Railway

1. Create a new project on [Railway](https://railway.app)

2. Connect your GitHub repository

3. Set environment variables in Railway:
   - `DOME_API_KEY`: Your Dome API key
   - `ALLOWED_ORIGINS`: `https://polymock.app,https://www.polymock.app`
   - `NODE_ENV`: `production`

4. Railway will auto-detect the Node.js app and deploy

5. Copy the deployed URL (e.g., `https://your-app.up.railway.app`)

6. Update your frontend environment variable:
   ```
   VITE_BACKTEST_API_URL=https://your-app.up.railway.app
   ```

## Environment Variables

- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment (development/production)
- `DOME_API_KEY`: API key for Dome
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins

## Architecture

- **Express.js**: Web framework
- **TypeScript**: Type-safe development
- **Backtest Engine**: Shared code from main Polymock app
- **CORS**: Configured for cross-origin requests from Polymock app

## Performance

- No CPU time limits (unlike Cloudflare Workers)
- Can handle multi-market backtests
- Scales based on Railway instance size
- Async processing with detailed logging
