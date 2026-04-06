import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const [{ data: trades, error: tradeErr }, { data: strategies, error: stratErr }, { data: users, error: usersErr }] =
    await Promise.all([
      supabaseAdmin
        .from("trades")
        .select(
          "id, user_id, source, position_type, entry_price, exit_price, amount, pnl, market_id, market_title, pair_index, analysis, is_published, likes_count, comments_count, created_at, take_profit_price, stop_loss_price, status, platform, users(username, avatar_url)"
        )
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("backtest_strategies")
        .select(
          "id, user_id, strategy_name, strategy_type, description, total_return_percent, initial_capital, final_capital, win_rate, sharpe_ratio, max_drawdown, total_trades, winning_trades, losing_trades, profit_factor, equity_curve, is_published, likes_count, comments_count, created_at, entry_type, stop_loss, take_profit, position_sizing_type, position_sizing_value, platform, avg_hold_time, markets_analyzed, execution_time, backtest_data, users(username, avatar_url)"
        )
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("users")
        .select("id, username, wallet_address, avatar_url, banner_url")
        .order("username"),
    ]);

  if (tradeErr) console.error("Trade fetch error:", tradeErr);
  if (stratErr) console.error("Strategy fetch error:", stratErr);
  if (usersErr) console.error("Users fetch error:", usersErr);

  return NextResponse.json({ trades: trades ?? [], strategies: strategies ?? [], users: users ?? [] });
}
