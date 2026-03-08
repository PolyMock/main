"""
BacktestEngine class - core logic for running a backtest on prediction market data.
"""

from typing import Callable, Optional, Dict, Any
from glob import glob
from datetime import datetime
import duckdb
import pandas as pd
import json

DATA_PATH = "/Volumes/Extreme SSD/prediction-market-data/data"

class BacktestEngine:

    def __init__(self, 
                initial_cash: float = 10000, strat_var: Optional[list[bool]] = [True for i in range(12)], # user's strategy
                reimburse_open_positions: bool = False, # if True, refund open positions at last known price at end of backtest
                platform: list[str] = None, # filter
                timestamp_start: Optional[datetime] = None, # filter
                timestamp_end: Optional[datetime] = None, # filter
                market_id: list[str] = None, market_title: Optional[list[str]] = None, volume_inf: Optional[float] = None, volume_sup: Optional[float] = None, market_category: Optional[list[str]] = None, # filters on market characteristics
                position: list[str] = None, possible_outcomes: list[str] = None, price_inf: Optional[float] = None, price_sup: Optional[float] = None, amount_inf: Optional[float] = None, amount_sup: Optional[float] = None, # filters on trades characteristics
                wallet_maker: Optional[list[str]] = None, wallet_taker: Optional[list[str]] = None, # filters on wallets (only for Polymarket)
                ):

        self.initial_cash = initial_cash
        self.reimburse_open_positions = reimburse_open_positions

        self.platform = platform
        self.timestamp_start = timestamp_start
        self.timestamp_end = timestamp_end

        self.market_id = market_id # ticker for Kalshi, market_id for Polymarket
        self.market_title = market_title # only for Kalshi trades
        self.volume_inf = volume_inf # only for Kalshi trades
        self.volume_sup = volume_sup # only for Kalshi trades
        self.market_category = market_category
        self.position = position
        self.possible_outcomes = possible_outcomes
        self.price_inf = price_inf
        self.price_sup = price_sup
        self.amount_inf = amount_inf
        self.amount_sup = amount_sup

        self.wallet_maker = wallet_maker # only available for Polymarket trades
        self.wallet_taker = wallet_taker # only available for Polymarket trades

        self.columns = ['platform', 'timestamp', 'title', 'volume', 'market_id', 'market_category', 'position', 'possible_outcomes', 'price', 'amount', 'wallet_maker', 'wallet_taker']
        self.selected_columns = ", ".join([col for col, use in zip(self.columns, strat_var) if use])

        self.trade_log = []
        self.settle_log = []
        self.portfolio = {"cash": initial_cash, "positions": {}}

