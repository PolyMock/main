//! Data formatting / transformation — direct port of formating_data.py
//!
//! Transforms raw Kalshi and Polymarket trade parquet files into the standardized
//! schema used by BacktestEngine:
//!   platform, timestamp, title, volume, market_id, market_category,
//!   position, possible_outcomes, price, amount, wallet_maker, wallet_taker

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use anyhow::{Result, bail};
use glob::glob;
use polars::prelude::*;

// ── Kalshi ─────────────────────────────────────────────────────────────────────

/// Transform a single Kalshi raw trade parquet file into standardized format.
pub fn transform_kalshi_trade(file: &Path, data_path: &str, counter: usize, total: usize) -> Result<()> {
    println!("{} {}", counter, total);

    let df = LazyFrame::scan_parquet(file, Default::default())?
        .collect()?;

    let out_path_str = file
        .to_string_lossy()
        .replace("kalshi/trades", "kalshi/standardized_trades")
        .replace(".parquet", "_std.parquet");
    let out_path = PathBuf::from(&out_path_str);

    // Ensure output directory exists
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let n = df.height();

    // Extract columns
    let created_time_col = df.column("created_time")?.str()?;
    let ticker_col = df.column("ticker")?.str()?;
    let taker_side_col = df.column("taker_side")?.str()?;
    let yes_price_col = df.column("yes_price")?.f64()?;
    let no_price_col = df.column("no_price")?.f64()?;
    let count_col = df.column("count")?.i64()?;

    let mut platforms = Vec::with_capacity(n);
    let mut timestamps = Vec::with_capacity(n);
    let mut titles: Vec<Option<String>> = Vec::with_capacity(n);
    let mut volumes: Vec<Option<f64>> = Vec::with_capacity(n);
    let mut market_ids = Vec::with_capacity(n);
    let mut categories: Vec<Option<String>> = Vec::with_capacity(n);
    let mut positions = Vec::with_capacity(n);
    let mut possible_outcomes = Vec::with_capacity(n);
    let mut prices = Vec::with_capacity(n);
    let mut amounts = Vec::with_capacity(n);

    let mut memory_dict: HashMap<String, (String, String, f64)> = HashMap::new();

    for i in 0..n {
        platforms.push("kalshi".to_string());

        // timestamp
        let ts = created_time_col.get(i).unwrap_or("");
        timestamps.push(parse_timestamp(ts));

        // ticker / market_id
        let ticker = ticker_col.get(i).unwrap_or("");
        market_ids.push(ticker.to_string());

        // Look up market name from parquet
        let (title, volume) = kalshi_market_info(ticker, data_path, &mut memory_dict);
        titles.push(title);
        volumes.push(volume);
        categories.push(None);

        // position
        let side = taker_side_col.get(i).unwrap_or("yes");
        if side.eq_ignore_ascii_case("yes") {
            positions.push("Yes".to_string());
            prices.push(yes_price_col.get(i).unwrap_or(0.0) / 100.0);
        } else {
            positions.push("No".to_string());
            prices.push(no_price_col.get(i).unwrap_or(0.0) / 100.0);
        }

        possible_outcomes.push("[\"Yes\",\"No\"]".to_string());
        amounts.push(count_col.get(i).unwrap_or(0));
    }

    let mut out_df = DataFrame::new(vec![
        Column::new("platform".into(), &platforms),
        Column::new("timestamp".into(), &timestamps),
        Column::new("title".into(), &titles.iter().map(|o| o.as_deref().unwrap_or("")).collect::<Vec<_>>()),
        Column::new("volume".into(), &volumes.iter().map(|o| o.unwrap_or(0.0)).collect::<Vec<_>>()),
        Column::new("market_id".into(), &market_ids),
        Column::new("category".into(), &categories.iter().map(|o| o.as_deref().unwrap_or("")).collect::<Vec<_>>()),
        Column::new("position".into(), &positions),
        Column::new("possible_outcomes".into(), &possible_outcomes),
        Column::new("price".into(), &prices),
        Column::new("amount".into(), &amounts),
        Column::new("wallet_maker".into(), vec![""; n]),
        Column::new("wallet_taker".into(), vec![""; n]),
    ])?;

    let file_out = std::fs::File::create(&out_path)?;
    ParquetWriter::new(file_out).finish(&mut out_df)?;

    Ok(())
}

