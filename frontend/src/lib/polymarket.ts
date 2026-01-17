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
   * Fetches events from Polymarket (replaces fetchMarkets for better organization)
   * Each event contains one or more markets
   * @param limit - Maximum number of events to fetch
   * @param fetchPrices - Whether to fetch real-time prices (default: false for performance)
   * @param offset - Offset for pagination (default: 0)
   * @returns Array of PolyEvent objects with nested markets
   */
  async fetchEvents(limit: number = 10, fetchPrices: boolean = false, offset: number = 0): Promise<PolyEvent[]> {
    try {
      const response = await axios.get(`${this.baseURL}/events`, {
        params: {
          limit: limit * 2, // Fetch more to filter
          offset,
          active: true,
          closed: false
        }
      });

      if (response.data && Array.isArray(response.data)) {
        // Filter events that have markets with enableOrderBook = true
        const tradableEvents = response.data.filter((event: PolyEvent) => {
          // Keep events that have at least one tradable market
          return event.markets && event.markets.some(market => market.enableOrderBook || market.enable_order_book);
        }).slice(0, limit);

        // Only enrich with prices if requested (for performance)
        if (fetchPrices) {
          for (const event of tradableEvents) {
            for (const market of event.markets) {
              // Process market tokens
              this.processMarketTokens(market);
              // Fetch real-time prices
              await this.enrichMarketWithCLOBPrices(market);
            }
          }
        } else {
          // Just process the basic market tokens from outcomePrices
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
   * Legacy method - now fetches markets via events for better organization
   * @deprecated Use fetchEvents() instead for better event grouping
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

        // Process each market to extract Yes/No prices
        const processedMarkets = binaryMarkets.map(market => this.processMarketTokens(market));

        // Fetch real-time prices from CLOB API for each market
        await Promise.all(processedMarkets.map(market => this.enrichMarketWithCLOBPrices(market)));

        
        const balancedMarkets = processedMarkets
          .map(market => {
         
            const yesPrice = market.yesPrice || 0;
            const noPrice = market.noPrice || 0;

            // If prices are invalid, give worst balance score
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

  /**
   * Enriches a single event's markets with real-time CLOB prices
   * @param event - The event to enrich with prices
   */
  async enrichEventWithPrices(event: PolyEvent): Promise<void> {
    if (!event.markets || event.markets.length === 0) return;

    for (const market of event.markets) {
      await this.enrichMarketWithCLOBPrices(market);
    }
  }

  /**
   * Finds the event slug for a given market ID
   * @param marketId - The market ID to search for
   * @returns The event slug, or null if not found
   */
  async getEventSlugForMarket(marketId: string): Promise<string | null> {
    try {
      // Search through both active and closed events
      const searchConfigs = [
        { active: true, closed: false },   // Active events
        { active: false, closed: true },   // Closed events
        { active: true, closed: true }     // All events
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
            // Check if any of the event's markets match the marketId
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
   * Searches for events across all categories (active, closed, archived)
   * Used for comprehensive search functionality
   * @param limit - Maximum number of events per category
   * @returns Array of all matching events
   */
  async searchAllEvents(limit: number = 200): Promise<PolyEvent[]> {
    try {
      // Fetch from multiple configurations in parallel
      const fetchConfigs = [
        { active: true, closed: false },   // Active/Open markets
        { active: false, closed: true },   // Closed markets
        { active: true, closed: true },    // All markets
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

      // Combine all results and remove duplicates by ID
      const allEventsMap = new Map<string, PolyEvent>();

      results.forEach(response => {
        if (response.data && Array.isArray(response.data)) {
          response.data.forEach((event: PolyEvent) => {
            if (!allEventsMap.has(event.id)) {
              // Process market tokens for each event
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
   * Fetches the current price for a position based on market ID and prediction type
   * For closed markets, returns the settlement price (0 or 1)
   * For open markets, fetches real-time price from CLOB API
   * @param marketId - The market ID
   * @param predictionType - 'Yes' or 'No'
   * @returns The current price, or null if unavailable
   */
  async getPositionCurrentPrice(marketId: string, predictionType: 'Yes' | 'No'): Promise<number | null> {
    try {
      // First, get market details to check if closed and get token IDs
      const market = await this.getMarketById(marketId);

      if (!market) {
        console.error(`Market ${marketId} not found`);
        return null;
      }

      // If market is closed, check settlement prices from outcomePrices
      if (market.closed && market.outcomePrices) {
        try {
          const prices = typeof market.outcomePrices === 'string'
            ? JSON.parse(market.outcomePrices)
            : market.outcomePrices;

          if (Array.isArray(prices) && prices.length >= 2) {
            // For binary markets, indices map to: [Yes/First Outcome, No/Second Outcome]
            // predictionType 'Yes' = index 0, 'No' = index 1
            const priceIndex = predictionType === 'Yes' ? 0 : 1;
            const settledPrice = parseFloat(prices[priceIndex]);

            return settledPrice;
          }
        } catch (error) {
          console.error(`Error parsing outcomePrices for closed market ${marketId}:`, error);
        }
      }

      // Fallback: Check tokens array for winner info (legacy format)
      if (market.closed && market.tokens) {
        const relevantToken = market.tokens.find(token =>
          token.outcome?.toLowerCase() === predictionType.toLowerCase()
        );

        if (relevantToken && relevantToken.winner !== undefined) {
          return relevantToken.winner ? 1 : 0;
        }
      }

      // For open markets or closed markets without settlement, fetch real-time price
      if (!market.clobTokenIds || market.clobTokenIds.length < 2) {
        console.warn(`Market ${marketId} has no clobTokenIds`);
        return null;
      }

      const tokenIds = typeof market.clobTokenIds === 'string'
        ? JSON.parse(market.clobTokenIds)
        : market.clobTokenIds;

      if (!Array.isArray(tokenIds) || tokenIds.length < 2) {
        return null;
      }

      // Token IDs are ordered: [Yes/First Outcome, No/Second Outcome]
      const tokenId = predictionType === 'Yes' ? tokenIds[0] : tokenIds[1];

      return await this.fetchCLOBPrice(tokenId);
    } catch (error) {
      console.error(`Error fetching position price for market ${marketId}:`, error);
      return null;
    }
  }
}

export const polymarketClient = new PolymarketClient();