# =======================================================================================================================================

    def load_trades(self):
        
        dfs = []
        if "kalshi" in self.platform:
            self.load_trades_kalshi()
            self.kalshi_trades_df["timestamp"] = pd.to_datetime(self.kalshi_trades_df["timestamp"], utc=True).dt.tz_convert(None)
            dfs.append(self.kalshi_trades_df)
        if "polymarket" in self.platform:
            self.load_trades_polymarket()
            self.polymarket_trades_df["timestamp"] = pd.to_datetime(self.polymarket_trades_df["timestamp"], utc=True).dt.tz_convert(None)
            dfs.append(self.polymarket_trades_df)
        if not dfs:
            raise ValueError(f"Unknown platform: {self.platform}")

        self.trades_df = pd.concat(dfs, ignore_index=True).sort_values("timestamp").reset_index(drop=True)
        self.valid_market_ids = set(self.trades_df["market_id"].unique())
        self.market_possible_outcomes = self.trades_df.groupby("market_id")["possible_outcomes"].first().to_dict()
        print(f"Loaded {len(self.trades_df)} trades")


    def load_trades_kalshi(self):
        """Load Kalshi trades for a market."""
        trade_files = [f for f in glob(f"{DATA_PATH}/kalshi/standardized_trades/*.parquet") 
                       if not f.split('/')[-1].startswith("._")]
        con = duckdb.connect()
        query = f"""
            SELECT {self.selected_columns}
            FROM read_parquet({trade_files}, union_by_name=True)
            WHERE 1=1
        """
        
        if self.timestamp_start:
            query += f" AND timestamp >= '{self.timestamp_start}'"
        if self.timestamp_end:
            query += f" AND timestamp <= '{self.timestamp_end}'"

        if self.market_id is not None:
            query += f" AND market_id IN {tuple(self.market_id)}"
        if self.market_title is not None:
            query += f" AND title IN {tuple(self.market_title)}"
        if self.market_category is not None:
            query += f" AND category IN {tuple(self.market_category)}"
        if self.volume_inf is not None:
            query += f" AND volume >= {self.volume_inf}"
        if self.volume_sup is not None:
            query += f" AND volume <= {self.volume_sup}"

        if self.price_inf is not None:
            query += f" AND price >= {self.price_inf}"
        if self.price_sup is not None:
            query += f" AND price <= {self.price_sup}"
        if self.amount_inf is not None:
            query += f" AND amount >= {self.amount_inf}"
        if self.amount_sup is not None:
            query += f" AND amount <= {self.amount_sup}"

        if self.position is not None:
            conditions = " OR ".join(f"position = '{pos}'" for pos in self.position)
            query += f" AND ({conditions})"
        if self.possible_outcomes is not None:
            conditions = " OR ".join(f"list_contains(possible_outcomes, '{outcome}')" for outcome in self.possible_outcomes)
            query += f" AND ({conditions})"
           
        query += " ORDER BY timestamp"
        self.kalshi_trades_df = con.execute(query).df()

    def load_trades_polymarket(self):
        """Load Polymarket trades for a market."""
        trade_files = [f for f in glob(f"{DATA_PATH}/polymarket/standardized_trades/*.parquet") 
                       if not f.split('/')[-1].startswith("._")]
        con = duckdb.connect()
        query = f"""
            SELECT {self.selected_columns}
            FROM read_parquet({trade_files}, union_by_name=True)
            WHERE 1=1
        """
        
        if self.timestamp_start:
            query += f" AND timestamp >= '{self.timestamp_start}'"
        if self.timestamp_end:
            query += f" AND timestamp <= '{self.timestamp_end}'"

        if self.market_id is not None:
            query += f" AND market_id IN {tuple(self.market_id)}"
        if self.market_title is not None:
            query += f" AND title IN {tuple(self.market_title)}"
        if self.volume_inf is not None:
            query += f" AND volume >= {self.volume_inf}"
        if self.volume_sup is not None:
            query += f" AND volume <= {self.volume_sup}"
        if self.market_category is not None:
            query += f" AND category IN {tuple(self.market_category)}"

        if self.price_inf is not None:
            query += f" AND price >= {self.price_inf}"
        if self.price_sup is not None:
            query += f" AND price <= {self.price_sup}"
        if self.amount_inf is not None:
            query += f" AND amount >= {self.amount_inf}"
        if self.amount_sup is not None:
            query += f" AND amount <= {self.amount_sup}"

        if self.position is not None:
            conditions = " OR ".join(f"position = '{pos}'" for pos in self.position)
            query += f" AND ({conditions})"
        if self.possible_outcomes is not None:
            conditions = " OR ".join(f"list_contains(possible_outcomes, '{outcome}')" for outcome in self.possible_outcomes)
            query += f" AND ({conditions})"
           
        query += " ORDER BY timestamp"
        self.polymarket_trades_df = con.execute(query).df()

