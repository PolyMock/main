"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface TickerItem {
  symbol: string;
  displayName: string;
  price: string;
  change: string;
  up: boolean;
  type: string;
  logo: string;
}

const fallbackItems: TickerItem[] = [
  { symbol: "BTC/USD", displayName: "BTC", price: "$64,078", change: "-0.85%", up: false, type: "crypto", logo: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png" },
  { symbol: "ETH/USD", displayName: "ETH", price: "$3,821", change: "+1.87%", up: true, type: "crypto", logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" },
  { symbol: "EUR/USD", displayName: "EUR/USD", price: "$1.0842", change: "+0.15%", up: true, type: "forex", logo: "https://flagcdn.com/24x18/eu.png" },
  { symbol: "GBP/USD", displayName: "GBP/USD", price: "$1.2731", change: "-0.08%", up: false, type: "forex", logo: "https://flagcdn.com/24x18/gb.png" },
  { symbol: "AAPL", displayName: "AAPL", price: "$198.23", change: "-0.42%", up: false, type: "stock", logo: "/images/logo/apple.png" },
  { symbol: "TSLA", displayName: "TSLA", price: "$342.10", change: "+1.23%", up: true, type: "stock", logo: "/images/logo/telsa.jpg" },
  { symbol: "XAU/USD", displayName: "GOLD", price: "$2,342", change: "+0.67%", up: true, type: "commodity", logo: "" },
  { symbol: "XAG/USD", displayName: "SILVER", price: "$27.85", change: "-0.34%", up: false, type: "commodity", logo: "" },
];

export default function Ticker() {
  const [items, setItems] = useState<TickerItem[]>(fallbackItems);

  useEffect(() => {
    const fetchTicker = async () => {
      try {
        const res = await fetch("/api/ticker");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setItems(data);
          }
        }
      } catch {
        // Keep fallback data
      }
    };

    fetchTicker();
    const interval = setInterval(fetchTicker, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      className="relative z-40 bg-orange-500/10 backdrop-blur-md border-b border-orange-400/20 overflow-hidden mt-32"
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 1.2, ease: "easeOut" }}
    >
      <div className="flex animate-ticker w-max">
        {[...items, ...items, ...items].map((item, index) => (
          <div
            key={index}
            className="flex items-center gap-3 px-6 py-2.5 whitespace-nowrap"
          >
            {item.logo ? (
              <img src={item.logo} alt={item.displayName} className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <span className="text-orange-500">●</span>
            )}
            <span className="font-bold text-white text-sm">{item.displayName}</span>
            <span className="text-white text-sm">{item.price}</span>
            <span
              className={`text-sm ${
                item.up ? "text-green-400" : "text-red-400"
              }`}
            >
              {item.up ? "↗" : "↘"} {item.change}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
