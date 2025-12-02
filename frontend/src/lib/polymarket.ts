import axios from 'axios';

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
  // Helper function to get Yes/No prices (for binary markets)
  yesPrice?: number;
  noPrice?: number;
  // For multi-outcome markets
  outcomes?: Array<{
    name: string;
    price: number;
    tokenId: string;
  }>;
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
          limit: limit * 3, // Fetch more to filter for binary markets
          active: true,
          closed: false
        }
      });

      if (response.data && Array.isArray(response.data)) {
        // Filter for ONLY binary markets (2 outcomes)
        const binaryMarkets = response.data.filter(market => {
          try {
            const outcomes = market.outcomes
              ? (typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes)
              : [];
            return Array.isArray(outcomes) && outcomes.length === 2;
          } catch {
            return false;
          }
        }).slice(0, limit);

        // Process each market to extract Yes/No prices
        const processedMarkets = binaryMarkets.map(market => this.processMarketTokens(market));

        // Fetch real-time prices from CLOB API for each market
        await Promise.all(processedMarkets.map(market => this.enrichMarketWithCLOBPrices(market)));

        return processedMarkets;
      }
      return [];
    } catch (error) {
      console.error('Error fetching Polymarket markets:', error);
      return [];
    }
  }

  private processMarketTokens(market: PolyMarket): PolyMarket {
    try {
      // Binary market only - set yes/no prices
      if (market.outcomePrices) {
        const prices = typeof market.outcomePrices === 'string'
          ? JSON.parse(market.outcomePrices)
          : market.outcomePrices;
        market.yesPrice = parseFloat(prices[0]) || 0;
        market.noPrice = parseFloat(prices[1]) || 0;
      } else {
        // Fallback
        market.yesPrice = 0;
        market.noPrice = 0;
      }
    } catch (error) {
      console.error(`Error processing market ${market.id}:`, error);
      market.yesPrice = 0;
      market.noPrice = 0;
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
      endDate: new Date(market.endDate || market.end_date_iso || ''),
      category: market.tags?.[0] || 'General'
    };
  }

  /**
   * Fetches real-time prices from CLOB API using token IDs
   * Updates the market object with yesPrice and noPrice
   */
  private async enrichMarketWithCLOBPrices(market: PolyMarket): Promise<void> {
    // Check if market has clobTokenIds
    if (!market.clobTokenIds || market.clobTokenIds.length < 2) {
      console.log(`Market ${market.id} has no clobTokenIds, skipping price fetch`);
      return;
    }

    try {
      // Parse clobTokenIds if it's a string (JSON array)
      const tokenIds = typeof market.clobTokenIds === 'string'
        ? JSON.parse(market.clobTokenIds)
        : market.clobTokenIds;

      if (!Array.isArray(tokenIds) || tokenIds.length < 2) {
        return;
      }

      // Binary market - fetch YES/NO prices
      const yesTokenId = tokenIds[0];
      const noTokenId = tokenIds[1];

      const [yesPriceResult, noPriceResult] = await Promise.allSettled([
        this.fetchCLOBPrice(yesTokenId),
        this.fetchCLOBPrice(noTokenId)
      ]);

      let yes = yesPriceResult.status === 'fulfilled' && yesPriceResult.value !== null ? yesPriceResult.value : 0;
      let no = noPriceResult.status === 'fulfilled' && noPriceResult.value !== null ? noPriceResult.value : 0;

      // Calculate inverse when one price is 0
      if (yes > 0 && no === 0) {
        no = 1 - yes;
      } else if (no > 0 && yes === 0) {
        yes = 1 - no;
      } else if (yes === 0 && no === 0) {
        // Both are 0, keep as is (will use fallback values)
        return;
      }

      market.yesPrice = yes;
      market.noPrice = no;

      console.log(`Binary market ${market.id}: YES=${market.yesPrice}, NO=${market.noPrice}`);
    } catch (error) {
      console.error(`Error enriching market ${market.id} with CLOB prices:`, error);
    }
  }

  /**
   * Fetches price from CLOB API for a specific token
   * @param tokenId - The token ID to fetch price for
   * @returns The price as a number, or null if unavailable
   */
  private async fetchCLOBPrice(tokenId: string): Promise<number | null> {
    try {
      const response = await axios.get('https://clob.polymarket.com/price', {
        params: {
          token_id: tokenId,
          side: 'buy'
        },
        timeout: 5000 // 5 second timeout
      });

      if (response.data && response.data.price) {
        return parseFloat(response.data.price);
      }

      return null;
    } catch (error: any) {
      // Don't log errors for markets without orderbooks (common for inactive markets)
      if (error.response?.data?.error?.includes('No orderbook')) {
        return null;
      }
      console.error(`Error fetching CLOB price for token ${tokenId}:`, error.message);
      return null;
    }
  }
}

export const polymarketClient = new PolymarketClient();