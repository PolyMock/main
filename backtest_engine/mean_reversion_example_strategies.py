"""
Mean reversion strategy: if price is very low → buy yes, if price is very high → buy no.

inputs:

- trade: the current trade being processed 
dict with keys: 'platform', 'timestamp', 'title', 'volume', 'market_id', 'position', 'possible_outcomes', 'price', 'amount', 'wallet_maker', 'wallet_taker'

- trade_log: list of all past trades executed by the strategy, with same format
list of dicts with keys: 'market_id', 'position', 'amount', 'cost', 'time'

- portfolio: current state of the portfolio
dict with keys: 'cash', 'positions' himself a dict with keys: (market_id, position) and values: amount

- user_perso_parameters: dict where you can store any custom parameters you want to keep track of across trades

outputs:
dict with keys: 'market_id'(string), 'position'(string), 'amount'(int), 'user_perso_parameters' (dict - optional)

"""

def mean_reversion(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    amount = 10
    
    if trade.get("price") <= threshold_low:
        market_id = trade.get("market_id")
        position = trade.get("position")
    else:
        market_id = trade.get("market_id")
        position = "hold"
    
    return {"market_id": market_id, "position": position, "amount": amount}

# ========================================================================================================================
# Variations of the mean reversion strategy using only portfolio

def mean_reversion_with_portfolio_cash(trade, trade_log, portfolio, user_perso_parameters):
    
    threshold_low = 0.01
    
    if trade.get("price") <= threshold_low:
        market_id = trade.get("market_id")
        position = trade.get("position")
        import math
        amount = math.floor(int(portfolio["cash"])/100)
    else:
        market_id = trade.get("market_id")
        position = "hold"
        amount = 0
    
    return {"market_id": market_id, "position": position, "amount": amount}

def mean_reversion_with_portfolio_positions(trade, trade_log, portfolio, user_perso_parameters):
    
    threshold_low = 0.01
    
    if trade.get("price") <= threshold_low:
        market_id = trade.get("market_id")
        position = trade.get("position")
        if (market_id,position) in portfolio["positions"]:
            position = "hold"
            amount = 0
        else:
            amount = 10
    else:
        market_id = trade.get("market_id")
        position = "hold"
        amount = 0
    
    return {"market_id": market_id, "position": position, "amount": amount}

# ========================================================================================================================
# Variations of the mean reversion strategy using the only trade_log

def mean_reversion_with_trade_log(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    
    if trade.get("price") <= threshold_low:

        market_id = trade.get("market_id")
        position = trade.get("position")
        trades_on_market = [trade for trade in trade_log if trade["market_id"] == market_id and trade["position"] == position]
        
        if len(trades_on_market) > 0:

            min_price_trades = min(int(trade["cost"])/int(trade["amount"]) for trade in trades_on_market)
            
            if trade.get("price") < min_price_trades:
                amount = 10
            else:
                position = "hold"
                amount = 0
        
        else:
            amount = 10

    else:
        market_id = trade.get("market_id")
        position = "hold"
        amount = 0

    return {"market_id": market_id, "position": position, "amount": amount}

def mean_reversion_with_trade_log_time(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    
    if trade.get("price") <= threshold_low:

        market_id = trade.get("market_id")
        position = trade.get("position")
        trades_on_market = [trade for trade in trade_log if trade["market_id"] == market_id and trade["position"] == position]
        
        if len(trades_on_market) > 0:

            lastest_trade = max(trade["time"] for trade in trades_on_market)
            
            from datetime import timedelta
            if trade.get("timestamp") - lastest_trade > timedelta(days=1):
                amount = 10
            else:
                position = "hold"
                amount = 0
        
        else:
            amount = 10

    else:
        market_id = trade.get("market_id")
        position = "hold"
        amount = 0

    return {"market_id": market_id, "position": position, "amount": amount, "user_perso_parameters": user_perso_parameters}

# ========================================================================================================================

def mean_reversion_with_user_perso_parameter_internal(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01

    if "trade_count" not in user_perso_parameters:
        user_perso_parameters["trade_count"] = {}
    if trade.get("market_id") not in user_perso_parameters["trade_count"]:
        user_perso_parameters["trade_count"][trade.get("market_id")] = 0
    
    if trade.get("market_id") in user_perso_parameters["trade_count"]:
        user_perso_parameters["trade_count"][trade.get("market_id")] += 1
    
    if trade.get("price") <= threshold_low:

        market_id = trade.get("market_id")
        position = trade.get("position")
        amount = min(100, user_perso_parameters["trade_count"][trade.get("market_id")])  
    else:
        market_id = trade.get("market_id")
        position = "hold"
        amount = 0

    return {"market_id": market_id, "position": position, "amount": amount, "user_perso_parameters": user_perso_parameters}

def mean_reversion_with_user_perso_parameter_external(trade, trade_log, portfolio, user_perso_parameters):

    import yfinance as yf
    from datetime import timedelta, timezone

    def get_btc_price(timestamp):
        ts = timestamp.to_pydatetime()
        ts = ts.replace(tzinfo=timezone.utc)  # Make timezone-aware (UTC)
        start = (ts - timedelta(days=1)).strftime("%Y-%m-%d")
        end = (ts + timedelta(days=1)).strftime("%Y-%m-%d")
        df = yf.download("BTC-USD", start=start, end=end, interval="1h", progress=False)
        if df.empty:
            return None
        df = df[df.index <= ts]
        if df.empty:
            return None
        return df["Close"].iloc[-1].item()
    
    if "btc_price" not in user_perso_parameters:
        user_perso_parameters["btc_price"] = []
    btc_price = get_btc_price(trade.get("timestamp"))
    if btc_price is not None:
        user_perso_parameters["btc_price"].append(btc_price)

    threshold_low = 0.01
    
    if trade.get("price") <= threshold_low:
        if len(user_perso_parameters["btc_price"]) > 100:
            if user_perso_parameters["btc_price"][-1] > max(user_perso_parameters["btc_price"][-100:-1]):
                market_id = trade.get("market_id")
                position = trade.get("position")
                amount = 10
            else:
                market_id = trade.get("market_id")
                position = "hold"
                amount = 0
        else:
            market_id = trade.get("market_id")
            position = trade.get("position")
            amount = 10
    else:
        market_id = trade.get("market_id")
        position = "hold"
        amount = 0
    
    return {"market_id": market_id, "position": position, "amount": amount, "user_perso_parameters": user_perso_parameters}
