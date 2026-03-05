import math
import json
import pandas as pd
import duckdb
from glob import glob


DATA_PATH = "/Volumes/Extreme SSD/prediction-market-data/data"

# =======================================================================================================================================

cpt_kalshi = 0

def transform_kalshi_trade(file):

    global cpt_kalshi
    global lenght_kalshi
    cpt_kalshi += 1
    print(cpt_kalshi, lenght_kalshi)
    
    df = pd.read_parquet(file)
    out_path = file.replace("kalshi/trades", "kalshi/standardized_trades").replace(".parquet", "_std.parquet")
    memory_dict = {}
    
    df_out = pd.DataFrame({
        'platform': 'kalshi',
        'timestamp': pd.to_datetime(df['created_time']).dt.strftime('%Y-%m-%d %H:%M:%S'),
        'title': df.apply(lambda row: kalshi_add_marketname(row['ticker'], memory_dict)[1] if kalshi_add_marketname(row['ticker'], memory_dict) else None, axis=1),
        'volume': df.apply(lambda row: kalshi_add_marketname(row['ticker'], memory_dict)[2] if kalshi_add_marketname(row['ticker'], memory_dict) else None, axis=1),
        'market_id': df['ticker'],
        'category': [None] * len(df),
        'position': df.apply(lambda row: "Yes" if row['taker_side']=='yes' else "No", axis=1),
        'possible_outcomes': [['Yes', 'No']] * len(df),
        'price': df.apply(lambda row: row['yes_price'] / 100.0 if row['taker_side'] == 'yes' else row['no_price'] / 100.0, axis=1),
        'amount': df['count'],
        'wallet_maker': None,
        'wallet_taker': None,
        })
    df_out.to_parquet(out_path, index=False)

def kalshi_add_marketname(ticker, memory_dict):

    if ticker in memory_dict:
        return memory_dict[ticker]
    
    market_files = [f for f in glob(f"{DATA_PATH}/kalshi/markets/*.parquet") if not f.split('/')[-1].startswith("._")]
    con = duckdb.connect()
    query = f"""
        SELECT market_type, title, volume
        FROM read_parquet({market_files})
        WHERE ticker = '{ticker}'
        LIMIT 1
    """
    result = con.execute(query).fetchone()
    if result:
        memory_dict[ticker] = result
    return result if result else None

# =======================================================================================================================================
cpt_polymarket = 0

def transform_polymarket_trade(file, tradable_markets):

    global cpt_polymarket
    global lenght_polymarket
    cpt_polymarket += 1
    print(cpt_polymarket, lenght_polymarket)
    
    df = pd.read_parquet(file)
    out_path = file.replace("polymarket/trades", "polymarket/standardized_trades").replace(".parquet", "_std.parquet")
    memory_dict_time = {}
    memory_dict_market = {}

    df_out = pd.DataFrame({
        'platform': 'polymarket',
        'timestamp': df.apply(lambda row: polymarket_add_timestamp(row['block_number'], memory_dict_time), axis=1),
        'title': df.apply(lambda row: polymarket_add_market_features(row['maker_asset_id'], row['taker_asset_id'], memory_dict_market)[0], axis=1),
        'volume': df.apply(lambda row: polymarket_add_market_features(row['maker_asset_id'], row['taker_asset_id'], memory_dict_market)[1], axis=1),
        'market_id': df.apply(lambda row: polymarket_add_market_features(row['maker_asset_id'], row['taker_asset_id'], memory_dict_market)[2], axis=1),
        'category': df.apply(lambda row: polymarket_add_market_features(row['maker_asset_id'], row['taker_asset_id'], memory_dict_market)[5], axis=1),
        'position': df.apply(lambda row: polymarket_add_market_features(row['maker_asset_id'], row['taker_asset_id'], memory_dict_market)[3], axis=1),
        'possible_outcomes': df.apply(lambda row: polymarket_add_market_features(row['maker_asset_id'], row['taker_asset_id'], memory_dict_market)[4], axis=1),
        'price': df.apply(lambda row: round(min(row['maker_amount']/row['taker_amount'], row['taker_amount']/row['maker_amount']) if row['maker_amount'] and row['taker_amount'] else None, 6), axis=1),
        'amount': df.apply(lambda row: max(row['maker_amount'], row['taker_amount']) if row['maker_amount'] and row['taker_amount'] else None, axis=1),
        'wallet_maker': df['maker'],
        'wallet_taker': df['taker']
        })

    df_out = df_out[df_out["market_id"].isin(tradable_markets)].reset_index(drop=True)
    df_out.to_parquet(out_path, index=False)

