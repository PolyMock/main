"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import UsernameModal from "./UsernameModal";

export interface ConnectedUser {
  userId: string;
  username: string;
  avatarUrl: string | null;
  walletAddress: string;
}

interface WalletButtonProps {
  onUserChange: (user: ConnectedUser | null) => void;
}

export default function WalletButton({ onUserChange }: WalletButtonProps) {
  const { publicKey, connected, select, disconnect, wallets, connecting } = useWallet();
  const [showWalletList, setShowWalletList] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [user, setUser] = useState<ConnectedUser | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const walletListRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const lastLookedUp = useRef<string | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
      if (walletListRef.current && !walletListRef.current.contains(e.target as Node)) {
        setShowWalletList(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Lookup user in Supabase
  const lookupUser = useCallback(async (walletAddress: string) => {
    if (lastLookedUp.current === walletAddress && user) return;
    lastLookedUp.current = walletAddress;
    setLookingUp(true);

    const { data } = await supabase
      .from("users")
      .select("id, username, avatar_url")
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    if (data?.username) {
      const connectedUser: ConnectedUser = {
        userId: data.id,
        username: data.username,
        avatarUrl: data.avatar_url || null,
        walletAddress,
      };
      setUser(connectedUser);
      onUserChange(connectedUser);
    } else {
      setShowUsernameModal(true);
    }
    setLookingUp(false);
  }, [onUserChange, user]);

  // When wallet connects or publicKey changes, look up user
  useEffect(() => {
    if (connected && publicKey) {
      lookupUser(publicKey.toBase58());
    } else if (!connected) {
      setUser(null);
      onUserChange(null);
      lastLookedUp.current = null;
    }
  }, [connected, publicKey?.toBase58()]);

  const handleUsernameComplete = async (username: string) => {
    setShowUsernameModal(false);
    if (!publicKey) return;

    const walletAddress = publicKey.toBase58();
    const { data } = await supabase
      .from("users")
      .select("id, username, avatar_url")
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    if (data) {
      const connectedUser: ConnectedUser = {
        userId: data.id,
        username: data.username,
        avatarUrl: data.avatar_url || null,
        walletAddress,
      };
      setUser(connectedUser);
      onUserChange(connectedUser);
    }
  };

  const handleUsernameModalClose = () => {
    setShowUsernameModal(false);
    disconnect();
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be under 2MB");
      return;
    }

    setUploadingAvatar(true);
    try {
      const walletAddress = user.walletAddress;
      const ext = file.name.split(".").pop() || "png";
      const filePath = `${walletAddress}.${ext}`;

      // Delete existing avatars for this wallet
      const { data: existing } = await supabase.storage.from("avatar").list("", { search: walletAddress });
      if (existing && existing.length > 0) {
        await supabase.storage.from("avatar").remove(existing.map((f: any) => f.name));
      }

      const { error: uploadErr } = await supabase.storage.from("avatar").upload(filePath, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("avatar").getPublicUrl(filePath);
      const avatarUrl = urlData.publicUrl + "?t=" + Date.now();

      await supabase.from("users").update({ avatar_url: avatarUrl }).eq("wallet_address", walletAddress);

      const updated = { ...user, avatarUrl };
      setUser(updated);
      onUserChange(updated);
    } catch (err: any) {
      console.error("Avatar upload error:", err);
      alert("Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    setUser(null);
    onUserChange(null);
    lastLookedUp.current = null;
    setShowDropdown(false);
  };

  const handleConnectClick = () => {
    const installed = wallets.filter((w) => w.readyState === "Installed");
    if (installed.length === 0) {
      // No wallet extensions — show list anyway (will show "not installed")
      setShowWalletList(true);
    } else if (installed.length === 1) {
      select(installed[0].adapter.name);
    } else {
      setShowWalletList(true);
    }
  };

  const handleSelectWallet = (walletName: any) => {
    select(walletName);
    setShowWalletList(false);
  };

  // Connected state — show avatar + username
  if (connected && user) {
    const shortAddr = user.walletAddress.slice(0, 4) + "..." + user.walletAddress.slice(-4);

    return (
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setShowDropdown((d) => !d)}
          className="flex items-center gap-3 px-5 py-3 rounded-2xl border border-gray-700 bg-white/5 hover:border-orange-500/40 transition-all backdrop-blur-md"
        >
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.username}
              className="w-9 h-9 rounded-full object-cover border border-gray-600"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400 text-sm font-bold">
              {user.username[0].toUpperCase()}
            </div>
          )}
          <span className="text-white text-base font-semibold">@{user.username}</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${showDropdown ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <AnimatePresence>
          {showDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 mt-2 min-w-[200px] rounded-xl border border-gray-700 bg-[#141414]/95 backdrop-blur-xl shadow-2xl shadow-black/50 z-50 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-gray-800">
                <p className="text-white text-sm font-medium">@{user.username}</p>
                <p className="text-gray-500 text-xs">{shortAddr}</p>
              </div>
              <button
                onClick={() => { avatarInputRef.current?.click(); setShowDropdown(false); }}
                className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-white/5 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth={1.5} fill="none" />
                </svg>
                {uploadingAvatar ? "Uploading..." : user.avatarUrl ? "Change Avatar" : "Set Avatar"}
              </button>
              <button
                onClick={handleDisconnect}
                className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-white/5 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Disconnect Wallet
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Loading state
  if (connecting || lookingUp) {
    return (
      <div className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-gray-700 bg-white/5 backdrop-blur-md">
        <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-gray-400 text-sm">Connecting...</span>
      </div>
    );
  }

  // Disconnected state — show connect button
  return (
    <>
      <div ref={walletListRef} className="relative">
        <button
          onClick={handleConnectClick}
          className="flex items-center gap-2.5 px-5 py-3 rounded-2xl text-base font-semibold border border-orange-500/40 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 hover:border-orange-500/60 transition-all backdrop-blur-md"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Connect Wallet to Comment
        </button>

        <AnimatePresence>
          {showWalletList && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute left-1/2 -translate-x-1/2 mt-2 min-w-[220px] rounded-xl border border-gray-700 bg-[#141414]/95 backdrop-blur-xl shadow-2xl shadow-black/50 z-50 overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-gray-800">
                <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Select Wallet</p>
              </div>
              {wallets.filter(w => w.readyState === "Installed").map((w) => (
                <button
                  key={w.adapter.name}
                  onClick={() => handleSelectWallet(w.adapter.name)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-white hover:bg-white/5 transition-colors"
                >
                  {w.adapter.icon && (
                    <img src={w.adapter.icon} alt={w.adapter.name} className="w-5 h-5" />
                  )}
                  <span>{w.adapter.name}</span>
                </button>
              ))}
              {wallets.filter(w => w.readyState === "Installed").length === 0 && (
                <div className="px-4 py-3 text-gray-500 text-sm">No wallets detected</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showUsernameModal && publicKey && (
        <UsernameModal
          walletAddress={publicKey.toBase58()}
          onComplete={handleUsernameComplete}
          onClose={handleUsernameModalClose}
        />
      )}
    </>
  );
}
