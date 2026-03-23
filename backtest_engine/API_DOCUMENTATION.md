# Backtest API Documentation

## Overview

FastAPI backend for backtesting trading strategies on historical prediction market data (Polymarket). Accepts user strategy code (Part 2 only) and runs it against historical trade data with customizable filters.

**Base URL**: `https://backtest-engine-api.fly.dev`

**All parameters from `BacktestEngine.__init__()` are exposed as request fields.**

---

## Table of Contents

1. [Health Check](#1-health-check)
2. [Run Backtest](#2-run-backtest)
3. [Validate Strategy](#3-validate-strategy)
4. [Get Example Strategy](#4-get-example-strategy)
5. [Showcase Trades](#5-showcase-trades-paginated)

---

## 1. Health Check
**`GET /health`**

Check API server status.

**Response (200 OK)**:
```json
{
  "status": "healthy",
  "timestamp": "2026-03-22T12:00:00.123456",
  "version": "1.0.0"
}
```

---

## 2. Run Backtest
**`POST /backtest`**

Execute a strategy-based backtest on historical Polymarket data.

**Rate Limit**: 10 requests/minute per IP  
**Timeout**: 20+ minutes (typical backtest duration: 5-20 minutes)

### Request Body (JSON)

```json
{
  "strategy_code": "threshold_low = 0.01\nmarket_id = trade.get(\"market_id\")\nposition = trade.get(\"position\")\ndirection = \"hold\"\namount = 0\n\nif trade.get(\"price\") <= threshold_low:\n    direction = \"buy\"\n    amount = 10\n\naction = {\"market_id\": market_id, \"position\": position, \"direction\": direction, \"amount\": amount}\n\nreturn action",
  
  "initial_cash": 10000.0,
  "platform": ["polymarket"],
  "reimburse_open_positions": false,
  
  "strat_var": [true, true, true, true, true, true, true, true, true, true, true, true],
  
  "timestamp_start": null,
  "timestamp_end": null,
  
  "market_id": null,
  "market_title": null,
  "market_category": null,
  "volume_inf": null,
  "volume_sup": null,
  
  "position": null,
  "possible_outcomes": null,
  "price_inf": 0.0,
  "price_sup": 1.0,
  "amount_inf": null,
  "amount_sup": null,
  
  "wallet_maker": null,
  "wallet_taker": null
}
```

### Parameter Reference

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| **strategy_code** | string | **required** | Python code for Part 2 of strategy (inner logic only, no function signature) |
| **initial_cash** | float | 10000 | Starting portfolio cash (USD) |
| **platform** | list[str] | ["polymarket"] | Data source: "polymarket" or both ["polymarket", "kalshi"] |
| **reimburse_open_positions** | bool | false | Refund unsettled positions at market price on final trade |
| **strat_var** | list[bool] | [true]*12 | Columns to load: [platform, timestamp, title, volume, market_id, category, position, possible_outcomes, price, amount, wallet_maker, wallet_taker] |
| timestamp_start | string (ISO) | null | Start date (e.g., "2025-01-25T00:00:00") |
| timestamp_end | string (ISO) | null | End date (e.g., "2025-01-26T23:59:59") |
| market_id | list[str] | null | Filter by market IDs |
| market_title | list[str] | null | Filter by exact market titles |
| market_category | list[str] | null | Filter by category (e.g., "sports", "politics") |
| volume_inf | float | null | Minimum volume |
| volume_sup | float | null | Maximum volume |
| position | list[str] | null | Filter by position: ["Yes"], ["No"], or both |
| possible_outcomes | list[str] | null | Filter by outcome names |
| price_inf | float | null | Minimum price (0.0-1.0) |
| price_sup | float | null | Maximum price (0.0-1.0) |
| amount_inf | float | null | Minimum trade amount |
| amount_sup | float | null | Maximum trade amount |
| wallet_maker | list[str] | null | Filter by maker wallet address |
| wallet_taker | list[str] | null | Filter by taker wallet address |

### ⚠️ Critical Columns (Cannot Disable)

The following `strat_var` indices are **mandatory** (always loaded regardless of setting):
- Index 1: `timestamp` — needed for settlement tracking
- Index 4: `market_id` — needed for trade validation
- Index 6: `position` — needed for position management
- Index 8: `price` — needed for P&L calculations

### Strategy Code Format

Submit **Part 2 only** (the inner logic without function wrapper):

```python
# ❌ WRONG - Do not submit the full function
def strategy_function(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    ...
    return action

# ✅ CORRECT - Submit only the inner code
threshold_low = 0.01
market_id = trade.get("market_id")
position = trade.get("position")
direction = "hold"
amount = 0

if trade.get("price") <= threshold_low:
    direction = "buy"
    amount = 10

action = {"market_id": market_id, "position": position, "direction": direction, "amount": amount}
return action
```

The API automatically assembles the full function:
1. **Part 1** (signature): `def strategy_function(trade, trade_log, portfolio, user_perso_parameters):`
2. **Part 2** (your code): The strategy logic you submit
3. **Part 3** (return): `return action`

### Response (200 OK - Success)

```json
{
  "status": "success",
  "trades_executed": 665,
  "buy_count": 665,
  "sell_count": 0,
  "unique_markets_traded": 1,
  "final_cash": 9991.27,
  "total_pnl": -8.73,
  "roi_percent": -0.0873,
  "max_drawdown": -0.00841,
  "sharpe_ratio": -0.0207,
  "sortino_ratio": -0.0119,
  "calmar_ratio": -0.0828,
  "volatility": 0.0220,
  "downside_risk": 0.0381,
  "total_positions_settled": 0,
  "winning_positions": 0,
  "losing_positions": 0,
  "execution_time_seconds": 40.17
}
```

### Response (400 Bad Request - Validation Error)

```json
{
  "detail": "Value error, Invalid start date format: 2025-01-25. Use ISO format (e.g., 2025-01-01T00:00:00)"
}
```

### Response (422 Unprocessable Entity - Invalid Request)

```json
{
  "detail": [
    {
      "loc": ["body", "strategy_code"],
      "msg": "Strategy code cannot be empty",
      "type": "value_error"
    }
  ]
}
```

### Response (500 Internal Server Error)

```json
{
  "detail": "Backtest execution failed: Strategy execution timeout"
}
```

### Response Metrics Explained

| Metric | Definition |
|--------|-----------|
| `trades_executed` | Total number of buy/sell actions executed |
| `buy_count` | Number of "buy" trades |
| `sell_count` | Number of "sell" trades |
| `unique_markets_traded` | Number of distinct markets with trades |
| `final_cash` | Portfolio cash balance at end (USD) |
| `total_pnl` | Total Profit/Loss in absolute dollars |
| `roi_percent` | Return on Investment as percentage |
| `max_drawdown` | Largest peak-to-trough decline |
| `sharpe_ratio` | Risk-adjusted return (assumes 0% risk-free rate) |
| `sortino_ratio` | Downside risk-adjusted return |
| `calmar_ratio` | Return / Max Drawdown ratio |
| `volatility` | Standard deviation of returns |
| `downside_risk` | Volatility of downside returns only |
| `total_positions_settled` | Number of positions that closed |
| `winning_positions` | Settled positions with positive PnL |
| `losing_positions` | Settled positions with negative PnL |
| `execution_time_seconds` | Wall-clock time for backtest computation |

---

## 3. Validate Strategy
**`POST /validate-strategy`**

Pre-validate strategy code syntax and security without running a full backtest.

### Request Body

```json
{
  "strategy_code": "threshold_low = 0.01\nif trade.get(\"price\") <= threshold_low:\n    direction = \"buy\"\nreturn {\"market_id\": trade[\"market_id\"], \"position\": trade[\"position\"], \"direction\": direction, \"amount\": 10}"
}
```

### Response (200 OK - Valid)

```json
{
  "status": "valid",
  "message": "Strategy code is syntactically correct and safe to execute"
}
```

### Response (400 Bad Request - Invalid)

```json
{
  "detail": "Strategy validation failed: SyntaxError: invalid syntax (line 1)"
}
```

---

## 4. Get Example Strategy
**`GET /strategies/example`**

Retrieve example strategy code and parameter documentation.

### Response (200 OK)

```json
{
  "example_code": "# Simple mean reversion strategy\nthreshold_low = 0.01\nmarket_id = trade.get(\"market_id\")\nposition = trade.get(\"position\")\ndirection = \"hold\"\namount = 0\n\nif trade.get(\"price\") <= threshold_low:\n    direction = \"buy\"\n    amount = 10\n\naction = {\"market_id\": market_id, \"position\": position, \"direction\": direction, \"amount\": amount}\nreturn action",
  "description": "A simple mean reversion strategy that buys when price <= $0.01",
  "parameters": {
    "trade": {
      "type": "dict",
      "description": "Current trade data with keys: market_id, position, price, amount, timestamp, platform, and other fields based on strat_var selection"
    },
    "trade_log": {
      "type": "list",
      "description": "All previously executed trades (read-only)"
    },
    "portfolio": {
      "type": "dict",
      "description": "Current portfolio state: {cash: float, positions: {(market_id, position): amount}}"
    },
    "user_perso_parameters": {
      "type": "dict",
      "description": "Persistent state dict that survives across trades"
    }
  },
  "return_format": {
    "market_id": "str - Market to trade",
    "position": "str - 'Yes' or 'No'",
    "direction": "str - 'buy', 'sell', or 'hold'",
    "amount": "int - Number of contracts",
    "take_profit": "(optional) float - Exit price for profit",
    "stop_loss": "(optional) float - Exit price for loss"
  }
}
```

---

## 5. Showcase Trades (Paginated)
**`POST /trades`**

Get paginated trade data with filtering support. Perfect for frontend preview/exploration of historical market data.

**Rate Limit**: 20 requests/minute per IP

### Request Body

```json
{
  "page": 1,
  "limit": 100,
  "platform": ["polymarket"],
  
  "strat_var": null,
  
  "timestamp_start": "2025-01-01T00:00:00",
  "timestamp_end": "2025-01-31T23:59:59",
  
  "market_id": null,
  "market_title": null,
  "market_category": null,
  "volume_inf": null,
  "volume_sup": null,
  
  "position": null,
  "possible_outcomes": null,
  "price_inf": 0.0,
  "price_sup": 1.0,
  "amount_inf": null,
  "amount_sup": null,
  
  "wallet_maker": null,
  "wallet_taker": null
}
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | int | 1 | Page number (1-indexed) |
| limit | int | 100 | Trades per page (1-10000) |
| platform | list[str] | ["polymarket"] | Filter by platform |
| strat_var | list[bool] | null | Columns to include (null = all) |
| timestamp_start | string (ISO) | null | Start date |
| timestamp_end | string (ISO) | null | End date |
| market_id | list[str] | null | Filter by market IDs |
| market_title | list[str] | null | Filter by title |
| market_category | list[str] | null | Filter by category |
| volume_inf | float | null | Min volume |
| volume_sup | float | null | Max volume |
| position | list[str] | null | Filter positions: ["Yes"], ["No"], or both |
| possible_outcomes | list[str] | null | Filter outcome names |
| price_inf | float | null | Min price (0.0-1.0) |
| price_sup | float | null | Max price (0.0-1.0) |
| amount_inf | float | null | Min trade amount |
| amount_sup | float | null | Max trade amount |
| wallet_maker | list[str] | null | Filter maker wallets |
| wallet_taker | list[str] | null | Filter taker wallets |

### Response (200 OK)

```json
{
  "trades": [
    {
      "platform": "polymarket",
      "timestamp": "2025-01-25T14:32:45",
      "title": "Will the Jets make the first pick of the 2025 NFL Draft?",
      "volume": 150000.50,
      "market_id": "0xABC123def",
      "category": "sports",
      "position": "Yes",
      "possible_outcomes": ["Yes", "No"],
      "price": 0.65,
      "amount": 100,
      "wallet_maker": "0x1234abcd...",
      "wallet_taker": "0x5678efgh..."
    }
  ],
  "page": 1,
  "limit": 100,
  "total_trades": 1245,
  "total_pages": 13,
  "platform": "polymarket"
}
```

### Response (400 Bad Request)

```json
{
  "detail": "Validation error: Invalid page number: must be >= 1"
}
```

---

## Security Features

✅ **RestrictedPython Sandbox**: User-provided strategy code is compiled with RestrictedPython
- Dangerous imports blocked: `os`, `subprocess`, `socket`, `__import__`, `eval`, etc.
- Only safe modules allowed: `math`, `datetime`, `json`
- No file I/O or network access

✅ **Timeout Protection**: Each strategy evaluation limited to 5 seconds

✅ **Input Validation**: All parameters validated via Pydantic before execution

✅ **Rate Limiting**: Maximum 10 requests/minute per client IP

---

## Example Usage

### Python (requests)
```python
import requests

response = requests.post(
    "http://localhost:8000/backtest",
    json={
        "strategy_code": '''
def mean_reversion(trade, trade_log, portfolio, user_perso_parameters):
    if trade.get("price") <= 0.01:
        return {
            "market_id": trade["market_id"],
            "position": trade["position"],
            "direction": "buy",
            "amount": 10
        }
    return {
        "market_id": trade["market_id"],
        "position": trade["position"],
        "direction": "hold",
        "amount": 0
    }
''',
        "initial_cash": 10000,
        "platform": ["polymarket"],
        "price_sup": 0.1,
        "reimburse_open_positions": False
    },
    timeout=120
)

if response.status_code == 200:
    results = response.json()
    print(f"ROI: {results['roi_percent']:.2f}%")
    print(f"Sharpe Ratio: {results['sharpe_ratio']:.4f}")
else:
    print(f"Error: {response.status_code}")
    print(response.json())
```

### JavaScript (fetch)
```javascript
const response = await fetch("http://localhost:8000/backtest", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    strategy_code: `
def mean_reversion(trade, trade_log, portfolio, user_perso_parameters):
    if trade.get("price") <= 0.01:
        return {
            "market_id": trade["market_id"],
            "position": trade["position"],
            "direction": "buy",
            "amount": 10
        }
    return {
        "market_id": trade["market_id"],
        "position": trade["position"],
        "direction": "hold",
        "amount": 0
    }
`,
    initial_cash: 10000,
    platform: ["polymarket"],
    price_sup: 0.1,
    reimburse_open_positions: false
  })
});

const data = await response.json();
console.log(`ROI: ${data.roi_percent.toFixed(2)}%`);
```

### cURL
```bash
curl -X POST http://localhost:8000/backtest \
  -H "Content-Type: application/json" \
  -d '{
    "strategy_code": "def strategy(trade, trade_log, portfolio, user_perso_parameters): return {\"market_id\": trade[\"market_id\"], \"position\": trade[\"position\"], \"direction\": \"hold\", \"amount\": 0}",
    "initial_cash": 10000,
    "platform": ["polymarket"],
    "price_sup": 0.1
  }' \
  --max-time 120
```

---

## Response Metrics Explained

| Metric | Definition |
|--------|-----------|
| `trades_executed` | Number of buy/sell actions executed |
| `buy_count` | Number of buy trades |
| `sell_count` | Number of sell trades |
| `unique_markets_traded` | Number of distinct markets traded |
| `final_cash` | Portfolio value in cash at end |
| `total_pnl` | Profit/Loss in absolute dollars |
| `roi_percent` | Return on initial investment (%) |
| `sharpe_ratio` | Risk-adjusted return (Sharpe multiplier) |
| `sortino_ratio` | Risk-adjusted return (downside volatility only) |
| `calmar_ratio` | Return / Max Drawdown ratio |
| `volatility` | Annualized volatility of returns |
| `downside_risk` | Annualized downside deviation |
| `max_drawdown` | Largest peak-to-trough decline |
| `total_positions_settled` | Markets that reached resolution |
| `winning_positions` | Positions that matched outcome |
| `losing_positions` | Positions that lost |
| `execution_time_seconds` | Wall-clock time to run backtest |

---

## Known Limitations

⚠️ **Empty Result Sets**: If filters result in no matching trades, BacktestEngine may crash when loading outcomes. Ensure your filters match at least some trades.

⚠️ **Large Date Ranges**: Very long backtests (years of data) can exceed reasonable execution time.

⚠️ **Timestamp Format**: Dates accept both ISO 8601 and standard formats:
   - ✅ ISO format (recommended): `2024-01-01T00:00:00`
   - ✅ Standard format: `2024-01-01 00:00:00`

---

## Starting the API

```bash
cd /home/ubuntu/polymock/backtest_engine
source .venv/bin/activate
python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

**Access interactive docs**: http://localhost:8000/docs (Swagger UI)

---

## Dependencies

See `requirements.txt`:
- FastAPI 0.104+
- Uvicorn (ASGI server)
- Pydantic v2 (validation)
- RestrictedPython (security sandbox)
- DuckDB (trade data queries)
- pandas, pyarrow (data processing)

---

## Configuration

Default API settings (in `api/main.py`):
- **Port**: 8000
- **Host**: 0.0.0.0
- **Rate Limits**: 
  - `/backtest`: 10 requests/minute per IP
  - `/trades`: 20 requests/minute per IP
  - `/validate-strategy`: 10 requests/minute per IP
- **Strategy Timeout**: 5 seconds per trade evaluation
- **CORS Origins**: http://localhost:3000, http://localhost:5173, *

---

## Support

For issues or questions:
1. Check `/health` endpoint first
2. Validate strategy syntax with `/validate-strategy` endpoint
3. Review error messages in response
4. Check Uvicorn logs for detailed traceback