fn kalshi_market_info(
    ticker: &str,
    data_path: &str,
    memory: &mut HashMap<String, (String, String, f64)>,
) -> (Option<String>, Option<f64>) {
    if let Some(cached) = memory.get(ticker) {
        return (Some(cached.1.clone()), Some(cached.2));
    }

    let pattern = format!("{}/kalshi/markets/*.parquet", data_path);
    let files: Vec<PathBuf> = glob(&pattern)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter(|p| !p.file_name().unwrap_or_default().to_string_lossy().starts_with("._"))
        .collect();

    if files.is_empty() {
        return (None, None);
    }

    let paths: Vec<PathBuf> = files.into_iter().collect();
    let args = ScanArgsParquet { ..Default::default() };
    let lf = match LazyFrame::scan_parquet_files(paths.into(), args) {
        Ok(lf) => lf,
        Err(_) => return (None, None),
    };

    let result = lf
        .filter(col("ticker").eq(lit(ticker)))
        .select([col("market_type"), col("title"), col("volume")])
        .limit(1)
        .collect();

    match result {
        Ok(df) if df.height() > 0 => {
            let market_type = df.column("market_type").ok()
                .and_then(|c| c.str().ok())
                .and_then(|c| c.get(0).map(|s| s.to_string()))
                .unwrap_or_default();
            let title = df.column("title").ok()
                .and_then(|c| c.str().ok())
                .and_then(|c| c.get(0).map(|s| s.to_string()))
                .unwrap_or_default();
            let volume = df.column("volume").ok()
                .and_then(|c| c.f64().ok())
                .and_then(|c| c.get(0))
                .unwrap_or(0.0);

            memory.insert(ticker.to_string(), (market_type, title.clone(), volume));
            (Some(title), Some(volume))
        }
        _ => (None, None),
    }
}

// ── Polymarket ─────────────────────────────────────────────────────────────────

