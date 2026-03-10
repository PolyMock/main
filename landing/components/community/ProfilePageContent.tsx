"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";

interface UserData {
  id: string;
  username: string;
  wallet_address: string;
  avatar_url: string | null;
  banner_url: string | null;
}

interface TradeItem {
  id: string;
  type: "trade" | "strategy";
  title: string;
  pnl: number;
  pnlPercent: number;
  direction: string;
  timestamp: string;
  platform: string;
  status?: string;
  likes: number;
  comments: number;
}

export default function ProfilePageContent({ address }: { address: string }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [trades, setTrades] = useState<TradeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [copied, setCopied] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const connectedWallet = localStorage.getItem("hf_connected_wallet");
      setIsOwner(connectedWallet === address);
    } catch {
      setIsOwner(false);
    }
  }, [address]);

  useEffect(() => {
    async function fetchProfile() {
      setLoading(true);

      const { data: userData } = await supabase
        .from("users")
        .select("id, username, wallet_address, avatar_url, banner_url")
        .eq("wallet_address", address)
        .maybeSingle();

      if (userData) {
        setUser(userData);

        const { data: userTrades } = await supabase
          .from("trades")
          .select("id, market_title, pair_index, position_type, pnl, entry_price, exit_price, created_at, platform, source, status, likes_count, comments_count")
          .eq("user_id", userData.id)
          .eq("is_published", true)
          .order("created_at", { ascending: false });

        const { data: userStrats } = await supabase
          .from("backtest_strategies")
          .select("id, strategy_name, total_return_percent, initial_capital, final_capital, created_at, platform, likes_count, comments_count")
          .eq("user_id", userData.id)
          .eq("is_published", true)
          .order("created_at", { ascending: false });

        const PAIR_SYMBOLS: Record<number, string> = {
          0: "SOL/USDT", 1: "BTC/USDT", 2: "ETH/USDT", 3: "AVAX/USDT", 4: "LINK/USDT",
        };

        const items: TradeItem[] = [];

        for (const t of userTrades || []) {
          const isBlockberg = t.source === "blockberg";
          const symbol = isBlockberg && t.pair_index != null
            ? PAIR_SYMBOLS[t.pair_index] || "UNKNOWN"
            : t.market_title || "Market";
          const entry = Number(t.entry_price) || 0;
          const exit = t.exit_price != null ? Number(t.exit_price) : null;
          const pnl = Number(t.pnl) || 0;
          const pnlPct = entry > 0 && exit != null ? ((exit - entry) / entry) * 100 : 0;

          items.push({
            id: t.id, type: "trade", title: symbol, pnl, pnlPercent: pnlPct,
            direction: (t.position_type || "long").toLowerCase(),
            timestamp: t.created_at, platform: t.platform || t.source || "polymock",
            status: t.status, likes: t.likes_count || 0, comments: t.comments_count || 0,
          });
        }

        for (const s of userStrats || []) {
          const roi = Number(s.total_return_percent) || 0;
          items.push({
            id: s.id, type: "strategy", title: s.strategy_name || "Strategy",
            pnl: (Number(s.final_capital) || 0) - (Number(s.initial_capital) || 0),
            pnlPercent: roi, direction: roi >= 0 ? "long" : "short",
            timestamp: s.created_at,
            platform: Array.isArray(s.platform) ? s.platform.join(", ") : s.platform || "polymock",
            likes: s.likes_count || 0, comments: s.comments_count || 0,
          });
        }

        setTrades(items);
      }

      setLoading(false);
    }
    fetchProfile();
  }, [address]);

  const handleImageUpload = async (
    file: File,
    bucket: "avatar" | "banner",
    field: "avatar_url" | "banner_url",
    setUploading: (v: boolean) => void,
  ) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const filePath = `${user.wallet_address}.${ext}`;

      const { data: existing } = await supabase.storage.from(bucket).list("", { search: user.wallet_address });
      if (existing && existing.length > 0) {
        await supabase.storage.from(bucket).remove(existing.map((f: any) => f.name));
      }

      const { error: uploadErr } = await supabase.storage.from(bucket).upload(filePath, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
      const url = urlData.publicUrl + "?t=" + Date.now();

      await supabase.from("users").update({ [field]: url }).eq("wallet_address", user.wallet_address);
      setUser({ ...user, [field]: url });
    } catch (err: any) {
      console.error(`${bucket} upload error:`, err);
      alert(`Failed to upload ${bucket}`);
    } finally {
      setUploading(false);
    }
  };

  const router = useRouter();
  const shortAddr = address.slice(0, 6) + "..." + address.slice(-4);
  const totalTrades = trades.filter((t) => t.type === "trade").length;
  const totalStrats = trades.filter((t) => t.type === "strategy").length;
  const wins = trades.filter((t) => t.pnl > 0).length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  const avgPnl = trades.length > 0 ? trades.reduce((a, t) => a + t.pnlPercent, 0) / trades.length : 0;

  if (loading) {
    return (
      <div className="min-h-screen pt-28 pb-20 px-6 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen pt-28 pb-20 px-6 text-center">
        <p className="text-gray-400 text-lg mt-20">User not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-28 pb-20 px-4 md:px-6">
      <div className="max-w-4xl mx-auto mb-4">
        <button
          onClick={() => router.push("/community")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-orange-500/50 bg-orange-500/10 hover:bg-orange-500/20 hover:border-orange-500/70 text-orange-300 hover:text-orange-200 transition-all text-sm font-semibold backdrop-blur-md shadow-lg shadow-orange-500/10"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Community Hub
        </button>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-4xl mx-auto rounded-2xl border border-orange-500/40 bg-[#0a0a0a] overflow-x-hidden overflow-y-auto max-h-[calc(100vh-10rem)] shadow-2xl shadow-orange-500/10 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
      >
        {/* ── Banner ── */}
        <div
          className={`relative h-44 md:h-56 overflow-hidden ${isOwner ? "cursor-pointer" : ""} group`}
          onClick={() => isOwner && bannerInputRef.current?.click()}
        >
          {user.banner_url ? (
            <img src={user.banner_url} alt="Banner" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-orange-600/25 via-purple-600/20 to-gray-900/80" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />

          {isOwner && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 px-4 py-2 rounded-xl bg-black/60 border border-gray-600 backdrop-blur-sm">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth={1.5} fill="none" />
                </svg>
                <span className="text-white text-xs font-medium">
                  {uploadingBanner ? "Uploading..." : user.banner_url ? "Change Banner" : "Add Banner"}
                </span>
              </div>
            </div>
          )}

          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageUpload(file, "banner", "banner_url", setUploadingBanner);
              e.target.value = "";
            }}
            className="hidden"
          />
        </div>

        {/* ── Avatar + Name ── */}
        <div className="relative px-6 md:px-8 -mt-16 pb-6">
          <div className="flex items-end gap-5">
            {/* Avatar */}
            <div
              className={`relative shrink-0 ${isOwner ? "cursor-pointer" : ""} group/avatar`}
              onClick={() => isOwner && avatarInputRef.current?.click()}
            >
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.username}
                  className="w-28 h-28 md:w-32 md:h-32 rounded-full object-cover border-4 border-[#0a0a0a] ring-2 ring-gray-700"
                />
              ) : (
                <div className="w-28 h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-orange-500/30 to-orange-600/10 border-4 border-[#0a0a0a] ring-2 ring-orange-500/30 flex items-center justify-center">
                  <span className="text-orange-400 text-4xl font-bold">{user.username[0]?.toUpperCase()}</span>
                </div>
              )}

              {isOwner && (
                <div className="absolute inset-0 rounded-full bg-black/0 group-hover/avatar:bg-black/50 transition-all duration-200 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white opacity-0 group-hover/avatar:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                    <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth={1.5} fill="none" />
                  </svg>
                </div>
              )}

              {uploadingAvatar && (
                <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, "avatar", "avatar_url", setUploadingAvatar);
                  e.target.value = "";
                }}
                className="hidden"
              />
            </div>

            {/* Name + address */}
            <div className="pb-1 min-w-0">
              <h1 className="text-white text-2xl md:text-3xl font-bold truncate">@{user.username}</h1>
              <p
                className="text-gray-500 text-sm font-mono mt-0.5 cursor-pointer hover:text-orange-400 transition-colors"
                title="Click to copy address"
                onClick={() => {
                  navigator.clipboard.writeText(address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "Copied!" : shortAddr}
              </p>
            </div>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="px-6 md:px-8 pb-6">
          <div className="grid grid-cols-5 rounded-xl border border-gray-800 bg-white/[0.02] overflow-hidden">
            {[
              { label: "Posts", value: String(trades.length), color: "text-white" },
              { label: "Trades", value: String(totalTrades), color: "text-cyan-400" },
              { label: "Strategies", value: String(totalStrats), color: "text-pink-400" },
              { label: "Win Rate", value: `${winRate.toFixed(0)}%`, color: "text-white" },
              { label: "Avg P&L", value: `${avgPnl >= 0 ? "+" : ""}${avgPnl.toFixed(1)}%`, color: avgPnl >= 0 ? "text-green-400" : "text-red-400" },
            ].map((stat, i) => (
              <div key={stat.label} className={`py-4 text-center ${i > 0 ? "border-l border-gray-800" : ""}`}>
                <p className={`text-lg md:text-xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-gray-500 text-[10px] md:text-xs uppercase tracking-wider mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Activity ── */}
        <div className="px-6 md:px-8 pb-8">
          <div className="flex items-center gap-4 mb-5">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Activity</span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
          </div>

          {trades.length > 0 ? (
            <div className="space-y-2.5">
              {trades.map((trade) => {
                const isPositive = trade.pnl >= 0;
                const isTrade = trade.type === "trade";
                const ts = new Date(trade.timestamp);
                const dateStr = ts.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

                return (
                  <div
                    key={`${trade.type}-${trade.id}`}
                    className="rounded-xl p-4 border border-gray-800/60 bg-white/[0.02] hover:bg-white/[0.04] transition-colors flex items-center gap-4"
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      isTrade ? "bg-cyan-500/10 border border-cyan-500/20" : "bg-pink-500/10 border border-pink-500/20"
                    }`}>
                      {isTrade ? (
                        <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white text-sm font-semibold truncate">{trade.title}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase ${
                          isTrade ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" : "bg-pink-500/10 text-pink-400 border-pink-500/20"
                        }`}>
                          {isTrade ? "Trade" : "Strategy"}
                        </span>
                        {isTrade && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase ${
                            trade.direction === "long" || trade.direction === "yes"
                              ? "bg-green-500/10 text-green-400 border-green-500/20"
                              : "bg-red-500/10 text-red-400 border-red-500/20"
                          }`}>
                            {trade.direction}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-gray-500 text-xs">{dateStr}</span>
                        <span className="text-gray-600 text-xs">{trade.platform}</span>
                        <span className="text-gray-600 text-xs flex items-center gap-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                          {trade.likes}
                        </span>
                        <span className="text-gray-600 text-xs flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          {trade.comments}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className={`text-lg font-bold ${isPositive ? "text-green-400" : "text-red-400"}`}>
                        {isPositive ? "+" : ""}{trade.pnlPercent.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="text-gray-500 text-lg">No published trades or strategies yet.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
