"""
Run a backtest with the simple strategy.
"""

from b_backtest_engine import BacktestEngine
from b_simple_strategy_example import mean_reversion_with_user_perso_parameter_external as strategy

# Filters — narrow scope for first test run
filters = {
    "initial_cash": 10000,
    "platform": ["kalshi", "polymarket"],
    "timestamp_start": None,
    "timestamp_end": None,  # 1 month only
    "market_id": None,              # all markets
    "market_title": None,
    "volume_inf": None,             # only markets with meaningful volume
    "volume_sup": None,
    "position": None,
    "price_inf": None,
    "price_sup": 0.1,
    "amount_inf": None,
    "amount_sup": None,
}


# Initialize engine
engine = BacktestEngine(
    initial_cash=filters["initial_cash"],
    platform=filters["platform"],
    timestamp_start=filters["timestamp_start"],
    timestamp_end=filters["timestamp_end"],
    market_id=filters["market_id"],
    market_title=filters["market_title"],
    volume_inf=filters["volume_inf"],
    volume_sup=filters["volume_sup"],
    position=filters["position"],
    price_inf=filters["price_inf"],
    price_sup=filters["price_sup"],
    amount_inf=filters["amount_inf"],
    amount_sup=filters["amount_sup"],
    reimburse_open_positions=True,
)

# Run backtest
print("Running backtest...")
metrics = engine.run(strategy)

# Print results
print("\n=== BACKTEST RESULTS ===")
print(f"Trades executed : {metrics['trades_executed']}")
print(f"Initial cash    : ${metrics['initial_cash']:.2f}")
print(f"Final cash      : ${metrics['final_cash']:.2f}")
print(f"Total PnL       : ${metrics['total_pnl']:.2f}")
print(f"ROI             : {metrics['roi_percent']:.2f}%")
print(f"\nOpen positions  : {metrics['open_positions']}")