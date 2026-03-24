//! Backtest HTTP server — axum-based, deployed to Fly.io.
//!
//! Endpoints:
//!   GET  /health          → 200 "ok"
//!   POST /backtest/run    → streams NDJSON (progress + final result)
//!
//! The final result includes fully-computed metrics, trades, and equity curve
//! so the frontend can display it directly with no post-processing.

use axum::{
    Router,
    routing::{get, post},
    extract::Json,
    response::{IntoResponse, Response},
    http::StatusCode,
};
use tokio_stream::wrappers::ReceiverStream;
use tower_http::cors::CorsLayer;

use backtest_engine_rs::engine::BacktestEngine;
use backtest_engine_rs::strategies;
use backtest_engine_rs::synthesis_loader;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Request / message types ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BacktestRequest {
    markets: Vec<serde_json::Value>,
    #[serde(alias = "strategy")]
    strategy_type: String,
    #[serde(default = "default_cash")]
    initial_cash: f64,
    #[serde(default)]
    reimburse_open_positions: bool,
    #[serde(default = "default_max_trades")]
    max_trades_per_market: usize,
    price_inf: Option<serde_json::Value>,
    price_sup: Option<serde_json::Value>,
    position: Option<serde_json::Value>,
    timestamp_start: Option<serde_json::Value>,
    timestamp_end: Option<serde_json::Value>,
    #[serde(default)]
    strategy_params: Option<serde_json::Value>,
    stop_loss: Option<f64>,
    take_profit: Option<f64>,
    trailing_stop: Option<f64>,
    max_hold_hours: Option<f64>,
    // Markets metadata for result computation
    #[serde(default)]
    strategy_code: Option<String>,
}

fn default_cash() -> f64 { 10000.0 }
fn default_max_trades() -> usize { 200000 }

