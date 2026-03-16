import axios from 'axios';

export interface PolyEvent {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  ticker?: string;
  image?: string;
  icon?: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  new?: boolean;
  featured?: boolean;
  restricted?: boolean;
  liquidity?: number;
  volume?: number;
  openInterest?: number;
  commentCount?: number;
  startDate?: string;
  endDate?: string;
  createdAt?: string;
  updatedAt?: string;
  resolutionSource?: string;
  // Nested markets array - this is the key structure
  markets: PolyMarket[];
  // Optional grouping data
  series?: any;
  categories?: string[];
  tags?: string[];
  collections?: any[];
}

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
    this.baseURL = '/api';
  }

  /**
   * Fetches events from Polymarket via Synthesis API
   * Each event contains one or more markets
   */
  async fetchEvents(limit: number = 10, fetchPrices: boolean = false, offset: number = 0): Promise<PolyEvent[]> {
    try {
      const response = await axios.get(`${this.baseURL}/events`, {
        params: {
          limit: limit * 2,
          offset,
          active: true,
          closed: false
        }
      });

      if (response.data && Array.isArray(response.data)) {
        // Filter events that have markets with enableOrderBook = true
        const tradableEvents = response.data.filter((event: PolyEvent) => {
          return event.markets && event.markets.some(market => market.enableOrderBook || market.enable_order_book);
        }).slice(0, limit);

        // Only enrich with prices if requested
        if (fetchPrices) {
          for (const event of tradableEvents) {
            for (const market of event.markets) {
              this.processMarketTokens(market);
              await this.enrichMarketWithPrices(market);
            }
          }
        } else {
          for (const event of tradableEvents) {
            for (const market of event.markets) {
              this.processMarketTokens(market);
            }
          }
        }

        return tradableEvents;
      }
      return [];
    } catch (error) {
      console.error('Error fetching Polymarket events:', error);
      return [];
    }
  }

  /**
   * Legacy method - fetches markets via internal API route
   */
  async fetchMarkets(limit: number = 10): Promise<PolyMarket[]> {
    try {
      const response = await axios.get(`${this.baseURL}/markets`, {
        params: {
          limit: limit * 3,
          active: true,
          closed: false
        }
      });

      if (response.data && Array.isArray(response.data)) {
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

        const processedMarkets = binaryMarkets.map(market => this.processMarketTokens(market));

        // Enrich with real-time prices
        await Promise.all(processedMarkets.map(market => this.enrichMarketWithPrices(market)));

        const balancedMarkets = processedMarkets
          .map(market => {
            const yesPrice = market.yesPrice || 0;
            const noPrice = market.noPrice || 0;
            if (yesPrice === 0 || noPrice === 0) {
              return { market, balance: 1 };
            }
            const yesDistance = Math.abs(yesPrice - 0.5);
            const noDistance = Math.abs(noPrice - 0.5);
            const balance = (yesDistance + noDistance) / 2;
            return { market, balance };
          })
          .sort((a, b) => a.balance - b.balance)
          .slice(0, limit)
          .map(item => item.market);

        return balancedMarkets;
      }
      return [];
    } catch (error) {
      console.error('Error fetching Polymarket markets:', error);
      return [];
    }
  }

  private processMarketTokens(market: PolyMarket): PolyMarket {
    try {
      if (market.outcomePrices) {
        const prices = typeof market.outcomePrices === 'string'
          ? JSON.parse(market.outcomePrices)
          : market.outcomePrices;
        market.yesPrice = parseFloat(prices[0]) || 0;
        market.noPrice = parseFloat(prices[1]) || 0;
      } else {
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
   * Enriches market with prices - prices already come from the API response
   * via outcomePrices, so this just ensures they're set via processMarketTokens
   */
  private async enrichMarketWithPrices(market: PolyMarket): Promise<void> {
    // Prices are already included in the Synthesis API response (left_price/right_price)
    // mapped to outcomePrices by our server-side routes. Just process them.
    this.processMarketTokens(market);
  }

  /**
   * Enriches a single event's markets with real-time prices
   */
  async enrichEventWithPrices(event: PolyEvent): Promise<void> {
    if (!event.markets || event.markets.length === 0) return;

    for (const market of event.markets) {
      await this.enrichMarketWithPrices(market);
    }
  }

  /**
   * Finds the event slug for a given market ID
   */
  async getEventSlugForMarket(marketId: string): Promise<string | null> {
    try {
      const searchConfigs = [
        { active: true, closed: false },
        { active: false, closed: true },
        { active: true, closed: true }
      ];

      for (const config of searchConfigs) {
        const response = await axios.get(`${this.baseURL}/events`, {
          params: {
            limit: 100,
            offset: 0,
            active: config.active,
            closed: config.closed
          }
        });

        if (response.data && Array.isArray(response.data)) {
          for (const event of response.data) {
            if (event.markets && Array.isArray(event.markets)) {
              const hasMarket = event.markets.some((market: PolyMarket) => market.id === marketId);
              if (hasMarket) {
                return event.slug;
              }
            }
          }
        }
      }

      console.warn(`Market ${marketId} not found in any events`);
      return null;
    } catch (error) {
      console.error('Error finding event for market:', error);
      return null;
    }
  }

  /**
   * Searches for events across all categories
   */
  async searchAllEvents(limit: number = 200): Promise<PolyEvent[]> {
    try {
      const fetchConfigs = [
        { active: true, closed: false },
        { active: false, closed: true },
        { active: true, closed: true },
      ];

      const fetchPromises = fetchConfigs.map(config =>
        axios.get(`${this.baseURL}/events`, {
          params: {
            limit,
            offset: 0,
            active: config.active,
            closed: config.closed
          }
        }).catch(err => {
          console.error('Error fetching events with config:', config, err);
          return { data: [] };
        })
      );

      const results = await Promise.all(fetchPromises);

      const allEventsMap = new Map<string, PolyEvent>();

      results.forEach(response => {
        if (response.data && Array.isArray(response.data)) {
          response.data.forEach((event: PolyEvent) => {
            if (!allEventsMap.has(event.id)) {
              if (event.markets) {
                event.markets.forEach(market => this.processMarketTokens(market));
              }
              allEventsMap.set(event.id, event);
            }
          });
        }
      });

      return Array.from(allEventsMap.values());
    } catch (error) {
      console.error('Error searching all events:', error);
      return [];
    }
  }

  /**
   * Fetches the current price for a position
   */
  async getPositionCurrentPrice(marketId: string, predictionType: 'Yes' | 'No'): Promise<number | null> {
    try {
      const market = await this.getMarketById(marketId);

      if (!market) {
        console.error(`Market ${marketId} not found`);
        return null;
      }

      // If market is closed, check settlement prices
      if (market.closed && market.outcomePrices) {
        try {
          const prices = typeof market.outcomePrices === 'string'
            ? JSON.parse(market.outcomePrices)
            : market.outcomePrices;

          if (Array.isArray(prices) && prices.length >= 2) {
            const priceIndex = predictionType === 'Yes' ? 0 : 1;
            const settledPrice = parseFloat(prices[priceIndex]);
            return settledPrice;
          }
        } catch (error) {
          console.error(`Error parsing outcomePrices for closed market ${marketId}:`, error);
        }
      }

      // Fallback: Check tokens array for winner info
      if (market.closed && market.tokens) {
        const relevantToken = market.tokens.find(token =>
          token.outcome?.toLowerCase() === predictionType.toLowerCase()
        );

        if (relevantToken && relevantToken.winner !== undefined) {
          return relevantToken.winner ? 1 : 0;
        }
      }

      // For open markets, use prices from market data (already fetched from Synthesis)
      this.processMarketTokens(market);
      if (predictionType === 'Yes') {
        return market.yesPrice ?? null;
      } else {
        return market.noPrice ?? null;
      }
    } catch (error) {
      console.error(`Error fetching position price for market ${marketId}:`, error);
      return null;
    }
  }
}

export const polymarketClient = new PolymarketClient();
