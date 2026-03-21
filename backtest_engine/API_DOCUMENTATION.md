# Backtest API Documentation

## Overview

FastAPI backend that accepts user strategy code and runs backtests on historical prediction market data (Polymarket and Kalshi). All parameters from `BacktestEngine.__init__()` are exposed.

**Base URL**: `http://localhost:8000`

---

## Endpoints

### 1. Health Check
**`GET /health`**

Check API server status.

**Response (200)**:
```json
{
  "status": "healthy",
  "timestamp": "2026-03-17T10:30:00.000000",
  "version": "1.0.0"
}
```

---

### 2. Run Backtest
**`POST /backtest`**

Execute a strategy-based backtest on historical data.

**Rate Limit**: 10 requests/minute per IP

**Request Body** (JSON):
```json
{
  "strategy_code": "def mean_reversion(trade, trade_log, portfolio, user_perso_parameters):\n    # Your strategy here\n    return {...}",
  
  "initial_cash": 10000.0,
  "platform": ["polymarket"],
  "reimburse_open_positions": false,
  
  "strat_var": [true, true, true, true, true, true, true, true, true, true, true, true],
  
  "timestamp_start": "2024-01-01T00:00:00",
  "timestamp_end": "2024-12-31T23:59:59",
  
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

**Parameter Details**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `strategy_code` | string | required | Python function code defining your strategy |
| `initial_cash` | float | 10000 | Starting portfolio cash |
| `platform` | list[str] | ["polymarket"] | Sources: "polymarket", "kalshi", or both |
| `reimburse_open_positions` | bool | false | Refund unsettled positions at market price on final trade |
| `strat_var` | list[bool] | [true]*12 | Columns to load: [platform, timestamp, title, volume, market_id, category, position, possible_outcomes, price, amount, wallet_maker, wallet_taker] |
| `timestamp_start` | string | null | ISO format, e.g., "2024-01-01T00:00:00" |
| `timestamp_end` | string | null | ISO format, e.g., "2024-12-31T23:59:59" |
| `market_id` | list[str] | null | Filter by specific market IDs |
| `market_title` | list[str] | null | Filter by market title (Kalshi only) |
| `market_category` | list[str] | null | Filter by category (e.g., "politics", "sports") |
| `volume_inf` | float | null | Minimum volume (Kalshi only) |
| `volume_sup` | float | null | Maximum volume (Kalshi only) |
| `position` | list[str] | null | Filter by position: ["Yes"], ["No"], or both |
| `possible_outcomes` | list[str] | null | Filter by outcome names |
| `price_inf` | float | null | Minimum price (0.0-1.0) |
| `price_sup` | float | null | Maximum price (0.0-1.0) |
| `amount_inf` | float | null | Minimum amount traded |
| `amount_sup` | float | null | Maximum amount traded |
| `wallet_maker` | list[str] | null | Filter by maker wallet address (Polymarket only) |
| `wallet_taker` | list[str] | null | Filter by taker wallet address (Polymarket only) |

⚠️ **Critical Columns**: The following `strat_var` indices are mandatory and cannot be disabled:
- Index 1: `timestamp` (needed for settlement tracking)
- Index 4: `market_id` (needed for trade validation)
- Index 6: `position` (needed for position management)
- Index 8: `price` (needed for calculations)

**Response (200)**:
```json
{
  "status": "success",
  "trades_executed": 60890,
  "buy_count": 60890,
  "sell_count": 0,
  "unique_markets_traded": 5294,
  "final_cash": 9635.57,
  "total_pnl": -364.43,
  "roi_percent": -3.64,
  "max_drawdown": -0.101,
  "sharpe_ratio": -0.124,
  "sortino_ratio": -0.064,
  "calmar_ratio": -0.117,
  "volatility": 0.074,
  "downside_risk": 0.142,
  "total_positions_settled": 49,
  "winning_positions": 49,
  "losing_positions": 0,
  "execution_time_seconds": 62.88
}
```

**Response (400 - Validation Error)**:
```json
{
  "status": "error",
  "error": "Validation error: Invalid strategy code: SyntaxError ...",
  "detail": null
}
```

**Response (408 - Timeout)**:
```json
{
  "status": "error",
  "error": "Strategy execution timeout (exceeded 5 seconds per trade)",
  "detail": null
}
```

**Response (422 - Invalid Request)**:
```json
{
  "status": "error",
  "error": "Value error, Column 'timestamp' (index 1) is critical and must be enabled in strat_var",
  "detail": null
}
```

---

### 3. Example Strategy
**`GET /strategies/example`**

Get example strategy code and parameter documentation.

**Response (200)**:
```json
{
  "example_code": "def mean_reversion(trade, trade_log, portfolio, user_perso_parameters):\n    ...",
  "description": "A simple strategy that buys when price <= 0.01",
  "parameters": {
    "trade": "Current trade dict with keys: market_id, position, price, amount, ...",
    "trade_log": "List of all executed trades",
    "portfolio": "Dict with cash and positions",
    "user_perso_parameters": "Dict for storing strategy state across trades"
  },
  "return": {
    "market_id": "The market to trade",
    "position": "Yes or No",
    "direction": "buy, sell, or hold",
    "amount": "Number of contracts",
    "take_profit": "(optional) Exit price for profit",
    "stop_loss": "(optional) Exit price for loss"
  }
}
```

---

### 4. Validate Strategy
**`POST /validate-strategy`**

Pre-validate strategy code syntax and security without running a full backtest.

**Request Body**:
```json
{
  "strategy_code": "def my_strategy(trade, trade_log, portfolio, user_perso_parameters):\n    return {...}"
}
```

**Response (200)**:
```json
{
  "status": "valid",
  "message": "Strategy code is syntactically correct and safe"
}
```

**Response (400 - Invalid)**:
```json
{
  "status": "error",
  "error": "Strategy validation failed: SyntaxError: invalid syntax ..."
}
```

---

### 5. Showcase Trades (Paginated)
**`POST /trades`**

Get paginated trade data with full filtering support for frontend preview/exploration. Perfect for displaying historical trades with pagination, filtering, and sorting.

**Rate Limit**: 20 requests/minute per IP

**Request Body** (JSON):
```json
{
  "page": 1,
  "limit": 100,
  "platform": ["polymarket"],
  
  "strat_var": null,
  
  "timestamp_start": "2024-01-01T00:00:00",
  "timestamp_end": "2024-12-31T23:59:59",
  
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

**Parameter Details**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number (1-indexed) |
| `limit` | int | 100 | Trades per page (1-10000) |
| `platform` | list[str] | ["polymarket"] | Filter by platform(s): "polymarket", "kalshi", or both |
| `strat_var` | list[bool] | null | Columns to include: [platform, timestamp, title, volume, market_id, category, position, possible_outcomes, price, amount, wallet_maker, wallet_taker]. `null` = all columns |
| `timestamp_start` | string | null | ISO format start date, e.g., "2024-01-01T00:00:00" (accepts both `T` and SPACE separators) |
| `timestamp_end` | string | null | ISO format end date, e.g., "2024-12-31T23:59:59" |
| `market_id` | list[str] | null | Filter by specific market IDs |
| `market_title` | list[str] | null | Filter by market title (Kalshi only) |
| `market_category` | list[str] | null | Filter by category (e.g., "politics", "sports") |
| `volume_inf` | float | null | Minimum volume (Kalshi only) |
| `volume_sup` | float | null | Maximum volume (Kalshi only) |
| `position` | list[str] | null | Filter by position: ["Yes"], ["No"], or both |
| `possible_outcomes` | list[str] | null | Filter by outcome names |
| `price_inf` | float | null | Minimum price (0.0-1.0) |
| `price_sup` | float | null | Maximum price (0.0-1.0) |
| `amount_inf` | float | null | Minimum amount traded |
| `amount_sup` | float | null | Maximum amount traded |
| `wallet_maker` | list[str] | null | Filter by maker wallet address (Polymarket only) |
| `wallet_taker` | list[str] | null | Filter by taker wallet address (Polymarket only) |

**Response (200)**:
```json
{
  "trades": [
    {
      "platform": "polymarket",
      "timestamp": "2024-01-15 14:32:45",
      "title": "Will USD/EUR go above 1.10 by April 1?",
      "volume": 150000.5,
      "market_id": "0xABC123",
      "category": "economics",
      "position": "Yes",
      "possible_outcomes": ["Yes", "No"],
      "price": 0.65,
      "amount": 100,
      "wallet_maker": "0x1234...",
      "wallet_taker": "0x5678..."
    },
    {
      "platform": "polymarket",
      "timestamp": "2024-01-15 14:31:20",
      "title": "Will BTC reach $50k by March?",
      "volume": 280000.0,
      "market_id": "0xDEF456",
      "category": "crypto",
      "position": "No",
      "possible_outcomes": ["Yes", "No"],
      "price": 0.42,
      "amount": 250,
      "wallet_maker": "0x9ABC...",
      "wallet_taker": "0xDEF0..."
    }
  ],
  "page": 1,
  "limit": 100,
  "total_trades": 1245,
  "total_pages": 13,
  "platform": "polymarket"
}
```

**Response (400 - Validation Error)**:
```json
{
  "status": "error",
  "detail": "Validation error: Invalid start date format: 2024-01-01. Use ISO format (e.g., 2024-01-01T00:00:00)"
}
```

**Response (500 - Server Error)**:
```json
{
  "status": "error",
  "detail": "Failed to fetch trades: [error details]"
}
```

**Key Features**:
- ✅ Supports all backtest engine filters (timestamps, prices, positions, wallets, markets)
- ✅ Pagination with offset/limit for large result sets
- ✅ Returns total_trades and total_pages metadata for UI pagination
- ✅ Results sorted by timestamp DESC (most recent first)
- ✅ Column selection via strat_var (if null, returns all columns)
- ✅ Handles both polymarket and kalshi platforms
- ✅ ISO datetime parsing (accepts both `2024-01-01T00:00:00` and `2024-01-01 00:00:00`)

---

## Strategy Function Signature

Your strategy must be a Python function with this exact signature:

```python
def my_strategy(trade, trade_log, portfolio, user_perso_parameters):
    """
    Args:
        trade (dict): Current trade with keys:
            - market_id (str): Unique market identifier
            - position (str): "Yes" or "No"
            - price (float): Current price (0.0-1.0)
            - amount (int): Contract size
            - timestamp (datetime): Trade timestamp
            - platform (str): "polymarket" or "kalshi"
            - ... other fields depending on strat_var selection
        
        trade_log (list): All previously executed trades (read-only)
        
        portfolio (dict): Current portfolio state:
            - cash (float): Available cash
            - positions (dict): {(market_id, position): amount}
        
        user_perso_parameters (dict): Persistent state across trades
    
    Returns:
        dict: Action with keys:
            - market_id (str): Market to trade
            - position (str): "Yes" or "No"
            - direction (str): "buy", "sell", or "hold"
            - amount (int): Number of contracts
            - take_profit (float, optional): Exit price for profit
            - stop_loss (float, optional): Exit price for loss
            - user_perso_parameters (dict, optional): Updated state
    """
    # Your logic here
    return {
        "market_id": trade["market_id"],
        "position": trade["position"],
        "direction": "hold" if trade["price"] > 0.5 else "buy",
        "amount": 10
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
