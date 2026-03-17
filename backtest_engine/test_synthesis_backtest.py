"""
Quick backtest using Synthesis API data to verify the pipeline works.
Uses the mean reversion strategy on data fetched by synthesis_data_loader.py.
"""

import os
import sys
from glob import glob
from datetime import datetime
import duckdb
import pandas as pd
import json

# Point DATA_PATH to our Synthesis data directory
DATA_PATH = os.path.join(os.path.dirname(__file__), "data")

# We import the engine but override its DATA_PATH
import backtest_engine as be
be.DATA_PATH = DATA_PATH


def simple_mean_reversion(trade, trade_log, portfolio, user_perso_parameters):
    """Buy when price is very low (< 5 cents), hold otherwise."""
    threshold_low = 0.05

    if trade.get("price") is not None and trade.get("price") <= threshold_low:
        market_id = trade.get("market_id")
        position = trade.get("position")
        amount = 10
    else:
        market_id = trade.get("market_id")
        position = "hold"
        amount = 0

    return {"market_id": market_id, "position": position, "amount": amount}


# Check data exists
trade_files = glob(f"{DATA_PATH}/polymarket/standardized_trades/*.parquet")
market_files = glob(f"{DATA_PATH}/polymarket/markets/*.parquet")

print(f"Trade files found: {len(trade_files)}")
print(f"Market files found: {len(market_files)}")

if not trade_files:
    print("No trade data found. Run synthesis_data_loader.py first.")
    sys.exit(1)

# Initialize engine
engine = be.BacktestEngine(
    initial_cash=10000,
    platform=["polymarket"],
    reimburse_open_positions=True,
)

# Run backtest
print("\nRunning backtest...")
metrics = engine.run(simple_mean_reversion)

# Print results
print("\n=== BACKTEST RESULTS ===")
print(f"Trades executed : {metrics['trades_executed']}")
print(f"Initial cash    : ${metrics['initial_cash']:.2f}")
print(f"Final cash      : ${metrics['final_cash']:.2f}")
print(f"Total PnL       : ${metrics['total_pnl']:.2f}")
print(f"ROI             : {metrics['roi_percent']:.2f}%")
print(f"Open positions  : {len(metrics['open_positions'])}")