/// Transform a single Polymarket raw trade parquet file into standardized format.
pub fn transform_polymarket_trade(
    file: &Path,
    data_path: &str,
    tradable_markets: &[String],
    counter: usize,
    total: usize,
) -> Result<()> {
    println!("{} {}", counter, total);

    let df = LazyFrame::scan_parquet(file, Default::default())?
        .collect()?;

    let out_path_str = file
        .to_string_lossy()
        .replace("polymarket/trades", "polymarket/standardized_trades")
        .replace(".parquet", "_std.parquet");
    let out_path = PathBuf::from(&out_path_str);

    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let n = df.height();

    let block_col = df.column("block_number")?.i64()?;
    let maker_asset_col = df.column("maker_asset_id")?.str()?;
    let taker_asset_col = df.column("taker_asset_id")?.str()?;
    let maker_amount_col = df.column("maker_amount")?.f64()?;
    let taker_amount_col = df.column("taker_amount")?.f64()?;
    let maker_col = df.column("maker")?.str()?;
    let taker_col = df.column("taker")?.str()?;

    let mut platforms = Vec::with_capacity(n);
    let mut timestamps = Vec::with_capacity(n);
    let mut titles_out: Vec<String> = Vec::with_capacity(n);
    let mut volumes_out: Vec<f64> = Vec::with_capacity(n);
    let mut market_ids_out: Vec<String> = Vec::with_capacity(n);
    let mut categories_out: Vec<String> = Vec::with_capacity(n);
    let mut positions_out: Vec<String> = Vec::with_capacity(n);
    let mut po_out: Vec<String> = Vec::with_capacity(n);
    let mut prices_out: Vec<f64> = Vec::with_capacity(n);
    let mut amounts_out: Vec<f64> = Vec::with_capacity(n);
    let mut wallet_makers: Vec<String> = Vec::with_capacity(n);
    let mut wallet_takers: Vec<String> = Vec::with_capacity(n);

    let mut time_cache: HashMap<i64, String> = HashMap::new();
    let mut market_cache: HashMap<(String, String), (String, f64, String, String, Vec<String>, String)> = HashMap::new();

    // Collect all rows, then filter for tradable markets
    let mut keep = Vec::with_capacity(n);

    for i in 0..n {
        let maker_asset = maker_asset_col.get(i).unwrap_or("").to_string();
        let taker_asset = taker_asset_col.get(i).unwrap_or("").to_string();

        let features = polymarket_market_features(
            &maker_asset,
            &taker_asset,
            data_path,
            &mut market_cache,
        );

        let (title, volume, slug, position, outcomes, category) = features;

        if !tradable_markets.contains(&slug) {
            keep.push(false);
            continue;
        }
        keep.push(true);

        platforms.push("polymarket".to_string());

        // Timestamp from block number
        let block_num = block_col.get(i).unwrap_or(0);
        let ts = polymarket_block_timestamp(block_num, data_path, &mut time_cache);
        timestamps.push(ts);

        titles_out.push(title);
        volumes_out.push(volume);
        market_ids_out.push(slug);
        categories_out.push(category);
        positions_out.push(position);
        po_out.push(serde_json::to_string(&outcomes).unwrap_or_default());

        // Price = min(maker/taker, taker/maker)
        let ma = maker_amount_col.get(i).unwrap_or(0.0);
        let ta = taker_amount_col.get(i).unwrap_or(0.0);
        let price = if ma > 0.0 && ta > 0.0 {
            (ma / ta).min(ta / ma)
        } else {
            0.0
        };
        prices_out.push((price * 1e6).round() / 1e6);

        // Amount = max of the two
        amounts_out.push(if ma > ta { ma } else { ta });

        wallet_makers.push(maker_col.get(i).unwrap_or("").to_string());
        wallet_takers.push(taker_col.get(i).unwrap_or("").to_string());
    }

    let mut out_df = DataFrame::new(vec![
        Column::new("platform".into(), &platforms),
        Column::new("timestamp".into(), &timestamps),
        Column::new("title".into(), &titles_out),
        Column::new("volume".into(), &volumes_out),
        Column::new("market_id".into(), &market_ids_out),
        Column::new("category".into(), &categories_out),
        Column::new("position".into(), &positions_out),
        Column::new("possible_outcomes".into(), &po_out),
        Column::new("price".into(), &prices_out),
        Column::new("amount".into(), &amounts_out),
        Column::new("wallet_maker".into(), &wallet_makers),
        Column::new("wallet_taker".into(), &wallet_takers),
    ])?;

    let file_out = std::fs::File::create(&out_path)?;
    ParquetWriter::new(file_out).finish(&mut out_df)?;

    Ok(())
}

fn polymarket_block_timestamp(
    block_number: i64,
    data_path: &str,
    cache: &mut HashMap<i64, String>,
) -> String {
    if let Some(cached) = cache.get(&block_number) {
        return cached.clone();
    }

    let bn_inf = (block_number / 100_000) * 100_000;
    let bn_sup = bn_inf + 100_000;
    let file = format!("{}/polymarket/blocks/blocks_{}_{}.parquet", data_path, bn_inf, bn_sup);
    let path = PathBuf::from(&file);

    if !path.exists() {
        return String::new();
    }

    let result = LazyFrame::scan_parquet(&path, Default::default())
        .and_then(|lf| {
            lf.filter(col("block_number").eq(lit(block_number)))
                .select([col("timestamp")])
                .limit(1)
                .collect()
        });

    match result {
        Ok(df) if df.height() > 0 => {
            let ts_str = df.column("timestamp").ok()
                .and_then(|c| c.str().ok())
                .and_then(|c| c.get(0).map(|s| s.to_string()))
                .unwrap_or_default();
            let formatted = parse_timestamp(&ts_str);
            cache.insert(block_number, formatted.clone());
            formatted
        }
        _ => String::new(),
    }
}

