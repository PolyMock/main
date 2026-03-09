"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";

interface UsernameModalProps {
  walletAddress: string;
  onComplete: (username: string) => void;
  onClose: () => void;
}

export default function UsernameModal({ walletAddress, onComplete, onClose }: UsernameModalProps) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) {
      setError("Username is required");
      return;
    }
    if (trimmed.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    if (trimmed.length > 20) {
      setError("Username must be under 20 characters");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(trimmed)) {
      setError("Only lowercase letters, numbers, and underscores");
      return;
    }

    setLoading(true);
    setError("");

    // Check if username is taken
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("username", trimmed)
      .maybeSingle();

    if (existing) {
      setError("Username is already taken");
      setLoading(false);
      return;
    }

    // Check if user row exists for this wallet
    const { data: userRow } = await supabase
      .from("users")
      .select("id")
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    if (userRow) {
      // Update existing row
      const { error: updateErr } = await supabase
        .from("users")
        .update({ username: trimmed })
        .eq("wallet_address", walletAddress);
      if (updateErr) {
        setError("Failed to save username");
        setLoading(false);
        return;
      }
    } else {
      // Insert new user
      const { error: insertErr } = await supabase
        .from("users")
        .insert({ wallet_address: walletAddress, username: trimmed });
      if (insertErr) {
        setError("Failed to save username");
        setLoading(false);
        return;
      }
    }

    onComplete(trimmed);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-sm rounded-2xl border border-gray-700 bg-[#141414]/95 backdrop-blur-xl p-6 shadow-2xl"
        >
          <h3 className="text-xl font-bold text-white mb-1">Choose a username</h3>
          <p className="text-gray-400 text-sm mb-5">
            Pick a username to interact with the community.
          </p>

          <div className="relative mb-3">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">@</span>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="username"
              maxLength={20}
              className="w-full pl-7 pr-4 py-3 rounded-xl text-sm bg-white/5 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/50 transition-colors"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs mb-3">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-400 border border-gray-700 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !username.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-orange-500 text-black hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Saving..." : "Continue"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