# =======================================================================================================================================

    def load_all_outcomes(self):
        if "kalshi" in self.platform:
            self.load_all_outcomes_kalshi()
        if "polymarket" in self.platform:
            self.load_all_outcomes_polymarket()

        self.market_outcomes = {
            **getattr(self, "market_outcomes_kalshi", {}),
            **getattr(self, "market_outcomes_polymarket", {})
        }
    def load_all_outcomes_kalshi(self):
        """Load resolution outcomes only for markets present in the loaded trades."""

        market_files = [f for f in glob(f"{DATA_PATH}/kalshi/markets/*.parquet")
                        if not f.split('/')[-1].startswith("._")]
        con = duckdb.connect()
        tickers = tuple(self.valid_market_ids)

        result = con.execute(f"""
            SELECT ticker, result, close_time
            FROM read_parquet({market_files}, union_by_name=True)
            WHERE result IN ('yes', 'no')
            AND ticker IN {tickers}
        """).df()
        
        # Normalize timestamps vectorially before building dict
        result["result"] = result.apply(lambda row: "Yes" if row["result"].lower() == "yes" else "No", axis=1)
        result["close_time"] = pd.to_datetime(result["close_time"]).dt.tz_localize(None)
        
        # Build dict from zip — 100x faster than iterrows
        self.market_outcomes_kalshi = dict(zip(
            result["ticker"],
            zip(result["result"], result["close_time"])
    ))
        
    def load_all_outcomes_polymarket(self):
        """Load resolution outcomes only for markets present in the loaded trades."""

        market_files = [f for f in glob(f"{DATA_PATH}/polymarket/markets/*.parquet")
                        if not f.split('/')[-1].startswith("._")]
        con = duckdb.connect()
        market_ids = tuple(self.valid_market_ids)

        result = con.execute(f"""
            SELECT slug, outcomes, outcome_prices, end_date
            FROM read_parquet({market_files}, union_by_name=True)
            WHERE slug IN {market_ids}
        """).df()
        
        # Normalize timestamps vectorially before building dict
        def get_final_outcome(row):
            try:
                outcomes = json.loads(row["outcomes"])
                prices = [float(p) for p in json.loads(row["outcome_prices"])]
                best_idx = prices.index(max(prices))
                return outcomes[best_idx] if prices[best_idx] >= 0.999 else None
            except Exception:
                return None

        result["final_outcome"] = result.apply(get_final_outcome, axis=1)
        result["end_date"] = pd.to_datetime(result["end_date"]).dt.tz_localize(None)
        
        # Build dict from zip — 100x faster than iterrows
        self.market_outcomes_polymarket = dict(zip(
            result["slug"],
            zip(result["final_outcome"], result["end_date"])
    ))

# =======================================================================================================================================
    
    def _settle_resolved_positions(self, current_timestamp):
        """Settle any open positions whose market has resolved before current timestamp."""
        to_settle = []
        
        for (market_id, position) in list(self.portfolio["positions"].keys()):
            if market_id not in self.market_outcomes:
                continue
            
            outcome, end_date = self.market_outcomes[market_id]
            
            if current_timestamp >= end_date:
                to_settle.append((market_id, position, outcome))
        
        for market_id, position, outcome in to_settle:
            key = (market_id, position)
            amount = self.portfolio["positions"][key]
            
            if position == outcome:  # winning side
                self.portfolio["cash"] += amount * 1.00
                self.settle_log.append({
                "market_id": market_id,
                "position": position,
                "amount": amount,
                "outcome": outcome,
                "timestamp": current_timestamp
            })
            # losing side: payout = 0, just remove
            
            del self.portfolio["positions"][key]

    def _is_valid_action(self, action: Any) -> bool: # support function for the run method of the BacktestEngine class
        """Validate the action returned by the strategy function."""

        if not isinstance(action, dict):
            raise ValueError("Action returned by the strategy must be a dictionary")
        
        if "market_id" not in action or "position" not in action or "amount" not in action:
            raise ValueError("Action must contain 'market_id', 'position', and 'amount' keys")
        
        if action["market_id"] not in self.valid_market_ids:
            raise ValueError(f"Market ID '{action['market_id']}' not found in trade data")
        
        
        if action["position"] != "hold":
            possible_outcomes = self.market_possible_outcomes[action["market_id"]]
            if action["position"] not in possible_outcomes:
                raise ValueError(f"Position '{action['position']}' not in possible outcomes {possible_outcomes} for market '{action['market_id']}'")
        
        if not isinstance(action["amount"], int) or action["amount"] < 0:
            raise ValueError("Amount must be a positive integer")
        
        return True

    def _get_market_last_price(self, market_id: str, position: str) -> float:
        """Return the last known price for a specific (market_id, position) pair — O(1) via rolling dict."""
        key = (market_id, position)
        if key not in self._last_known_price:
            raise ValueError(f"No price found for market_id: {market_id}, position: {position}")
        return self._last_known_price[key]

    def _calculate_metrics(self):
        """Calculate basic metrics after backtest."""
        self.metrics = {
            'trades_executed': len(self.trade_log),
            'final_portfolio': self.portfolio,
            'final_cash': self.portfolio["cash"],
            'open_positions': self.portfolio["positions"],
            'initial_cash': self.initial_cash,
            'total_pnl': self.portfolio["cash"] - self.initial_cash,
            'roi_percent': ((self.portfolio["cash"] - self.initial_cash) / self.initial_cash) * 100 if self.initial_cash else 0
        }
        return self.metrics 

