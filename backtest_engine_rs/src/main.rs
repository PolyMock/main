//! Run a backtest with a selected strategy — equivalent of run_backtest.py
//!
//! Usage:
//!   cargo run --bin backtest_engine -- [OPTIONS]
//!
//! Examples:
//!   cargo run --bin backtest_engine -- --strategy mean_reversion --price-sup 0.1
//!   cargo run --bin backtest_engine -- --strategy mean_reversion_with_portfolio_cash --initial-cash 50000

use backtest_engine_rs::engine::BacktestEngine;
use backtest_engine_rs::strategies;
use clap::Parser;

#[derive(Parser, Debug)]
#[command(name = "backtest_engine")]
#[command(about = "Run a backtest on prediction market data")]
struct Args {
    /// Strategy to use
    #[arg(long, default_value = "mean_reversion")]
    strategy: String,

    /// Initial cash
    #[arg(long, default_value_t = 10000.0)]
    initial_cash: f64,

    /// Platforms (comma-separated: kalshi,polymarket)
    #[arg(long, default_value = "kalshi,polymarket")]
    platforms: String,

    /// Reimburse open positions at end
    #[arg(long, default_value_t = true)]
    reimburse: bool,

    /// Minimum price filter
    #[arg(long)]
    price_inf: Option<f64>,

    /// Maximum price filter
    #[arg(long)]
    price_sup: Option<f64>,

    /// Minimum amount filter
    #[arg(long)]
    amount_inf: Option<f64>,

    /// Maximum amount filter
    #[arg(long)]
    amount_sup: Option<f64>,

    /// Minimum volume filter
    #[arg(long)]
    volume_inf: Option<f64>,

    /// Maximum volume filter
    #[arg(long)]
    volume_sup: Option<f64>,

    /// Position filter (comma-separated: Yes,No)
    #[arg(long)]
    position: Option<String>,

    /// Market IDs (comma-separated)
    #[arg(long)]
    market_id: Option<String>,

    /// Timestamp start (YYYY-MM-DD HH:MM:SS)
    #[arg(long)]
    timestamp_start: Option<String>,

    /// Timestamp end (YYYY-MM-DD HH:MM:SS)
    #[arg(long)]
    timestamp_end: Option<String>,

    /// Data path for parquet files
    #[arg(long, default_value = "/Volumes/Extreme SSD/prediction-market-data/data")]
    data_path: String,

    /// List available strategies
    #[arg(long)]
    list_strategies: bool,
}

fn main() {
    let args = Args::parse();

    if args.list_strategies {
        println!("Available strategies:");
        for name in strategies::list_strategies() {
            println!("  - {}", name);
        }
        return;
    }

    let strategy_fn = match strategies::get_strategy(&args.strategy) {
        Some(f) => f,
        None => {
            eprintln!("Unknown strategy: {}", args.strategy);
            eprintln!("Use --list-strategies to see available strategies.");
            std::process::exit(1);
        }
    };

    let platforms: Vec<String> = args.platforms.split(',').map(|s| s.trim().to_string()).collect();
    let position = args.position.map(|p| p.split(',').map(|s| s.trim().to_string()).collect());
    let market_id = args.market_id.map(|p| p.split(',').map(|s| s.trim().to_string()).collect());

    let ts_start = args.timestamp_start.and_then(|s| {
        chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S").ok()
    });
    let ts_end = args.timestamp_end.and_then(|s| {
        chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S").ok()
    });

    let mut engine = BacktestEngine::new(
        args.initial_cash,
        None, // strat_var: use all columns
        args.reimburse,
        Some(platforms),
        ts_start,
        ts_end,
        market_id,
        None, // market_title
        args.volume_inf,
        args.volume_sup,
        None, // market_category
        position,
        None, // possible_outcomes
        args.price_inf,
        args.price_sup,
        args.amount_inf,
        args.amount_sup,
        None, // wallet_maker
        None, // wallet_taker
        args.data_path,
    );

    println!("Running backtest with strategy: {}", args.strategy);
    match engine.run(strategy_fn) {
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
