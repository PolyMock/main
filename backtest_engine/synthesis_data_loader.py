"""
Synthesis API → Backtest Engine Data Loader

Fetches historical trade data and OHLC candlestick data from the Synthesis
Trade API and converts it into formats the BacktestEngine can use.

Two data modes:
  1. TRADES  — individual trades → standardized Parquet (engine reads directly)
  2. CANDLES — OHLC price history → separate Parquet per market + combined file
               Strategies access candles via user_perso_parameters for
               technical analysis (moving averages, support/resistance, etc.)

Output schema for trades (matches formating_data.py):
    platform, timestamp, title, volume, market_id, market_category,
    position, possible_outcomes, price, amount, wallet_maker, wallet_taker

Output schema for candles:
    market_id, timestamp, open, high, low, close, volume

Usage:
    python synthesis_data_loader.py                          # trades only
    python synthesis_data_loader.py --candles                # trades + candles
    python synthesis_data_loader.py --candles-only           # candles only
    python synthesis_data_loader.py --candles --interval 1d  # daily candles
    python synthesis_data_loader.py --limit 50               # top 50 markets
"""

import os
import time
import json
import argparse
import requests
import pandas as pd
from datetime import datetime

SYNTHESIS_API_BASE = "https://synthesis.trade/api/v1"
SYNTHESIS_API_KEY = os.environ.get("SYNTHESIS_API_KEY", "")

DEFAULT_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "data", "polymarket", "standardized_trades")
DEFAULT_MARKETS_DIR = os.path.join(os.path.dirname(__file__), "data", "polymarket", "markets")
DEFAULT_CANDLES_DIR = os.path.join(os.path.dirname(__file__), "data", "polymarket", "candles")

HEADERS = {
    "Accept": "application/json",
    "X-PROJECT-API-KEY": SYNTHESIS_API_KEY,
}

TRADES_PER_REQUEST = 1000  # max allowed by Synthesis API