# =======================================================================================================================================


    def run(self, strategy_func: Callable):

        self.cpt_trade = 0

        """Run the backtest loop with the given strategy function."""
        
        print("Loading trades...")
        self.load_trades()
        print("Loading market outcomes...")
        self.load_all_outcomes()
        user_perso_parameters= {}

        self._last_known_price = {}
        self.settle_log = []

        print("Starting backtest...")
        for idx, trade in self.trades_df.iterrows():

            self.cpt_trade += 1
            print(f"Processing trade {self.cpt_trade}/{len(self.trades_df)}", end="\r")

            trade_dict = trade.to_dict()

            # Update rolling price dict with current trade
            self._last_known_price[(trade_dict["market_id"], trade_dict["position"])] = trade_dict["price"]

            # Check all open positions for resolution
            self._settle_resolved_positions(pd.Timestamp(trade_dict["timestamp"]).tz_localize(None))
                      
            # Call user strategy
            action = strategy_func(trade_dict, self.trade_log, self.portfolio, user_perso_parameters)
            user_perso_parameters = action.get("user_perso_parameters", user_perso_parameters) # update user_perso_parameters if provided by strategy
            
            if not self._is_valid_action(action): # Validate action
                continue
            if action["position"] == "hold": # Hold — do nothing
                continue
            
            # Compute cost — O(1) lookup via rolling price dict
            price = self._get_market_last_price(action["market_id"], action["position"])
            cost = round(action["amount"] * price, 6)
            
            if cost > self.portfolio["cash"]: # Reject if not enough cash
                continue
            
            # Execute trade
            self.portfolio["cash"] -= cost
            print(f"[TRADE] market={action['market_id']} pos={action['position']} amount={action['amount']} price={price} cost={cost} cash_after={self.portfolio['cash']:.2f}")
            key = (action["market_id"], action["position"])
            self.portfolio["positions"][key] = self.portfolio["positions"].get(key, 0) + action["amount"]

            # Enrich action and log it
            enriched_action = {
                "market_id": action["market_id"],
                "position": action["position"],
                "amount": action["amount"],
                "cost": cost,
                "time": trade_dict.get("timestamp")
            }
            print(trade_dict.get("timestamp"))
            self.trade_log.append(enriched_action)
        
        if self.reimburse_open_positions:
            self._reimburse_open_positions()
        print(self.settle_log)
        return self._calculate_metrics()
    
# =======================================================================================================================================
    
    def _reimburse_open_positions(self):
        """Refund open positions at their last known price at the end of the backtest period."""
        to_remove = []
        for (market_id, position), amount in self.portfolio["positions"].items():
            try:
                last_price = self._get_market_last_price(market_id, position)
                refund = round(amount * last_price, 6)
                self.portfolio["cash"] += refund
                self.settle_log.append({
                    "market_id": market_id,
                    "position": position,
                    "amount": amount,
                    "refund": refund
                })
            except ValueError as e:
                print(f"[Reimburse] Could not reimburse {market_id} / {position}: {e}")
            to_remove.append((market_id, position))
        for key in to_remove:
            del self.portfolio["positions"][key]