fn polymarket_market_features(
    maker_asset_id: &str,
    taker_asset_id: &str,
    data_path: &str,
    cache: &mut HashMap<(String, String), (String, f64, String, String, Vec<String>, String)>,
) -> (String, f64, String, String, Vec<String>, String) {
    let key = (maker_asset_id.to_string(), taker_asset_id.to_string());
    if let Some(cached) = cache.get(&key) {
        return cached.clone();
    }

    let token_id = if taker_asset_id == "0" { maker_asset_id } else { taker_asset_id };

    // Query the cleaned markets parquet
    let cleaned_path = PathBuf::from("polymarket_markets_cleaned.parquet");
    if !cleaned_path.exists() {
        let empty = (String::new(), 0.0, String::new(), String::new(), Vec::new(), String::new());
        cache.insert(key, empty.clone());
        return empty;
    }

    let result = LazyFrame::scan_parquet(&cleaned_path, Default::default())
        .and_then(|lf| {
            lf.filter(col("clob_token_ids").str().contains_literal(lit(token_id)))
                .select([col("question"), col("volume"), col("slug"), col("outcomes"), col("clob_token_ids"), col("category")])
                .limit(1)
                .collect()
        });

    match result {
        Ok(df) if df.height() > 0 => {
            let question = df.column("question").ok()
                .and_then(|c| c.str().ok())
                .and_then(|c| c.get(0).map(|s| s.to_string()))
                .unwrap_or_default();
            let volume = df.column("volume").ok()
                .and_then(|c| c.f64().ok())
                .and_then(|c| c.get(0))
                .unwrap_or(0.0);
            let slug = df.column("slug").ok()
                .and_then(|c| c.str().ok())
                .and_then(|c| c.get(0).map(|s| s.to_string()))
                .unwrap_or_default();
            let outcomes_str = df.column("outcomes").ok()
                .and_then(|c| c.str().ok())
                .and_then(|c| c.get(0).map(|s| s.to_string()))
                .unwrap_or_default();
            let clob_str = df.column("clob_token_ids").ok()
                .and_then(|c| c.str().ok())
                .and_then(|c| c.get(0).map(|s| s.to_string()))
                .unwrap_or_default();
            let category = df.column("category").ok()
                .and_then(|c| c.str().ok())
                .and_then(|c| c.get(0).map(|s| s.to_string()))
                .unwrap_or_default();

            let clob_tokens: Vec<String> = serde_json::from_str(&clob_str).unwrap_or_default();
            let outcomes: Vec<String> = serde_json::from_str(&outcomes_str).unwrap_or_default();

            let mut position = String::new();
            for (j, tok) in clob_tokens.iter().enumerate() {
                if tok == token_id {
                    position = outcomes.get(j).cloned().unwrap_or_default();
                    break;
                }
            }

            let entry = (question, volume, slug, position, outcomes, category);
            cache.insert(key, entry.clone());
            entry
        }
        _ => {
            let empty = (String::new(), 0.0, String::new(), String::new(), Vec::new(), String::new());
            cache.insert(key, empty.clone());
            empty
        }
    }
}

// ── Polymarket market cleaning ─────────────────────────────────────────────────

/// Add categories to polymarket markets (from events categories parquet).
pub fn polymarket_add_categories(data_path: &str, categories_parquet: &Path) -> Result<()> {
    let pattern = format!("{}/polymarket/markets/*.parquet", data_path);
    let files: Vec<PathBuf> = glob(&pattern)?
        .filter_map(|e| e.ok())
        .filter(|p| !p.file_name().unwrap_or_default().to_string_lossy().starts_with("._"))
        .collect();

    if files.is_empty() {
        bail!("No polymarket market files found");
    }

    let paths: Vec<PathBuf> = files.into_iter().collect();
    let args = ScanArgsParquet { ..Default::default() };
    let mut df = LazyFrame::scan_parquet_files(paths.into(), args)?.collect()?;

    // Load categories
    let cats_df = LazyFrame::scan_parquet(categories_parquet, Default::default())?
        .filter(col("category_derived").is_not_null())
        .filter(col("category_derived").neq(lit("")))
        .collect()?;

    // Build slug → category map
    let slug_col = cats_df.column("event_slug")?.str()?;
    let cat_col = cats_df.column("category_derived")?.str()?;
    let mut cat_map: HashMap<String, String> = HashMap::new();
    for i in 0..cats_df.height() {
        if let (Some(slug), Some(cat)) = (slug_col.get(i), cat_col.get(i)) {
            cat_map.insert(slug.to_string(), cat.to_string());
        }
    }

    // Map categories onto main df
    let df_slug_col = df.column("slug")?.str()?;
    let categories: Vec<Option<String>> = (0..df.height())
        .map(|i| {
            df_slug_col.get(i)
                .and_then(|slug| cat_map.get(slug).cloned())
        })
        .collect();

    let cat_series = Column::new("category".into(), &categories.iter().map(|o| o.as_deref().unwrap_or("")).collect::<Vec<_>>());

    // Replace or add category column
    if df.get_column_names_str().contains(&"category") {
        let _ = df.replace("category", cat_series.take_materialized_series());
    } else {
        df.with_column(cat_series)?;
    }

    let out_path = PathBuf::from("polymarket_markets_with_categories.parquet");
    let file = std::fs::File::create(&out_path)?;
    ParquetWriter::new(file).finish(&mut df)?;

    Ok(())
}

