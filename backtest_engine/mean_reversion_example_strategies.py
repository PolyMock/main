"""
Mean reversion strategy: if price is very low → buy yes, if price is very high → buy no.

inputs:

- trade: the current trade being processed 
dict with keys: 'platform', 'timestamp', 'title', 'volume', 'market_id', 'position', 'possible_outcomes', 'price', 'amount', 'wallet_maker', 'wallet_taker'

- trade_log: list of all past trades executed by the strategy, with same format
list of dicts with keys: 'market_id', 'position', 'direction', 'amount', 'cost', 'time'

- portfolio: current state of the portfolio
dict with keys: 'cash', 'positions' himself a dict with keys: (market_id, position) and values: amount

- user_perso_parameters: dict where you can store any custom parameters you want to keep track of across trades

outputs:
dict with keys: 'market_id'(string), 'position'(string), 'direction'(string), 'amount'(int), 'user_perso_parameters' (dict - optional)

"""

def mean_reversion(trade, trade_log, portfolio, user_perso_parameters):
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

# ========================================================================================================================
# Variations of the mean reversion strategy using only portfolio

def mean_reversion_with_portfolio_cash(trade, trade_log, portfolio, user_perso_parameters):
    import math
    threshold_low = 0.01
    market_id = trade.get("market_id")
    position = trade.get("position")
    direction = "hold"
    amount = 0

    if trade.get("price") <= threshold_low:
        direction = "buy"
        amount = math.floor(int(portfolio["cash"]) / 100)

    action = {"market_id": market_id, "position": position, "direction": direction, "amount": amount}
    return action

