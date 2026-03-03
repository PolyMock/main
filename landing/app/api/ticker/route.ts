import { NextResponse } from "next/server";

const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY || "";

// 8 symbols max (free tier limit per minute)
const SYMBOLS = [
  // Crypto
  { symbol: "BTC/USD", type: "crypto" },
  { symbol: "ETH/USD", type: "crypto" },
  // Forex
  { symbol: "EUR/USD", type: "forex" },
  { symbol: "GBP/USD", type: "forex" },
  // Stocks
  { symbol: "AAPL", type: "stock" },
  { symbol: "TSLA", type: "stock" },
  // Commodities
  { symbol: "XAU/USD", type: "commodity" },
  { symbol: "XAG/USD", type: "commodity" },
];

const DISPLAY_NAMES: Record<string, string> = {
  "BTC/USD": "BTC",
  "ETH/USD": "ETH",
  "EUR/USD": "EUR/USD",
  "GBP/USD": "GBP/USD",
  "AAPL": "AAPL",
  "TSLA": "TSLA",
  "XAU/USD": "GOLD",
  "XAG/USD": "SILVER",
};

const LOGOS: Record<string, string> = {
  "BTC/USD": "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
  "ETH/USD": "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
  "EUR/USD": "https://flagcdn.com/24x18/eu.png",
  "GBP/USD": "https://flagcdn.com/24x18/gb.png",
  "AAPL": "/images/logo/apple.png",
  "TSLA": "/images/logo/telsa.jpg",
  "XAU/USD": "",
  "XAG/USD": "",
};

let cachedData: TickerItem[] | null = null;
let lastFetch = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface TickerItem {
  symbol: string;
  displayName: string;
  price: string;
  change: string;
  up: boolean;
  type: string;
  logo: string;
}

export async function GET() {
  const now = Date.now();

  if (cachedData && now - lastFetch < CACHE_DURATION) {
    return NextResponse.json(cachedData);
  }

  if (!TWELVE_DATA_API_KEY) {
    return NextResponse.json(
      { error: "TWELVE_DATA_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const symbolList = SYMBOLS.map((s) => s.symbol).join(",");
    const response = await fetch(
      `https://api.twelvedata.com/quote?symbol=${symbolList}&apikey=${TWELVE_DATA_API_KEY}`
    );
    const data = await response.json();

    const tickerItems: TickerItem[] = [];

    for (const item of SYMBOLS) {
      const quote = data[item.symbol] || data;
      if (quote && quote.close) {
        const price = parseFloat(quote.close);
        const change = parseFloat(quote.percent_change || "0");

        tickerItems.push({
          symbol: item.symbol,
          displayName: DISPLAY_NAMES[item.symbol] || item.symbol,
          price: price >= 1000
            ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : price >= 1
            ? `$${price.toFixed(2)}`
            : `$${price.toFixed(4)}`,
          change: `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`,
          up: change >= 0,
          type: item.type,
          logo: LOGOS[item.symbol] || "",
        });
      }
    }

    if (tickerItems.length > 0) {
      cachedData = tickerItems;
      lastFetch = now;
    }

    return NextResponse.json(tickerItems);
  } catch (error) {
    console.error("Ticker API error:", error);
    if (cachedData) {
      return NextResponse.json(cachedData);
    }
    return NextResponse.json(
      { error: "Failed to fetch ticker data" },
      { status: 500 }
    );
  }
}