def polymarket_add_timestamp(block_number, memory_dict_time):

    if block_number in memory_dict_time:
        return memory_dict_time[block_number]
    
    bn_inf = math.floor(int(block_number)/100000)*100000
    bn_sup = bn_inf + 100000
    file = f"{DATA_PATH}/polymarket/blocks/blocks_{bn_inf}_{bn_sup}.parquet"
    con = duckdb.connect()
    query = f"""
        SELECT timestamp
        FROM read_parquet('{file}')
        WHERE block_number = {block_number}
        LIMIT 1
    """
    result = con.execute(query).fetchone()
    if result:
        # Format as "YYYY-MM-DD HH:MM:SS"
        timestamp = pd.to_datetime(result[0]).strftime('%Y-%m-%d %H:%M:%S')
        memory_dict_time[block_number] = timestamp
        return timestamp
    return None

def polymarket_add_market_features(maker_asset_id, taker_asset_id, memory_dict_market):
    # retrieve question, volume, slug for a given pair of maker/taker asset ids

    key = (maker_asset_id, taker_asset_id)
    if key in memory_dict_market:
        return memory_dict_market[key]
    
    con = duckdb.connect()
    token_id = maker_asset_id if taker_asset_id == '0' else taker_asset_id
    query = f"""
        SELECT question, volume, slug, outcomes, clob_token_ids, category
        FROM read_parquet(polymarket_markets_cleaned.parquet)
        WHERE clob_token_ids LIKE '%{token_id}%'
        LIMIT 1
    """
    result = con.execute(query).fetchall()

    if not result:
        return (None, None, None, None, None, None)

    clob_token_ids = json.loads(result[0][4])  # ✅ parse string → real list of 2 elements
    outcomes = json.loads(result[0][3])        # ✅ same issue likely applies to outcomes
    
    for i in range(len(clob_token_ids)):
        if token_id == clob_token_ids[i]:
            position = outcomes[i]
            break
    
    memory_dict_market[key] = (result[0][0], result[0][1], result[0][2], position, outcomes, result[0][5])
    return memory_dict_market[key]

# =======================================================================================================================================

def polymarket_clean_markets():
    con = duckdb.connect()

    df = con.execute(f"""
        SELECT *
        FROM read_parquet(polymarket_markets_with_categories.parquet)
        WHERE question IS NOT NULL AND question != ''
          AND slug IS NOT NULL AND slug != ''
          AND outcomes IS NOT NULL AND outcomes != '' AND outcomes != '[]' AND outcomes != 'null'
          AND outcome_prices IS NOT NULL AND outcome_prices != '' AND outcome_prices != '[]' AND outcome_prices != 'null'
          AND clob_token_ids IS NOT NULL AND clob_token_ids != '' AND clob_token_ids != '[]' AND clob_token_ids != 'null'
          AND end_date IS NOT NULL
    """).df()

    # Keep only resolved markets: at least one outcome price must equal exactly 1.0
    def is_resolved(outcome_prices_str):
        try:
            prices = json.loads(outcome_prices_str)
            return any(float(p) >= 0.999 for p in prices)
        except Exception:
            return False

    df = df[df["outcome_prices"].apply(is_resolved)].reset_index(drop=True)

    df.to_parquet(f"polymarket_markets_cleaned.parquet", index=False)
    resolved_slugs = df["slug"].dropna().tolist()
    return resolved_slugs

def polymarket_add_categories():
    
    market_files = [f for f in glob(f"{DATA_PATH}/polymarket/markets/*.parquet") if not f.split('/')[-1].startswith("._")]
    con = duckdb.connect()

    df = con.execute(f"""
        SELECT *
        FROM read_parquet({market_files})
    """).df()

    df_cats_p = con.execute(f"""
        SELECT *
        FROM read_parquet('polymarket_events_categories_2.parquet')
    """).df()
    
    df_cats_p = df_cats_p[df_cats_p["category_derived"].notnull() & (df_cats_p["category_derived"] != "")].reset_index(drop=True)

    df["category"] = df["slug"].map(df_cats_p.set_index("event_slug")["category_derived"])
    df["category"] = df["category"].where(pd.notnull(df["category"]), None)

    df.to_parquet("polymarket_markets_with_categories.parquet", index=False)  # Debug: save raw data to CSV

# =======================================================================================================================================

kalshi_trade_files = [f for f in glob(f"{DATA_PATH}/kalshi/trades/*.parquet") if not f.split('/')[-1].startswith("._")]
polymarket_trade_files = [f for f in glob(f"{DATA_PATH}/polymarket/trades/*.parquet") if not f.split('/')[-1].startswith("._")]
lenght_kalshi = len(kalshi_trade_files)
lenght_polymarket = len(polymarket_trade_files)


if __name__ == "__main__":
    
    polymarket_add_categories()
    tradable_markets = polymarket_clean_markets()
    
    for file in kalshi_trade_files:
        transform_kalshi_trade(file)
        break

    for file in polymarket_trade_files:
        transform_polymarket_trade(file, tradable_markets)
        break