def mean_reversion_with_portfolio_positions(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    market_id = trade.get("market_id")
    position = trade.get("position")
    direction = "hold"
    amount = 0

    if trade.get("price") <= threshold_low and (market_id, position) not in portfolio["positions"]:
        direction = "buy"
        amount = 10

    return {"market_id": market_id, "position": position, "direction": direction, "amount": amount}

# ========================================================================================================================
# Variations of the mean reversion strategy using the only trade_log

def mean_reversion_with_trade_log(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    market_id = trade.get("market_id")
    position = trade.get("position")
    direction = "hold"
    amount = 0

    if trade.get("price") <= threshold_low:
        trades_on_market = [
            t for t in trade_log
            if t["market_id"] == market_id and t["position"] == position and t.get("direction", "buy") == "buy"
        ]

        if len(trades_on_market) > 0:
            min_price_trades = min(t["cost"] / t["amount"] for t in trades_on_market)
            if trade.get("price") < min_price_trades:
                direction = "buy"
                amount = 10
        else:
            direction = "buy"
            amount = 10

    return {"market_id": market_id, "position": position, "direction": direction, "amount": amount}

def mean_reversion_with_trade_log_time(trade, trade_log, portfolio, user_perso_parameters):
    from datetime import timedelta

    threshold_low = 0.01
    market_id = trade.get("market_id")
    position = trade.get("position")
    direction = "hold"
    amount = 0

    if trade.get("price") <= threshold_low:
        trades_on_market = [t for t in trade_log if t["market_id"] == market_id and t["position"] == position]

        if len(trades_on_market) > 0:
            latest_trade = max(t["time"] for t in trades_on_market)
            if trade.get("timestamp") - latest_trade > timedelta(days=1):
                direction = "buy"
                amount = 10
        else:
            direction = "buy"
            amount = 10

    return {
        "market_id": market_id,
        "position": position,
        "direction": direction,
        "amount": amount,
        "user_perso_parameters": user_perso_parameters,
    }

# ========================================================================================================================

def mean_reversion_with_user_perso_parameter_internal(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    market_id = trade.get("market_id")
    position = trade.get("position")
    direction = "hold"
    amount = 0

    if "trade_count" not in user_perso_parameters:
        user_perso_parameters["trade_count"] = {}
    user_perso_parameters["trade_count"][market_id] = user_perso_parameters["trade_count"].get(market_id, 0) + 1

    if trade.get("price") <= threshold_low:
        direction = "buy"
        amount = min(100, user_perso_parameters["trade_count"][market_id])

    return {
        "market_id": market_id,
        "position": position,
        "direction": direction,
        "amount": amount,
        "user_perso_parameters": user_perso_parameters,
    }

def mean_reversion_with_user_perso_parameter_external(trade, trade_log, portfolio, user_perso_parameters):

    import yfinance as yf
    from datetime import timedelta, timezone

    def get_btc_price(timestamp):
        ts = timestamp.to_pydatetime()
        ts = ts.replace(tzinfo=timezone.utc)
        start = (ts - timedelta(days=1)).strftime("%Y-%m-%d")
        end = (ts + timedelta(days=1)).strftime("%Y-%m-%d")
        df = yf.download("BTC-USD", start=start, end=end, interval="1h", progress=False)
        if df.empty:
            return None
        df = df[df.index <= ts]
        if df.empty:
            return None
        return df["Close"].iloc[-1].item()
    
    threshold_low = 0.01
    market_id = trade.get("market_id")
    position = trade.get("position")
    direction = "hold"
    amount = 0

    if "btc_price" not in user_perso_parameters:
        user_perso_parameters["btc_price"] = []
    btc_price = get_btc_price(trade.get("timestamp"))
    if btc_price is not None:
        user_perso_parameters["btc_price"].append(btc_price)

    btc_prices = user_perso_parameters["btc_price"]
    if trade.get("price") <= threshold_low:
        if len(btc_prices) <= 100 or btc_prices[-1] > max(btc_prices[-100:-1]):
            direction = "buy"
            amount = 10

    return {
        "market_id": market_id,
        "position": position,
        "direction": direction,
        "amount": amount,
        "user_perso_parameters": user_perso_parameters,
    }

# ========================================================================================================================

def mean_reversion_portfolio_sell(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    market_id = trade.get("market_id")
    position = trade.get("position")
    direction = "hold"
    amount = 0

    if trade.get("price") <= threshold_low:
        direction = "buy"
        amount = 10
    
    if trade.get("price") > threshold_low * 1.5 and (market_id, position) in portfolio["positions"] and portfolio["positions"][(market_id, position)] > 0:
        direction = "sell"
        amount = min(10, portfolio["positions"][(market_id, position)]) 

    return {"market_id": market_id, "position": position, "direction": direction, "amount": amount}

def mean_reversion_portfolio_sell_with_tp_sp(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    market_id = trade.get("market_id")
    position = trade.get("position")
    direction = "hold"
    amount = 0

    price = trade.get("price")
    if price <= threshold_low:
        direction = "buy"
        amount = 100
    
    action = {
        "market_id": market_id,
        "position": position,
        "direction": direction,
        "amount": amount,
        "take_profit": price * 1.5 if direction == "buy" else None,
        "stop_loss": price * 0.5 if direction == "buy" else None
    }
    
    return action


# ========================================================================================================================
def strategy_security_test(trade, trade_log, portfolio, user_perso_parameters):
    """Test security: attempts file access (should be blocked)"""
    try:
        with open("/etc/passwd", "r") as f:
            content = f.read()
        return {"market_id": "test", "position": "Yes", "direction": "hold", "amount": 0}
    except Exception as e:
        return {"market_id": "test", "position": "Yes", "direction": "hold", "amount": 0, "error": str(e)}

def strategy_security_test_subprocess(trade, trade_log, portfolio, user_perso_parameters):
    """Test security: attempts subprocess execution (should be blocked)"""
    try:
        import subprocess
        subprocess.run(["ls", "-la"])
        return {"market_id": "test", "position": "Yes", "direction": "hold", "amount": 0}
    except Exception as e:
        return {"market_id": "test", "position": "Yes", "direction": "hold", "amount": 0, "error": str(e)}

def strategy_security_test_os_system(trade, trade_log, portfolio, user_perso_parameters):
    """Test security: attempts os.system call (should be blocked)"""
    try:
        import os
        os.system("cat /etc/passwd")
        return {"market_id": "test", "position": "Yes", "direction": "hold", "amount": 0}
    except Exception as e:
        return {"market_id": "test", "position": "Yes", "direction": "hold", "amount": 0, "error": str(e)}

def strategy_security_test_socket(trade, trade_log, portfolio, user_perso_parameters):
    """Test security: attempts socket access (should be blocked)"""
    try:
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect(("attacker.com", 80))
        return {"market_id": "test", "position": "Yes", "direction": "hold", "amount": 0}
    except Exception as e:
        return {"market_id": "test", "position": "Yes", "direction": "hold", "amount": 0, "error": str(e)}

def strategy_security_test_import_eval(trade, trade_log, portfolio, user_perso_parameters):
    """Test security: attempts __import__ exploit (should be blocked)"""
    try:
        os = __import__("os")
        os.system("id")
        return {"market_id": "test", "position": "Yes", "direction": "hold", "amount": 0}
    except Exception as e:
        return {"market_id": "test", "position": "Yes", "direction": "hold", "amount": 0, "error": str(e)}

def strategy_security_test_infinite_loop(trade, trade_log, portfolio, user_perso_parameters):
    """Test security: attempts infinite loop (should timeout)"""
    i = 0
    while True:  # Should timeout after TIMEOUT_SECONDS
        i += 1
    return {"market_id": "test", "position": "Yes", "direction": "hold", "amount": 0}
