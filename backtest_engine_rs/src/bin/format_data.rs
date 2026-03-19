//! Data formatting CLI — equivalent of formating_data.py
//!
//! Transforms raw Kalshi/Polymarket trade parquet files into standardized format.
//!
//! Usage:
//!   cargo run --bin format_data -- [OPTIONS]

use backtest_engine_rs::formatting;
use clap::Parser;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "format_data")]
#[command(about = "Transform raw trade data into standardized format")]
struct Args {
    /// Data path for raw parquet files
    #[arg(long, default_value = "/Volumes/Extreme SSD/prediction-market-data/data")]
    data_path: String,

    /// Path to polymarket_events_categories_2.parquet
    #[arg(long, default_value = "polymarket_events_categories_2.parquet")]
    categories_parquet: PathBuf,
}

fn main() {
    let args = Args::parse();

    // Step 1: Add categories to polymarket markets
    println!("Adding categories to polymarket markets...");
    if let Err(e) = formatting::polymarket_add_categories(&args.data_path, &args.categories_parquet) {
        eprintln!("Error adding categories: {}", e);
        // Don't exit — try to continue with what we have
    }

    // Step 2: Clean markets — keep only resolved
    println!("Cleaning markets (keeping resolved only)...");
    let tradable_markets = match formatting::polymarket_clean_markets() {
        Ok(markets) => {
            println!("Found {} tradable markets", markets.len());
            markets
        }
        Err(e) => {
            eprintln!("Error cleaning markets: {}", e);
            Vec::new()
        }
    };

    // Step 3: Transform Kalshi trades
    let kalshi_pattern = format!("{}/kalshi/trades/*.parquet", args.data_path);
    let kalshi_files: Vec<PathBuf> = glob::glob(&kalshi_pattern)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|p| !p.file_name().unwrap_or_default().to_string_lossy().starts_with("._"))
        .collect();
    let kalshi_total = kalshi_files.len();

    for (i, file) in kalshi_files.iter().enumerate() {
        if let Err(e) = formatting::transform_kalshi_trade(file, &args.data_path, i + 1, kalshi_total) {
            eprintln!("Error transforming Kalshi file {:?}: {}", file, e);
        }
        break; // Match Python behavior: only process first file
    }

    // Step 4: Transform Polymarket trades
    let poly_pattern = format!("{}/polymarket/trades/*.parquet", args.data_path);
    let poly_files: Vec<PathBuf> = glob::glob(&poly_pattern)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|p| !p.file_name().unwrap_or_default().to_string_lossy().starts_with("._"))
        .collect();
    let poly_total = poly_files.len();

    for (i, file) in poly_files.iter().enumerate() {
        if let Err(e) = formatting::transform_polymarket_trade(
            file, &args.data_path, &tradable_markets, i + 1, poly_total,
        ) {
            eprintln!("Error transforming Polymarket file {:?}: {}", file, e);
        }
        break; // Match Python behavior: only process first file
    }

    println!("Done!");
}
