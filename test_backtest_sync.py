#!/usr/bin/env python3
import requests
import json
from datetime import datetime

# Test payload - same strategy as streaming test
test_payload = {
    "filters": {
        "price_sup": None,
        "price_inf": None,
        "amount_sup": None,
        "amount_inf": None,
        "timestamp_sup": None,
        "timestamp_inf": None,
        "liquidity": None,
        "outcomes": None,
        "volume": None
    },
    "strategy_code": """
# Simple test strategy
total_pnl = 0
for trade in trades:
    total_pnl += trade.get('amount', 0)
return {'total_pnl': total_pnl}
"""
}

url = "https://backtest-engine-api.fly.dev/backtest"

print(f"[{datetime.now().strftime('%H:%M:%S')}] Testing synchronous /backtest endpoint...")
print(f"URL: {url}\n")

try:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Sending request...")
    response = requests.post(url, json=test_payload, timeout=1800)  # 30 min timeout
    response.raise_for_status()
    
    data = response.json()
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] ✓ Backtest complete!")
    print(json.dumps(data, indent=2)[:500])  # Print first 500 chars
    
except requests.exceptions.Timeout:
    print(f"✗ Request timed out after 30 minutes")
except requests.exceptions.RequestException as e:
    print(f"✗ Request failed: {e}")