#[derive(Serialize)]
struct NdjsonMsg {
    r#type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    progress: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl NdjsonMsg {
    fn progress(p: u32, msg: &str) -> Self {
        Self { r#type: "progress".into(), progress: Some(p), message: Some(msg.into()), data: None, error: None }
    }
    fn error(err: &str) -> Self {
        Self { r#type: "error".into(), progress: None, message: None, data: None, error: Some(err.into()) }
    }
    fn result(data: serde_json::Value) -> Self {
        Self { r#type: "result".into(), progress: None, message: None, data: Some(data), error: None }
    }
    fn to_line(&self) -> String {
        serde_json::to_string(self).unwrap_or_default() + "\n"
    }
}

// ── Value helpers (from backtest_api.rs) ─────────────────────────────────────

fn val_to_string(v: &serde_json::Value) -> Option<String> {
    match v {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Number(n) => Some(n.to_string()),
        serde_json::Value::Array(arr) => arr.first().and_then(val_to_string),
        _ => None,
    }
}

fn val_to_f64(v: &serde_json::Value) -> f64 {
    match v {
        serde_json::Value::Number(n) => n.as_f64().unwrap_or(0.0),
        serde_json::Value::String(s) => s.parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn val_to_string_vec(v: &serde_json::Value) -> Option<Vec<String>> {
    match v {
        serde_json::Value::Array(arr) => Some(arr.iter().filter_map(val_to_string).collect()),
        _ => None,
    }
}

fn parse_outcomes(outcomes: &Option<serde_json::Value>) -> (String, String) {
    match outcomes {
        Some(serde_json::Value::Array(arr)) => {
            let left = arr.first().and_then(|v| v.as_str()).unwrap_or("Yes").to_string();
            let right = arr.get(1).and_then(|v| v.as_str()).unwrap_or("No").to_string();
            (left, right)
        }
        Some(serde_json::Value::String(s)) => {
            if let Ok(arr) = serde_json::from_str::<Vec<String>>(s) {
                let left = arr.first().cloned().unwrap_or_else(|| "Yes".into());
                let right = arr.get(1).cloned().unwrap_or_else(|| "No".into());
                (left, right)
            } else {
                ("Yes".into(), "No".into())
            }
        }
        _ => ("Yes".into(), "No".into()),
    }
}

fn parse_timestamp(s: &str) -> Option<chrono::NaiveDateTime> {
    chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.fZ").ok()
        .or_else(|| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S").ok())
        .or_else(|| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").ok())
        .or_else(|| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok().and_then(|d| d.and_hms_opt(0, 0, 0)))
}

// ── buildBacktestResult port ────────────────────────────────────────────────

fn build_backtest_result(
    trade_log: &[backtest_engine_rs::engine::TradeLogEntry],
    settle_log: &[backtest_engine_rs::engine::SettleLogEntry],
    metrics: &backtest_engine_rs::engine::Metrics,
    initial_cash: f64,
    input_markets: &[serde_json::Value],
    market_count: usize,
    execution_time: u64,
) -> serde_json::Value {
    // 1. Market resolution info
    let mut market_outcome: HashMap<String, String> = HashMap::new();
    let mut market_end_date: HashMap<String, String> = HashMap::new();
    for m in input_markets {
        let id = m.get("conditionId").and_then(val_to_string).unwrap_or_default();
        if id.is_empty() { continue; }
        if let Some(ro) = m.get("resolvedOutcome").and_then(val_to_string) {
            market_outcome.insert(id.clone(), ro);
        }
        if let Some(ed) = m.get("endDate").and_then(val_to_string)
            .or_else(|| m.get("end_date_iso").and_then(val_to_string)) {
            market_end_date.insert(id, ed);
        }
    }

    // 2. Parse settle entries per key
    #[derive(Clone)]
    struct SettleEntry {
        amount: i64,
        exit_price: f64,
        exit_time: Option<String>,
        exit_reason: String,
    }
    let mut settles_by_key: HashMap<String, Vec<SettleEntry>> = HashMap::new();
    for s in settle_log {
        let key = format!("{}|{}", s.market_id, s.position);
        let exit_price = if let Some(ep) = s.exit_price {
            ep
        } else if let Some(refund) = s.refund {
            if s.amount > 0 { refund / s.amount as f64 } else { 0.0 }
        } else {
            let won = s.outcome.as_ref().map(|o| o == &s.position).unwrap_or(false);
            if won { 1.0 } else { 0.0 }
        };
        settles_by_key.entry(key).or_default().push(SettleEntry {
            amount: s.amount,
            exit_price,
            exit_time: s.timestamp.map(|ts| ts.format("%Y-%m-%dT%H:%M:%S").to_string()),
            exit_reason: s.exit_reason.clone().unwrap_or_else(|| "RESOLUTION".into()),
        });
    }

    let open_keys: std::collections::HashSet<String> = metrics.open_positions.keys()
        .map(|(mid, pos)| format!("{}|{}", mid, pos))
        .collect();

    // 3. FIFO share matching
    struct TradeWithMeta {
        idx: usize,
        market_id: String,
        position: String,
        amount: i64,
        cost: f64,
        time: Option<String>,
        remaining: i64,
    }
    let mut trades_by_key: HashMap<String, Vec<TradeWithMeta>> = HashMap::new();
    for (i, t) in trade_log.iter().enumerate() {
        let key = format!("{}|{}", t.market_id, t.position);
        trades_by_key.entry(key).or_default().push(TradeWithMeta {
            idx: i,
            market_id: t.market_id.clone(),
            position: t.position.clone(),
            amount: t.amount,
            cost: t.cost,
            time: t.time.map(|ts| ts.format("%Y-%m-%dT%H:%M:%S").to_string()),
            remaining: t.amount,
        });
    }

    #[derive(Clone)]
    struct TradeResult {
        exit_price: f64,
        exit_time: Option<String>,
        exit_reason: String,
        pnl: f64,
        status: String, // "OPEN" or "CLOSED"
        holding_duration: f64,
    }
    let mut results: Vec<Option<TradeResult>> = vec![None; trade_log.len()];

    for (key, key_trades) in trades_by_key.iter_mut() {
        let settles = settles_by_key.get(key).cloned().unwrap_or_default();
        let parts: Vec<&str> = key.splitn(2, '|').collect();
        let market_id = parts[0];
        let position = if parts.len() > 1 { parts[1] } else { "" };
        let is_open = open_keys.contains(key);
        let mut trade_ptr = 0;

        for settle in &settles {
            let mut settle_shares_left = settle.amount;
            while settle_shares_left > 0 && trade_ptr < key_trades.len() {
                let trade = &mut key_trades[trade_ptr];
                let shares_to_consume = trade.remaining.min(settle_shares_left);
                if shares_to_consume > 0 {
                    let entry_price = if trade.amount > 0 { trade.cost / trade.amount as f64 } else { 0.0 };
                    let pnl = (settle.exit_price - entry_price) * shares_to_consume as f64;
                    let holding_duration = match (&trade.time, &settle.exit_time) {
                        (Some(t), Some(e)) => {
                            let t_ms = chrono::NaiveDateTime::parse_from_str(t, "%Y-%m-%dT%H:%M:%S")
                                .map(|d| d.and_utc().timestamp_millis()).unwrap_or(0);
                            let e_ms = chrono::NaiveDateTime::parse_from_str(e, "%Y-%m-%dT%H:%M:%S")
                                .map(|d| d.and_utc().timestamp_millis()).unwrap_or(0);
                            ((e_ms - t_ms).abs() as f64) / (1000.0 * 60.0 * 60.0)
                        }
                        _ => 0.0,
                    };

                    if let Some(ref mut r) = results[trade.idx] {
                        r.pnl += pnl;
                        r.exit_price = settle.exit_price;
                        r.exit_time = settle.exit_time.clone();
                        r.exit_reason = settle.exit_reason.clone();
                    } else {
                        results[trade.idx] = Some(TradeResult {
                            exit_price: settle.exit_price,
                            exit_time: settle.exit_time.clone(),
                            exit_reason: settle.exit_reason.clone(),
                            pnl,
                            status: "CLOSED".into(),
                            holding_duration,
                        });
                    }
                    trade.remaining -= shares_to_consume;
                    settle_shares_left -= shares_to_consume;
                }
                if trade.remaining <= 0 { trade_ptr += 1; }
            }
        }

        // Remaining trades
        let resolved = market_outcome.get(market_id);
        let end_date = market_end_date.get(market_id);
        let won = resolved.map(|r| r.to_lowercase() == position.to_lowercase()).unwrap_or(false);
        let resolution_price = if won { 1.0 } else { 0.0 };

        for i in trade_ptr..key_trades.len() {
            let trade = &key_trades[i];
            if trade.remaining <= 0 { continue; }
            let entry_price = if trade.amount > 0 { trade.cost / trade.amount as f64 } else { 0.0 };

            if is_open {
                if results[trade.idx].is_none() {
                    results[trade.idx] = Some(TradeResult {
                        exit_price: 0.0, exit_time: None, exit_reason: String::new(),
                        pnl: 0.0, status: "OPEN".into(), holding_duration: 0.0,
                    });
                }
                if let Some(ref mut r) = results[trade.idx] {
                    r.status = "OPEN".into();
                }
            } else {
                let pnl = if resolved.is_some() { (resolution_price - entry_price) * trade.remaining as f64 } else { 0.0 };
                let holding_duration = match (&trade.time, end_date) {
                    (Some(t), Some(e)) => {
                        let t_ms = chrono::NaiveDateTime::parse_from_str(t, "%Y-%m-%dT%H:%M:%S")
                            .map(|d| d.and_utc().timestamp_millis()).unwrap_or(0);
                        let e_ms = chrono::NaiveDateTime::parse_from_str(e, "%Y-%m-%dT%H:%M:%SZ")
                            .or_else(|_| chrono::NaiveDateTime::parse_from_str(e, "%Y-%m-%dT%H:%M:%S%.fZ"))
                            .or_else(|_| chrono::NaiveDateTime::parse_from_str(e, "%Y-%m-%dT%H:%M:%S"))
                            .map(|d| d.and_utc().timestamp_millis()).unwrap_or(0);
                        ((e_ms - t_ms).abs() as f64) / (1000.0 * 60.0 * 60.0)
                    }
                    _ => 0.0,
                };

                if let Some(ref mut r) = results[trade.idx] {
                    r.pnl += pnl;
                } else {
                    results[trade.idx] = Some(TradeResult {
                        exit_price: if resolved.is_some() { resolution_price } else { entry_price },
                        exit_time: end_date.cloned(),
                        exit_reason: "RESOLUTION".into(),
                        pnl,
                        status: "CLOSED".into(),
                        holding_duration,
                    });
                }
            }
        }
    }

    // 4. Build final trades array
    let engine_pnl = metrics.total_pnl;
    let trades: Vec<serde_json::Value> = trade_log.iter().enumerate().map(|(i, t)| {
        let r = results[i].clone().unwrap_or(TradeResult {
            exit_price: 0.0, exit_time: None, exit_reason: String::new(),
            pnl: 0.0, status: "CLOSED".into(), holding_duration: 0.0,
        });
        let entry_price = if t.amount > 0 { t.cost / t.amount as f64 } else { 0.0 };
        let time_str = t.time.map(|ts| ts.format("%Y-%m-%dT%H:%M:%S").to_string())
            .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string());
        serde_json::json!({
            "id": format!("trade-{}", i),
            "marketId": t.market_id,
            "marketName": t.market_id,
            "conditionId": t.market_id,
            "entryTime": time_str,
            "exitTime": r.exit_time,
            "side": t.position,
            "entryPrice": entry_price,
            "exitPrice": r.exit_price,
            "shares": t.amount,
            "amountInvested": t.cost,
            "pnl": r.pnl,
            "pnlPercentage": if t.cost > 0.0 { (r.pnl / t.cost) * 100.0 } else { 0.0 },
            "fees": 0,
            "status": r.status,
            "entryReason": "PRICE_THRESHOLD",
            "exitReason": if r.exit_reason.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(r.exit_reason) },
            "holdingDuration": r.holding_duration,
            "capitalAllocation": if initial_cash > 0.0 { (t.cost / initial_cash) * 100.0 } else { 0.0 },
        })
    }).collect();

    // 5. Aggregate metrics
    let closed_trades: Vec<&serde_json::Value> = trades.iter()
        .filter(|t| t["status"] == "CLOSED")
        .collect();
    let wins: Vec<&serde_json::Value> = closed_trades.iter()
        .filter(|t| t["pnl"].as_f64().unwrap_or(0.0) > 0.0)
        .copied().collect();
    let losses: Vec<&serde_json::Value> = closed_trades.iter()
        .filter(|t| t["pnl"].as_f64().unwrap_or(0.0) <= 0.0)
        .copied().collect();

    let win_pnls: Vec<f64> = wins.iter().map(|t| t["pnl"].as_f64().unwrap_or(0.0)).collect();
    let loss_pnls: Vec<f64> = losses.iter().map(|t| t["pnl"].as_f64().unwrap_or(0.0)).collect();

    let avg_win = if !win_pnls.is_empty() { win_pnls.iter().sum::<f64>() / win_pnls.len() as f64 } else { 0.0 };
    let avg_loss = if !loss_pnls.is_empty() { loss_pnls.iter().sum::<f64>() / loss_pnls.len() as f64 } else { 0.0 };
    let best_trade = closed_trades.iter().map(|t| t["pnl"].as_f64().unwrap_or(0.0)).fold(f64::NEG_INFINITY, f64::max);
    let worst_trade = closed_trades.iter().map(|t| t["pnl"].as_f64().unwrap_or(0.0)).fold(f64::INFINITY, f64::min);
    let best_trade = if best_trade == f64::NEG_INFINITY { 0.0 } else { best_trade };
    let worst_trade = if worst_trade == f64::INFINITY { 0.0 } else { worst_trade };

    let total_win_pnl: f64 = win_pnls.iter().sum();
    let total_loss_pnl: f64 = loss_pnls.iter().sum::<f64>().abs();
    let profit_factor = if total_loss_pnl > 0.0 { total_win_pnl / total_loss_pnl } else if total_win_pnl > 0.0 { f64::INFINITY } else { 0.0 };
    // Cap infinity for JSON
    let profit_factor = if profit_factor.is_infinite() { 999999.0 } else { profit_factor };
    let expectancy = if !closed_trades.is_empty() { engine_pnl / closed_trades.len() as f64 } else { 0.0 };

    // Side performance
    let side_perf = |side: &str| -> serde_json::Value {
        let side_trades: Vec<&serde_json::Value> = closed_trades.iter()
            .filter(|t| t["side"].as_str().unwrap_or("").to_lowercase() == side)
            .copied().collect();
        let w: Vec<&serde_json::Value> = side_trades.iter().filter(|t| t["pnl"].as_f64().unwrap_or(0.0) > 0.0).copied().collect();
        let l: Vec<&serde_json::Value> = side_trades.iter().filter(|t| t["pnl"].as_f64().unwrap_or(0.0) <= 0.0).copied().collect();
        serde_json::json!({
            "count": side_trades.len(),
            "winRate": if !side_trades.is_empty() { (w.len() as f64 / side_trades.len() as f64) * 100.0 } else { 0.0 },
            "pnl": side_trades.iter().map(|t| t["pnl"].as_f64().unwrap_or(0.0)).sum::<f64>(),
            "avgWin": if !w.is_empty() { w.iter().map(|t| t["pnl"].as_f64().unwrap_or(0.0)).sum::<f64>() / w.len() as f64 } else { 0.0 },
            "avgLoss": if !l.is_empty() { l.iter().map(|t| t["pnl"].as_f64().unwrap_or(0.0)).sum::<f64>() / l.len() as f64 } else { 0.0 },
        })
    };

    // Streaks
    let (mut cur_wins, mut cur_losses, mut max_win_streak, mut max_loss_streak) = (0u32, 0u32, 0u32, 0u32);
    for t in &closed_trades {
        if t["pnl"].as_f64().unwrap_or(0.0) > 0.0 {
            cur_wins += 1; cur_losses = 0; max_win_streak = max_win_streak.max(cur_wins);
        } else {
            cur_losses += 1; cur_wins = 0; max_loss_streak = max_loss_streak.max(cur_losses);
        }
    }

    // Exit reason distribution
    let (mut res, mut sl, mut tp, mut mht, mut ts, mut pe) = (0u32, 0u32, 0u32, 0u32, 0u32, 0u32);
    for t in &trades {
        if t["status"] == "OPEN" { continue; }
        match t["exitReason"].as_str().unwrap_or("RESOLUTION") {
            "STOP_LOSS" => sl += 1,
            "TAKE_PROFIT" => tp += 1,
            "MAX_HOLD_TIME" => mht += 1,
            "TRAILING_STOP" => ts += 1,
            "REIMBURSED" => pe += 1,
            _ => res += 1,
        }
    }

    // 6. Equity curve from cash flow events
    struct CashEvent { time: i64, delta: f64 }
    let mut cash_events: Vec<CashEvent> = Vec::new();

    for t in trade_log {
        let time = t.time.map(|ts| ts.and_utc().timestamp_millis()).unwrap_or(0);
        cash_events.push(CashEvent { time, delta: -t.cost });
    }
    for s in settle_log {
        let payout = s.refund.unwrap_or_else(|| s.exit_price.map(|ep| s.amount as f64 * ep).unwrap_or(0.0));
        let time = s.timestamp.map(|ts| ts.and_utc().timestamp_millis()).unwrap_or(0);
        cash_events.push(CashEvent { time, delta: payout });
    }

    // Resolution inflows for positions not fully covered by settles
    let mut bought_shares: HashMap<String, i64> = HashMap::new();
    let mut settled_shares: HashMap<String, i64> = HashMap::new();
    for t in trade_log {
        let key = format!("{}|{}", t.market_id, t.position);
        *bought_shares.entry(key).or_default() += t.amount;
    }
    for s in settle_log {
        let key = format!("{}|{}", s.market_id, s.position);
        *settled_shares.entry(key).or_default() += s.amount;
    }
    for (key, bought) in &bought_shares {
        let settled = settled_shares.get(key).copied().unwrap_or(0);
        let remaining = bought - settled;
        if remaining <= 0 { continue; }
        if open_keys.contains(key) { continue; }
        let parts: Vec<&str> = key.splitn(2, '|').collect();
        let mid = parts[0];
        let pos = if parts.len() > 1 { parts[1] } else { "" };
        let resolved = market_outcome.get(mid);
        let end_date_str = market_end_date.get(mid);
        let won = resolved.map(|r| r.to_lowercase() == pos.to_lowercase()).unwrap_or(false);
        let payout = if won { remaining as f64 } else { 0.0 };
        let time = end_date_str
            .and_then(|s| parse_timestamp(s))
            .map(|dt| dt.and_utc().timestamp_millis())
            .unwrap_or(chrono::Utc::now().timestamp_millis());
        cash_events.push(CashEvent { time, delta: payout });
    }

    cash_events.sort_by_key(|e| e.time);

    let mut equity = initial_cash;
    let mut peak_equity = initial_cash;
    let mut max_drawdown: f64 = 0.0;
    let mut max_drawdown_pct: f64 = 0.0;
    let equity_curve: Vec<serde_json::Value> = cash_events.iter().map(|e| {
        equity += e.delta;
        peak_equity = peak_equity.max(equity);
        let dd = peak_equity - equity;
        let dd_pct = if peak_equity > 0.0 { (dd / peak_equity) * 100.0 } else { 0.0 };
        max_drawdown = max_drawdown.max(dd);
        max_drawdown_pct = max_drawdown_pct.max(dd_pct);
        let ts_str = chrono::DateTime::from_timestamp_millis(e.time)
            .map(|dt| dt.format("%Y-%m-%dT%H:%M:%SZ").to_string())
            .unwrap_or_default();
        serde_json::json!({
            "timestamp": ts_str,
            "equity": equity,
            "drawdown": dd,
            "drawdownPercentage": dd_pct,
        })
    }).collect();

    // Avg holding duration
    let durations: Vec<f64> = closed_trades.iter()
        .map(|t| t["holdingDuration"].as_f64().unwrap_or(0.0))
        .filter(|&d| d > 0.0)
        .collect();
    let avg_hold_time = if !durations.is_empty() { durations.iter().sum::<f64>() / durations.len() as f64 } else { 0.0 };

    let win_rate = if !closed_trades.is_empty() { (wins.len() as f64 / closed_trades.len() as f64) * 100.0 } else { 0.0 };
    let avg_cap = if !closed_trades.is_empty() {
        closed_trades.iter().map(|t| t["capitalAllocation"].as_f64().unwrap_or(0.0)).sum::<f64>() / closed_trades.len() as f64
    } else { 0.0 };

    let first_time = trade_log.first().and_then(|t| t.time).map(|ts| ts.format("%Y-%m-%dT%H:%M:%S").to_string())
        .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string());
    let last_time = trade_log.last().and_then(|t| t.time).map(|ts| ts.format("%Y-%m-%dT%H:%M:%S").to_string())
        .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string());

    serde_json::json!({
        "strategyConfig": {
            "entryType": "BOTH",
            "exitRules": { "resolveOnExpiry": true },
            "positionSizing": { "type": "FIXED", "fixedAmount": 10 },
            "startDate": first_time,
            "endDate": last_time,
            "initialBankroll": initial_cash,
        },
        "trades": trades,
        "metrics": {
            "totalTrades": metrics.trades_executed,
            "winningTrades": wins.len(),
            "losingTrades": losses.len(),
            "winRate": win_rate,
            "totalPnl": engine_pnl,
            "totalFees": 0,
            "netPnl": engine_pnl,
            "roi": metrics.roi_percent,
            "avgWin": avg_win,
            "avgLoss": avg_loss,
            "bestTrade": best_trade,
            "worstTrade": worst_trade,
            "yesPerformance": side_perf("yes"),
            "noPerformance": side_perf("no"),
            "exitReasonDistribution": {
                "resolution": res,
                "stopLoss": sl,
                "takeProfit": tp,
                "maxHoldTime": mht,
                "trailingStop": ts,
                "partialExits": pe,
            },
            "equityCurve": equity_curve,
            "maxDrawdown": max_drawdown,
            "maxDrawdownPercentage": max_drawdown_pct,
            "sharpeRatio": 0,
            "volatility": 0,
            "expectancy": expectancy,
            "profitFactor": profit_factor,
            "medianWin": 0,
            "medianLoss": 0,
            "avgHoldTime": avg_hold_time,
            "medianHoldTime": 0,
            "capitalUtilization": 0,
            "avgCapitalAllocation": avg_cap,
            "consecutiveWins": 0,
            "consecutiveLosses": 0,
            "longestWinStreak": max_win_streak,
            "longestLossStreak": max_loss_streak,
            "dailyPnl": [],
            "drawdownCurve": [],
            "capitalUtilizationOverTime": [],
        },
        "startingCapital": initial_cash,
        "endingCapital": metrics.final_cash,
        "marketsAnalyzed": market_count,
        "executionTime": execution_time,
    })
}

// ── Backtest execution (runs in blocking thread) ────────────────────────────

fn run_backtest_blocking(
    req: BacktestRequest,
    tx: tokio::sync::mpsc::Sender<String>,
) {
    let send = |msg: NdjsonMsg| {
        let _ = tx.blocking_send(msg.to_line());
    };

    if req.markets.is_empty() {
        send(NdjsonMsg::error("No markets provided"));
        return;
    }

    let strategy_name = &req.strategy_type;
    let strategy_fn = match strategies::get_strategy(strategy_name) {
        Some(f) => f,
        None => {
            send(NdjsonMsg::error(&format!("Unknown strategy: {}", strategy_name)));
            return;
        }
    };

    let api_key = std::env::var("SYNTHESIS_API_KEY").unwrap_or_default();
    if api_key.is_empty() {
        send(NdjsonMsg::error("SYNTHESIS_API_KEY not set"));
        return;
    }

    let tmp_dir = std::env::temp_dir().join(format!("backtest_{}", std::process::id()));
    let trades_dir = tmp_dir.join("polymarket/standardized_trades");
    let markets_dir = tmp_dir.join("polymarket/markets");
    if let Err(e) = std::fs::create_dir_all(&trades_dir) {
        send(NdjsonMsg::error(&format!("Failed to create temp dir: {}", e)));
        return;
    }
    let _ = std::fs::create_dir_all(&markets_dir);

    send(NdjsonMsg::progress(5, "Fetching trades from Synthesis..."));

    let market_count = req.markets.len().min(15);
    let mut synthesis_markets: Vec<synthesis_loader::SynthesisMarket> = Vec::new();

    for (i, m) in req.markets.iter().take(market_count).enumerate() {
        send(NdjsonMsg::progress(
            5 + ((i as u32 * 15) / market_count as u32),
            &format!("Fetching trades for market {}/{}...", i + 1, market_count),
        ));

        let condition_id = m.get("conditionId").and_then(val_to_string).unwrap_or_default();
        if condition_id.is_empty() { continue; }

        let outcomes_val = m.get("outcomes").cloned();
        let (left_outcome, right_outcome) = parse_outcomes(&outcomes_val);

        let clob_ids = m.get("clobTokenIds").and_then(val_to_string_vec);
        let left_token = m.get("leftTokenId").and_then(val_to_string)
            .or_else(|| clob_ids.as_ref().and_then(|ids| ids.first().cloned()));
        let right_token = m.get("rightTokenId").and_then(val_to_string)
            .or_else(|| clob_ids.as_ref().and_then(|ids| ids.get(1).cloned()));

        let resolved_outcome = m.get("resolvedOutcome").and_then(val_to_string);
        let (left_price, right_price, resolved) = match &resolved_outcome {
            Some(outcome) if outcome == &left_outcome => (Some("1".into()), Some("0".into()), Some(true)),
            Some(outcome) if outcome == &right_outcome => (Some("0".into()), Some("1".into()), Some(true)),
            Some(_) => (None, None, Some(true)),
            None => {
                let lp = m.get("leftPrice").and_then(val_to_string)
                    .or_else(|| m.get("left_price").and_then(val_to_string));
                let rp = m.get("rightPrice").and_then(val_to_string)
                    .or_else(|| m.get("right_price").and_then(val_to_string));
                let lp_f = lp.as_ref().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.5);
                let rp_f = rp.as_ref().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.5);
                if lp_f >= 0.85 { (Some("1".into()), Some("0".into()), Some(true)) }
                else if rp_f >= 0.85 { (Some("0".into()), Some("1".into()), Some(true)) }
                else { (lp, rp, None) }
            }
        };

        let synth_market = synthesis_loader::SynthesisMarket {
            condition_id: Some(condition_id.clone()),
            question: m.get("question").and_then(val_to_string),
            slug: m.get("slug").and_then(val_to_string),
            volume: m.get("volume").map(val_to_f64).unwrap_or(0.0),
            category: m.get("category").and_then(val_to_string),
            left_token_id: left_token,
            right_token_id: right_token,
            left_outcome: left_outcome.clone(),
            right_outcome: right_outcome.clone(),
            left_price,
            right_price,
            resolved,
            ends_at: m.get("endDate").and_then(val_to_string),
            image: None,
        };

        match synthesis_loader::fetch_trades_for_market(&api_key, &condition_id, req.max_trades_per_market) {
            Ok(trades) => {
                if !trades.is_empty() {
                    match synthesis_loader::transform_trades(&trades, &synth_market) {
                        Ok(mut df) => {
                            if df.height() > 0 {
                                let safe_name: String = synth_market.slug.as_deref()
                                    .unwrap_or(&condition_id[..std::cmp::min(16, condition_id.len())])
                                    .replace('/', "_").replace(' ', "_")
                                    .chars().take(80).collect();
                                let out_path = trades_dir.join(format!("{}_std.parquet", safe_name));
                                let file = std::fs::File::create(&out_path).unwrap();
                                polars::prelude::ParquetWriter::new(file).finish(&mut df).unwrap();
                            }
                        }
                        Err(e) => eprintln!("  Transform error for {}: {}", condition_id, e),
                    }
                }
            }
            Err(e) => eprintln!("  Fetch error for {}: {}", condition_id, e),
        }

        synthesis_markets.push(synth_market);
    }

    if let Err(e) = synthesis_loader::save_market_metadata(&synthesis_markets, &markets_dir) {
        send(NdjsonMsg::error(&format!("Failed to save market metadata: {}", e)));
        cleanup(&tmp_dir);
        return;
    }

    send(NdjsonMsg::progress(20, "Trades loaded. Running backtest engine..."));

    let ts_start = req.timestamp_start.as_ref().and_then(val_to_string).and_then(|s| parse_timestamp(&s));
    let ts_end = req.timestamp_end.as_ref().and_then(val_to_string).and_then(|s| parse_timestamp(&s));
    let price_inf = req.price_inf.as_ref().map(val_to_f64);
    let price_sup = req.price_sup.as_ref().map(val_to_f64);
    let position_filter = req.position.as_ref().and_then(|v| {
        if v.is_null() { return None; }
        if let Some(arr) = v.as_array() {
            return Some(arr.iter().filter_map(|x| x.as_str().map(String::from)).collect());
        }
        let p = val_to_string(v)?;
        if p == "Both" { Some(vec!["Yes".into(), "No".into()]) }
        else { Some(p.split(',').map(|s| s.trim().to_string()).collect()) }
    });

    let mut engine = BacktestEngine::new(
        req.initial_cash, None, req.reimburse_open_positions,
        Some(vec!["polymarket".into()]),
        ts_start, ts_end,
        None, None, None, None, None,
        position_filter,
        None, price_inf, price_sup,
        None, None, None, None,
        tmp_dir.to_string_lossy().to_string(),
    );

    engine.stop_loss = req.stop_loss;
    engine.take_profit = req.take_profit;
    engine.trailing_stop = req.trailing_stop;
    engine.max_hold_hours = req.max_hold_hours;

    let start_time = std::time::Instant::now();
    let strategy_params = req.strategy_params.unwrap_or_else(|| serde_json::json!({}));

    match engine.run_with_params(strategy_fn, strategy_params) {
        Ok(engine_metrics) => {
            let execution_time = start_time.elapsed().as_millis() as u64;
            send(NdjsonMsg::progress(95, "Finalizing results..."));

            let result = build_backtest_result(
                &engine.trade_log,
                &engine.settle_log,
                &engine_metrics,
                req.initial_cash,
                &req.markets,
                market_count,
                execution_time,
            );

            send(NdjsonMsg::result(result));
        }
        Err(e) => {
            send(NdjsonMsg::error(&format!("Backtest engine error: {}", e)));
        }
    }

    cleanup(&tmp_dir);
}

fn cleanup(tmp_dir: &std::path::Path) {
    if let Err(e) = std::fs::remove_dir_all(tmp_dir) {
        eprintln!("Warning: cleanup failed {:?}: {}", tmp_dir, e);
    }
}

// ── HTTP handlers ───────────────────────────────────────────────────────────

async fn health() -> &'static str {
    "ok"
}

async fn run_backtest(Json(req): Json<BacktestRequest>) -> Response {
    let (tx, rx) = tokio::sync::mpsc::channel::<String>(64);

    tokio::task::spawn_blocking(move || {
        run_backtest_blocking(req, tx);
    });

    let stream = ReceiverStream::new(rx);
    let body = axum::body::Body::from_stream(
        tokio_stream::StreamExt::map(stream, |line| Ok::<_, std::convert::Infallible>(line))
    );

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/x-ndjson")
        .header("Transfer-Encoding", "chunked")
        .header("Cache-Control", "no-cache")
        .body(body)
        .unwrap()
        .into_response()
}

// ── Main ────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".into());
    let addr = format!("0.0.0.0:{}", port);

    let cors = CorsLayer::permissive();

    let app = Router::new()
        .route("/health", get(health))
        .route("/backtest/run", post(run_backtest))
        .layer(cors);

    eprintln!("Backtest server listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
