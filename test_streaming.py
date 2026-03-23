#!/usr/bin/env python3
import requests
import json
import sys
from datetime import datetime

# Test payload - minimal strategy to verify streaming works quickly
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

url = "https://backtest-engine-api.fly.dev/backtest-streaming"

print(f"[{datetime.now().strftime('%H:%M:%S')}] Starting SSE stream test...")
print(f"URL: {url}\n")

try:
    response = requests.post(url, json=test_payload, stream=True, timeout=1200)
    response.raise_for_status()
    
    message_count = 0
    for line in response.iter_lines():
        if line:
            line_str = line.decode('utf-8') if isinstance(line, bytes) else line
            if line_str.startswith('data: '):
                message_count += 1
                try:
                    data = json.loads(line_str[6:])  # Remove 'data: ' prefix
                    timestamp = datetime.now().strftime('%H:%M:%S')
                    
                    # Format output based on message type
                    if data.get('stage') == 'loading_trades':
                        progress = data.get('progress', 0)
                        files_loaded = data.get('files_loaded', 0)
                        total_files = data.get('total_files', 0)
                        print(f"[{timestamp}] LOADING: {progress}% ({files_loaded}/{total_files} files)")
                    
                    elif data.get('stage') == 'running_backtest':
                        progress = data.get('progress', 0)
                        trades_proc = data.get('trades_processed', 0)
                        total_trades = data.get('total_trades', 0)
                        print(f"[{timestamp}] RUNNING: {progress}% ({trades_proc:,}/{total_trades:,} trades)")
                    
                    elif data.get('stage') == 'complete':
                        print(f"\n[{timestamp}] ✓ Backtest Complete!")
                        print(f"Status: {data.get('status')}")
                        # Print key metrics from response
                        for key in ['won_bets', 'lost_bets', 'pnl', 'net_return', 'sharpe']:
                            if key in data:
                                print(f"  {key}: {data[key]}")
                    
                    else:
                        print(f"[{timestamp}] {json.dumps(data)}")
                        
                except json.JSONDecodeError as e:
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] Error parsing JSON: {line_str}")
    
    print(f"\n✓ Test complete. Received {message_count} messages")
    
except requests.exceptions.Timeout:
    print("✗ Request timed out (this is normal for long backtests - restart to see full output)")
except requests.exceptions.RequestException as e:
    print(f"✗ Request failed: {e}")
    sys.exit(1)
