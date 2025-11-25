import axios from 'axios';

const POLYMARKET_API_BASE = 'https://gamma-api.polymarket.com';

export interface PolyMarket {
  id: string;
  question: string;
  description?: string;
  end_date_iso: string;
  game_start_time?: string;
  seconds_delay?: number;
  fpmm?: string;
  maker_base_fee?: number;
  maker_quote_fee?: number;
  minimum_order_size?: number;
  minimum_tick_size?: number;
  neg_risk?: boolean;
  neg_risk_market_id?: string;
  neg_risk_request_id?: string;
  question_id?: string;
  rewards?: any;
  tags?: string[];
  volume?: number;
  volume_24hr?: number;
  liquidity?: number;
  liquidity_24hr_change?: number;
  last_trade_price?: number;
  best_bid?: number;
  best_ask?: number;
  spread?: number;
  closed?: boolean;
  market_slug?: string;
  title?: string;
  image?: string;
  icon?: string;
  active?: boolean;
  accepting_orders?: boolean;
  minimum_tick?: number;
  enable_order_book?: boolean;
  order_price_min_tick_size?: number;
  order_price_max_tick_size?: number;
  tokens?: Array<{
    token_id?: string;
    outcome?: string;
    price?: number;
    winner?: boolean;
  }>;
  // Helper function to get Yes/No prices
  yesPrice?: number;
  noPrice?: number;
  outcomePrices?: string[];
  volume_num?: number;
  clobTokenIds?: string[];
  conditionId?: string;
  questionId?: string;
  enableOrderBook?: boolean;
  orderPriceMinTickSize?: number;
  orderPriceMaxTickSize?: number;
  funded?: boolean;
  archived?: boolean;
  resolvedBy?: string;
  restricted?: boolean;
  groupItemTitle?: string;
  groupItemThreshold?: number;
  umaBond?: number;
  umaReward?: number;
  commentCount?: number;
  new?: boolean;
  featuredPriority?: number;
  startDate?: string;
  endDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export class PolymarketClient {
  private baseURL: string;

  constructor() {
    // Use local API route instead of direct API call to avoid CORS
    this.baseURL = '/api';
  }

  async fetchMarkets(limit: number = 10): Promise<PolyMarket[]> {
    try {
      const response = await axios.get(`${this.baseURL}/markets`, {
        params: {
          limit,
          active: true,
          closed: false
        }
      });

      if (response.data && Array.isArray(response.data)) {
        const markets = response.data.slice(0, limit);
        // Process each market to extract Yes/No prices
        return markets.map(market => this.processMarketTokens(market));
      }
      return [];
    } catch (error) {
      console.error('Error fetching Polymarket markets:', error);
      return [];
    }
  }

  private processMarketTokens(market: PolyMarket): PolyMarket {
    // Extract Yes/No prices from tokens or outcomePrices
    if (market.tokens && market.tokens.length >= 2) {
      // Look for Yes/No tokens
      const yesToken = market.tokens.find(token => 
        token.outcome?.toLowerCase().includes('yes') || 
        token.outcome?.toLowerCase() === 'true' ||
        token.outcome === '1'
      );
      const noToken = market.tokens.find(token => 
        token.outcome?.toLowerCase().includes('no') || 
        token.outcome?.toLowerCase() === 'false' ||
        token.outcome === '0'
      );

      market.yesPrice = yesToken?.price || 0;
      market.noPrice = noToken?.price || 0;
    } else if (market.outcomePrices && market.outcomePrices.length >= 2) {
      // Parse from outcomePrices array
      market.yesPrice = parseFloat(market.outcomePrices[0]) || 0;
      market.noPrice = parseFloat(market.outcomePrices[1]) || 0;
    } else {
      // Fallback - assume binary market with complementary prices
      const price = market.last_trade_price || 0.5;
      market.yesPrice = price;
      market.noPrice = 1 - price;
    }

    return market;
  }

  async getMarketById(marketId: string): Promise<PolyMarket | null> {
    try {
      const response = await axios.get(`${this.baseURL}/markets/${marketId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching market by ID:', error);
      return null;
    }
  }

  async getMarketPrice(marketId: string): Promise<number | null> {
    try {
      const market = await this.getMarketById(marketId);
      return market?.last_trade_price || null;
    } catch (error) {
      console.error('Error fetching market price:', error);
      return null;
    }
  }

  formatMarketData(market: PolyMarket): {
    id: string;
    title: string;
    description: string;
    price: number;
    volume24h: number;
    endDate: Date;
    category: string;
  } {
    return {
      id: market.id,
      title: market.question || market.title || 'Unknown Market',
      description: market.description || '',
      price: market.last_trade_price || 0,
      volume24h: market.volume_24hr || 0,
      endDate: new Date(market.end_date_iso),
      category: market.tags?.[0] || 'General'
    };
  }
}

export const polymarketClient = new PolymarketClient();