/// Clean markets: keep only resolved ones.
pub fn polymarket_clean_markets() -> Result<Vec<String>> {
    let path = PathBuf::from("polymarket_markets_with_categories.parquet");
    if !path.exists() {
        bail!("polymarket_markets_with_categories.parquet not found. Run polymarket_add_categories first.");
    }

    let df = LazyFrame::scan_parquet(&path, Default::default())?
        .filter(col("question").is_not_null().and(col("question").neq(lit(""))))
        .filter(col("slug").is_not_null().and(col("slug").neq(lit(""))))
        .filter(col("outcomes").is_not_null().and(col("outcomes").neq(lit(""))).and(col("outcomes").neq(lit("[]"))).and(col("outcomes").neq(lit("null"))))
        .filter(col("outcome_prices").is_not_null().and(col("outcome_prices").neq(lit(""))).and(col("outcome_prices").neq(lit("[]"))).and(col("outcome_prices").neq(lit("null"))))
        .filter(col("clob_token_ids").is_not_null().and(col("clob_token_ids").neq(lit(""))).and(col("clob_token_ids").neq(lit("[]"))).and(col("clob_token_ids").neq(lit("null"))))
        .filter(col("end_date").is_not_null())
        .collect()?;

    // Keep only resolved markets: at least one outcome price >= 0.999
    let prices_col = df.column("outcome_prices")?.str()?;
    let mut keep_mask: Vec<bool> = Vec::with_capacity(df.height());

    for i in 0..df.height() {
        let is_resolved = prices_col.get(i)
            .and_then(|s| {
                serde_json::from_str::<Vec<serde_json::Value>>(s).ok()
            })
            .map(|prices| {
                prices.iter().any(|p| {
                    let v = match p {
                        serde_json::Value::Number(n) => n.as_f64().unwrap_or(0.0),
                        serde_json::Value::String(s) => s.parse::<f64>().unwrap_or(0.0),
                        _ => 0.0,
                    };
                    v >= 0.999
                })
            })
            .unwrap_or(false);
        keep_mask.push(is_resolved);
    }

    let mask = BooleanChunked::from_slice(PlSmallStr::from("mask"), &keep_mask);
    let mut filtered = df.filter(&mask)?;

    let out_path = PathBuf::from("polymarket_markets_cleaned.parquet");
    let file = std::fs::File::create(&out_path)?;
    ParquetWriter::new(file).finish(&mut filtered)?;

    // Return list of tradable slugs
    let slug_col = filtered.column("slug")?.str()?;
    let slugs: Vec<String> = (0..filtered.height())
        .filter_map(|i| slug_col.get(i).map(|s| s.to_string()))
        .collect();

    Ok(slugs)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

fn parse_timestamp(ts: &str) -> String {
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S%.fZ") {
        return dt.format("%Y-%m-%d %H:%M:%S").to_string();
    }
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S") {
        return dt.format("%Y-%m-%d %H:%M:%S").to_string();
    }
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts) {
        return dt.naive_utc().format("%Y-%m-%d %H:%M:%S").to_string();
    }
    ts.to_string()
}