def fetch_markets(limit: int = 200) -> list[dict]:
    """Fetch all available markets from Synthesis API."""
    print(f"Fetching up to {limit} markets from Synthesis API...")

    all_markets = []
    offset = 0
    page_size = min(limit, 100)

    while len(all_markets) < limit:
        resp = requests.get(
            f"{SYNTHESIS_API_BASE}/polymarket/markets",
            headers=HEADERS,
            params={
                "limit": page_size,
                "offset": offset,
                "sort": "volume1wk",
                "order": "DESC",
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        if not data.get("success") or not data.get("response"):
            break

        items = data["response"]
        if not items:
            break

        for item in items:
            event = item.get("event", {})
            markets = item.get("markets", [])
            for m in markets:
                all_markets.append({
                    "condition_id": m.get("condition_id"),
                    "question": m.get("question"),
                    "slug": m.get("slug"),
                    "volume": float(m.get("volume") or 0),
                    "category": event.get("category") or (event.get("labels", [None]) or [None])[0],
                    "left_token_id": m.get("left_token_id"),
                    "right_token_id": m.get("right_token_id"),
                    "left_outcome": m.get("left_outcome", "Yes"),
                    "right_outcome": m.get("right_outcome", "No"),
                    "left_price": m.get("left_price"),
                    "right_price": m.get("right_price"),
                    "resolved": m.get("resolved", False),
                    "ends_at": m.get("ends_at"),
                    "image": m.get("image"),
                })

        offset += page_size
        if len(items) < page_size:
            break

    all_markets = all_markets[:limit]
    print(f"  Found {len(all_markets)} markets")
    return all_markets


def fetch_trades_for_market(condition_id: str, max_trades: int = 10000) -> list[dict]:
    """Fetch all trades for a single market using pagination."""
    all_trades = []
    offset = 0

    while len(all_trades) < max_trades:
        try:
            resp = requests.get(
                f"{SYNTHESIS_API_BASE}/polymarket/market/{condition_id}/trades",
                headers=HEADERS,
                params={"limit": TRADES_PER_REQUEST, "offset": offset},
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()

            if not data.get("success") or not data.get("response"):
                break

            trades = data["response"]
            if not trades:
                break

            all_trades.extend(trades)
            offset += TRADES_PER_REQUEST

            if len(trades) < TRADES_PER_REQUEST:
                break

            # Rate limit
            time.sleep(0.2)

        except requests.exceptions.RequestException as e:
            print(f"    Error fetching trades at offset {offset}: {e}")
            break

    return all_trades[:max_trades]


def transform_trades(trades: list[dict], market: dict) -> pd.DataFrame:
    """
    Transform Synthesis trade data into the standardized format
    expected by BacktestEngine.

    Synthesis trade fields:
        tx_hash, token_id, address, side (bool), amount, shares, price,
        username, image, created_at

    Standardized output fields:
        platform, timestamp, title, volume, market_id, market_category,
        position, possible_outcomes, price, amount, wallet_maker, wallet_taker
    """
    if not trades:
        return pd.DataFrame()

    outcomes = [market["left_outcome"], market["right_outcome"]]
    left_token = market["left_token_id"]
    right_token = market["right_token_id"]

    rows = []
    for t in trades:
        # Determine position (Yes/No) based on token_id
        token_id = t.get("token_id", "")
        if token_id == left_token:
            position = market["left_outcome"]
        elif token_id == right_token:
            position = market["right_outcome"]
        else:
            # Fallback: side=true typically means Yes/Buy
            position = outcomes[0] if t.get("side") else outcomes[1]

        # Parse timestamp
        created_at = t.get("created_at", "")
        try:
            ts = pd.to_datetime(created_at).strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            ts = created_at

        # Parse price (comes as string "0.657")
        try:
            price = float(t.get("price", 0))
        except (ValueError, TypeError):
            price = 0.0

        # Parse amount (USDC amount as string "100.000")
        try:
            amount_raw = float(t.get("shares", 0) or t.get("amount", 0))
            amount = int(amount_raw) if amount_raw else 0
        except (ValueError, TypeError):
            amount = 0

        rows.append({
            "platform": "polymarket",
            "timestamp": ts,
            "title": market["question"],
            "volume": market["volume"],
            "market_id": market["slug"] or market["condition_id"],
            "market_category": market["category"],
            "position": position,
            "possible_outcomes": outcomes,
            "price": round(price, 6),
            "amount": amount,
            "wallet_maker": t.get("address"),
            "wallet_taker": t.get("address"),
        })

    df = pd.DataFrame(rows)
    return df


def fetch_candles_for_market(token_id: str, interval: str = "1d") -> list[dict]:
    """
    Fetch OHLC candlestick data for a market via price-history endpoint.
    Uses token_id (not condition_id).
    Available intervals: 1h, 6h, 1d, 1w, 1m, all
    """
    try:
        resp = requests.get(
            f"{SYNTHESIS_API_BASE}/polymarket/market/{token_id}/price-history",
            headers=HEADERS,
            params={"interval": interval, "volume": "true"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        if not data.get("success") or not data.get("response"):
            return []

        ohlc = data["response"].get("ohlc", [])
        volumes = data["response"].get("volume", [])

        # Merge volume into OHLC candles
        for i, candle in enumerate(ohlc):
            candle["vol"] = volumes[i] if i < len(volumes) else 0.0

        return ohlc

    except requests.exceptions.RequestException as e:
        print(f"Error fetching candles: {e}")
        return []


def transform_candles(candles: list[dict], market: dict) -> pd.DataFrame:
    """Transform raw OHLC candles into a standardized DataFrame."""
    if not candles:
        return pd.DataFrame()

    rows = []
    for c in candles:
        ts = pd.to_datetime(c["time"], unit="s").strftime("%Y-%m-%d %H:%M:%S")
        rows.append({
            "market_id": market["slug"] or market["condition_id"],
            "title": market["question"],
            "category": market["category"],
            "timestamp": ts,
            "open": float(c.get("open", 0)),
            "high": float(c.get("high", 0)),
            "low": float(c.get("low", 0)),
            "close": float(c.get("close", 0)),
            "volume": float(c.get("vol", 0)),
        })

    return pd.DataFrame(rows)


def candles_to_trades(candles_df: pd.DataFrame, market: dict) -> pd.DataFrame:
    """
    Convert OHLC candles into synthetic trade rows matching the engine's
    standardized schema. Each candle produces one trade at the close price.
    Useful when individual trade data is sparse or unavailable.
    """
    if candles_df.empty:
        return pd.DataFrame()

    outcomes = [market["left_outcome"], market["right_outcome"]]

    rows = []
    for _, c in candles_df.iterrows():
        rows.append({
            "platform": "polymarket",
            "timestamp": c["timestamp"],
            "title": market["question"],
            "volume": market["volume"],
            "market_id": market["slug"] or market["condition_id"],
            "market_category": market["category"],
            "position": outcomes[0],  # Yes side (left token price)
            "possible_outcomes": outcomes,
            "price": round(c["close"], 6),
            "amount": max(1, int(c["volume"])) if c["volume"] > 0 else 1,
            "wallet_maker": None,
            "wallet_taker": None,
        })

    return pd.DataFrame(rows)


def save_market_metadata(markets: list[dict], output_dir: str):
    """Save market metadata as a Parquet file for BacktestEngine outcome resolution."""
    os.makedirs(output_dir, exist_ok=True)

    rows = []
    for m in markets:
        outcomes = [m["left_outcome"], m["right_outcome"]]
        # Build outcome_prices: if resolved, winner gets 1.0
        outcome_prices = [str(m.get("left_price", "0.5")), str(m.get("right_price", "0.5"))]

        clob_token_ids = [m["left_token_id"] or "", m["right_token_id"] or ""]

        rows.append({
            "question": m["question"],
            "volume": m["volume"],
            "slug": m["slug"],
            "outcomes": json.dumps(outcomes),
            "outcome_prices": json.dumps(outcome_prices),
            "clob_token_ids": json.dumps(clob_token_ids),
            "category": m["category"],
            "end_date": m["ends_at"],
            "condition_id": m["condition_id"],
        })

    df = pd.DataFrame(rows)
    path = os.path.join(output_dir, "synthesis_markets.parquet")
    df.to_parquet(path, index=False)
    print(f"  Saved {len(df)} markets metadata to {path}")


def run(limit: int = 200, output_dir: str = None, markets_dir: str = None,
        candles_dir: str = None, max_trades_per_market: int = 10000,
        fetch_candles: bool = False, candles_only: bool = False,
        candle_interval: str = "1d"):
    """Main pipeline: fetch markets → fetch trades/candles → transform → save Parquet."""

    if not SYNTHESIS_API_KEY:
        print("ERROR: SYNTHESIS_API_KEY environment variable not set.")
        print("  Set it with: export SYNTHESIS_API_KEY=sk_...")
        return

    output_dir = output_dir or DEFAULT_OUTPUT_DIR
    markets_dir = markets_dir or DEFAULT_MARKETS_DIR
    candles_dir = candles_dir or DEFAULT_CANDLES_DIR
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(candles_dir, exist_ok=True)

    # Step 1: Fetch all markets
    markets = fetch_markets(limit=limit)
    if not markets:
        print("No markets found. Exiting.")
        return

    # Step 2: Save market metadata (for outcome resolution)
    save_market_metadata(markets, markets_dir)

    # Step 3: Fetch trades for each market
    total_trades = 0
    total_candles = 0
    skipped = 0
    all_candles_dfs = []

    for i, market in enumerate(markets):
        cid = market["condition_id"]
        slug = market["slug"] or cid[:16]
        safe_name = slug.replace("/", "_").replace(" ", "_")[:80]
        print(f"  [{i+1}/{len(markets)}] {slug}: ", end="", flush=True)

        if not cid:
            print("skipped (no condition_id)")
            skipped += 1
            continue

        # --- Trades ---
        if not candles_only:
            trades = fetch_trades_for_market(cid, max_trades=max_trades_per_market)
            if trades:
                df = transform_trades(trades, market)
                if not df.empty:
                    out_path = os.path.join(output_dir, f"{safe_name}_std.parquet")
                    df.to_parquet(out_path, index=False)
                    total_trades += len(df)
                    print(f"{len(df)} trades", end="")
                else:
                    print("0 trades", end="")
            else:
                print("0 trades", end="")

        # --- Candles ---
        if fetch_candles or candles_only:
            token_id = market["left_token_id"]
            if token_id:
                raw_candles = fetch_candles_for_market(token_id, interval=candle_interval)
                candles_df = transform_candles(raw_candles, market)

                if not candles_df.empty:
                    # Save individual market candles
                    candle_path = os.path.join(candles_dir, f"{safe_name}_candles.parquet")
                    candles_df.to_parquet(candle_path, index=False)
                    all_candles_dfs.append(candles_df)
                    total_candles += len(candles_df)

                    # If candles_only, also generate synthetic trades from candles
                    if candles_only:
                        synthetic_df = candles_to_trades(candles_df, market)
                        if not synthetic_df.empty:
                            out_path = os.path.join(output_dir, f"{safe_name}_std.parquet")
                            synthetic_df.to_parquet(out_path, index=False)
                            total_trades += len(synthetic_df)

                    print(f" + {len(candles_df)} candles", end="")

            time.sleep(0.2)

        print("")  # newline
        time.sleep(0.3)

    # Save combined candles file (all markets in one Parquet)
    if all_candles_dfs:
        combined = pd.concat(all_candles_dfs, ignore_index=True).sort_values("timestamp").reset_index(drop=True)
        combined_path = os.path.join(candles_dir, "_all_candles.parquet")
        combined.to_parquet(combined_path, index=False)
        print(f"\n  Combined candles saved to {combined_path}")

    print(f"\nDone!")
    if not candles_only:
        print(f"  Trades: {total_trades} from {len(markets) - skipped} markets → {output_dir}")
    if fetch_candles or candles_only:
        print(f"  Candles: {total_candles} across {len(all_candles_dfs)} markets → {candles_dir}")
    print(f"  Markets metadata: {markets_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch Synthesis API data for backtest engine")
    parser.add_argument("--limit", type=int, default=200, help="Max number of markets to fetch")
    parser.add_argument("--output", type=str, default=None, help="Output directory for standardized trade Parquet files")
    parser.add_argument("--markets-dir", type=str, default=None, help="Output directory for market metadata Parquet")
    parser.add_argument("--candles-dir", type=str, default=None, help="Output directory for candlestick Parquet files")
    parser.add_argument("--max-trades", type=int, default=10000, help="Max trades per market")
    parser.add_argument("--candles", action="store_true", help="Also fetch OHLC candlestick data")
    parser.add_argument("--candles-only", action="store_true", help="Fetch candles only (generates synthetic trades from candles)")
    parser.add_argument("--interval", type=str, default="1d", help="Candle interval: 1h, 6h, 1d, 1w, 1m, all (default: 1d)")
    args = parser.parse_args()

    run(
        limit=args.limit,
        output_dir=args.output,
        markets_dir=args.markets_dir,
        candles_dir=args.candles_dir,
        max_trades_per_market=args.max_trades,
        fetch_candles=args.candles,
        candles_only=args.candles_only,
        candle_interval=args.interval,
    )
