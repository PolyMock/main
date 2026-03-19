//! Quick backtest using Synthesis API data — equivalent of test_synthesis_backtest.py
//!
//! Uses the mean reversion strategy on data fetched by synthesis_loader.
//!
//! Usage:
//!   cargo run --bin test_synthesis_backtest

use backtest_engine_rs::engine::{BacktestEngine, Trade, TradeLogEntry, Portfolio, Action};

/// Buy when price is very low (< 5 cents), hold otherwise.
fn simple_mean_reversion(
    trade: &Trade,
    _trade_log: &[TradeLogEntry],
    _portfolio: &Portfolio,
    _user_perso_parameters: &serde_json::Value,
) -> Action {
    let threshold_low = 0.05;
    let market_id = trade.market_id.as_deref().unwrap_or("").to_string();

    if trade.price.unwrap_or(f64::MAX) <= threshold_low {
        Action {
            market_id,
            position: trade.position.clone().unwrap_or_else(|| "hold".to_string()),
            amount: 10,
            user_perso_parameters: None,
        }
    } else {
        Action {
            market_id,
            position: "hold".to_string(),
            amount: 0,
            user_perso_parameters: None,
        }
    }
}

fn main() {
    // Data path: relative to where the binary runs (inside backtest_engine_rs/)
    let data_path = std::env::current_dir()
        .unwrap()
        .join("data")
        .to_string_lossy()
        .to_string();

    // Check data exists
    let trade_pattern = format!("{}/polymarket/standardized_trades/*.parquet", data_path);
    let trade_files: Vec<_> = glob::glob(&trade_pattern)
        .unwrap()
        .filter_map(|e| e.ok())
        .collect();

    let market_pattern = format!("{}/polymarket/markets/*.parquet", data_path);
    let market_files: Vec<_> = glob::glob(&market_pattern)
        .unwrap()
        .filter_map(|e| e.ok())
        .collect();

    println!("Trade files found: {}", trade_files.len());
    println!("Market files found: {}", market_files.len());

    if trade_files.is_empty() {
        eprintln!("No trade data found. Run synthesis_loader first.");
        std::process::exit(1);
    }

    // Initialize engine
    let mut engine = BacktestEngine::new(
        10000.0,
        None,
        true, // reimburse_open_positions
        Some(vec!["polymarket".to_string()]),
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        data_path,
    );

    // Run backtest
    println!("\nRunning backtest...");
    match engine.run(simple_mean_reversion) {
        Ok(metrics) => {
            println!("\n=== BACKTEST RESULTS ===");
            println!("Trades executed : {}", metrics.trades_executed);
            println!("Initial cash    : ${:.2}", metrics.initial_cash);
            println!("Final cash      : ${:.2}", metrics.final_cash);
            println!("Total PnL       : ${:.2}", metrics.total_pnl);
            println!("ROI             : {:.2}%", metrics.roi_percent);
            println!("Open positions  : {}", metrics.open_positions.len());
        }
        Err(e) => {
            eprintln!("Backtest failed: {}", e);
            std::process::exit(1);
        }
    }
}
