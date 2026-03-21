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


# SECOND VERSION =========== ONYXIA ===========================================================

import math
import json
import pandas as pd
import duckdb
from glob import glob


DATA_PATH = "s3a://bastienlevyguinot/data"

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


# if __name__ == "__main__":
    
    # polymarket_add_categories()
    # tradable_markets = polymarket_clean_markets()
    
    # for file in kalshi_trade_files:
        # transform_kalshi_trade(file)
        # break

    # for file in polymarket_trade_files:
        # transform_polymarket_trade(file, tradable_markets)
        # if cpt_polymarket > 10:
            # break

# =======================================================================================================================================

import os
import subprocess
import duckdb
from pyspark.sql import SparkSession, functions as F
from pyspark.sql.types import ArrayType, StringType

# ── Configuration ─────────────────────────────────────────────────────────────
DATA_PATH = "s3a://bastienlevyguinot/data"
MC_PATH   = "s3/bastienlevyguinot/data"

# ── SparkSession ──────────────────────────────────────────────────────────────
spark = SparkSession.builder \
    .appName("polymarket_standardization") \
    .master("local[*]") \
    .config("spark.sql.parquet.datetimeRebaseModeInRead", "CORRECTED") \
    .config("spark.sql.parquet.int96RebaseModeInRead", "CORRECTED") \
    .config("spark.sql.legacy.parquet.nanosAsLong", "true") \
    .config("spark.hadoop.fs.s3a.endpoint", os.environ["AWS_S3_ENDPOINT"]) \
    .config("spark.hadoop.fs.s3a.access.key", os.environ["AWS_ACCESS_KEY_ID"]) \
    .config("spark.hadoop.fs.s3a.secret.key", os.environ["AWS_SECRET_ACCESS_KEY"]) \
    .config("spark.hadoop.fs.s3a.session.token", os.environ["AWS_SESSION_TOKEN"]) \
    .config("spark.hadoop.fs.s3a.aws.credentials.provider", "org.apache.hadoop.fs.s3a.TemporaryAWSCredentialsProvider") \
    .config("spark.hadoop.fs.s3a.path.style.access", "true") \
    .config("spark.sql.autoBroadcastJoinThreshold", "-1") \
    .getOrCreate()

# ── S3 File Listing ───────────────────────────────────────────────────────────
def list_s3_files(mc_path):
    """List parquet files on S3 via mc, excluding macOS ._* artifacts."""
    result = subprocess.run(
        ["mc", "find", mc_path, "--name", "*.parquet"],
        capture_output=True, text=True
    )
    files = [
        f.strip().replace("s3/", "s3a://")
        for f in result.stdout.strip().splitlines()
        if not f.split("/")[-1].startswith("._")
    ]
    return files

# ── Tradable Markets ──────────────────────────────────────────────────────────
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs;")
con.execute(f"SET s3_endpoint='{os.environ['AWS_S3_ENDPOINT']}'")
con.execute(f"SET s3_access_key_id='{os.environ['AWS_ACCESS_KEY_ID']}'")
con.execute(f"SET s3_secret_access_key='{os.environ['AWS_SECRET_ACCESS_KEY']}'")
con.execute(f"SET s3_session_token='{os.environ['AWS_SESSION_TOKEN']}'")
con.execute("SET s3_url_style='path'")

tradable_markets = con.execute(
    f"SELECT slug FROM read_parquet('s3://{MC_PATH.replace('s3/', '')}/polymarket_markets_cleaned.parquet')"
).df()["slug"].tolist()
print(f"Found {len(tradable_markets)} tradable markets")

# ── Main Function ─────────────────────────────────────────────────────────────
def transform_polymarket_trades_spark(spark, data_path, mc_path, tradable_markets):

    print("1. Préparation des tables de référence...")

    # A. Blocks
    block_files = list_s3_files(f"{mc_path}/polymarket/blocks/")
    print(f"   Found {len(block_files)} block files")

    df_blocks = spark.read.parquet(*block_files) \
    .select("block_number", F.col("timestamp").alias("block_timestamp")) \
    .dropDuplicates(["block_number"])

    # B. Markets lookup
    df_markets = spark.read.parquet(f"{data_path}/polymarket_markets_cleaned.parquet") \
        .withColumn("clob_token_array", F.from_json(F.col("clob_token_ids"), ArrayType(StringType()))) \
        .withColumn("outcomes_array",   F.from_json(F.col("outcomes"),        ArrayType(StringType())))

    df_markets_lookup = df_markets \
        .withColumn("zipped",   F.arrays_zip("clob_token_array", "outcomes_array")) \
        .withColumn("exploded", F.explode("zipped")) \
        .select(
            F.col("exploded.clob_token_array").alias("token_id"),
            F.col("question").alias("title"),
            F.col("volume").alias("market_volume"),
            F.col("slug").alias("market_id"),
            F.col("category"),
            F.col("exploded.outcomes_array").alias("position"),
            F.col("outcomes_array").alias("possible_outcomes")
        ).dropDuplicates(["token_id"])

    print("2. Chargement des trades et jointures...")

    # C. Trades
    trade_files = list_s3_files(f"{mc_path}/polymarket/trades/")
    print(f"   Found {len(trade_files)} trade files")

    df_trades = spark.read.option("mergeSchema", "true").parquet(*trade_files) \
        .withColumn(
            "trade_token_id",
            F.when(F.col("taker_asset_id") == '0', F.col("maker_asset_id"))
             .otherwise(F.col("taker_asset_id"))
        )
    
    df_joined = df_trades \
    .join(df_blocks, "block_number", "left") \
    .join(df_markets_lookup,
          df_trades.trade_token_id == df_markets_lookup.token_id, "left")

    print("3. Formatage final des colonnes...")

    # D. Final formatting
    df_out = df_joined.select(
        F.lit('polymarket').alias('platform'),
        F.date_format(
            F.to_timestamp(F.col("block_timestamp"), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
            "yyyy-MM-dd HH:mm:ss"
        ).alias("timestamp"),
        F.col("title"),
        F.col("market_volume").alias("volume"),
        F.col("market_id"),
        F.col("category"),
        F.col("position"),
        F.col("possible_outcomes"),
        F.round(
            F.when(
                F.col("maker_amount").isNotNull() & F.col("taker_amount").isNotNull() &
                (F.col("maker_amount") > 0) & (F.col("taker_amount") > 0),
                F.least(F.col("maker_amount") / F.col("taker_amount"),
                        F.col("taker_amount") / F.col("maker_amount"))
            ).otherwise(F.lit(None)), 6
        ).alias("price"),
        F.when(
            F.col("maker_amount").isNotNull() & F.col("taker_amount").isNotNull(),
            F.greatest(F.col("maker_amount"), F.col("taker_amount"))
        ).otherwise(F.lit(None)).alias("amount"),
        F.col("maker").alias("wallet_maker"),
        F.col("taker").alias("wallet_taker")
    ).filter(F.col("market_id").isin(tradable_markets))

    print("4. Écriture sur S3...")
    out_path = f"{data_path}/polymarket/standardized_trades/"
    df_out.repartition(100).write.mode("overwrite").parquet(out_path)
    print("Terminé !")

# ── Run ───────────────────────────────────────────────────────────────────────
transform_polymarket_trades_spark(spark, DATA_PATH, MC_PATH, tradable_markets)