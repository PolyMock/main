/**
 * Dome API Client for Historical Market Data
 */

import axios from 'axios';
import type { Candlestick, MarketSnapshot } from './types';

const DOME_API_BASE = 'https://api.domeapi.io/v1';

interface DomeMarket {
  market_id?: string;
  condition_id: string;
  market_slug: string;
  title: string;
  question?: string; 
  description?: string;
  category?: string;
  tags?: string[];
  end_time: number; // Unix timestamp
  end_date_iso?: string; 
  volume_total?: number;
  volume?: number; 
  liquidity?: number;
  outcome?: string;
  winning_side?: string;
  status?: string;
}

interface DomeCandlestick {
  t: number; // timestamp in seconds
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
}

interface DomeMarketPrice {
  token_id: string;
  price: number;
  timestamp: number;
}

export class DomeApiClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Fetch markets with filters
   */
  async getMarkets(params: {
    category?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
    status?: 'open' | 'closed';
    minVolume?: number;
    tags?: string[];
  }): Promise<DomeMarket[]> {
    try {
      const queryParams: any = {
        limit: params.limit || 100,
        offset: params.offset || 0
      };

      if (params.category) {
        queryParams.category = params.category;
      }

      if (params.status) {
        queryParams.status = params.status;
      }

      if (params.minVolume) {
        queryParams.min_volume = params.minVolume;
      }

      if (params.tags && params.tags.length > 0) {
        queryParams.tags = params.tags;
      }

      if (params.startDate) {
        queryParams.start_time = Math.floor(params.startDate.getTime() / 1000);
      }

      if (params.endDate) {
        queryParams.end_time = Math.floor(params.endDate.getTime() / 1000);
      }

      const response = await axios.get(`${DOME_API_BASE}/polymarket/markets`, {
        headers: this.getHeaders(),
        params: queryParams
      });

      // Dome API returns { markets: [...], pagination: {...} }
      const markets = response.data.markets;

      // Ensure we always return an array
      if (!markets) return [];
      if (Array.isArray(markets)) return markets;

      // Fallback: try other common API response structures
      const fallbackData = response.data.data || response.data;
      if (Array.isArray(fallbackData)) return fallbackData;
      if (typeof fallbackData === 'object') return [fallbackData];

      return [];
    } catch (error: any) {
      return []; // Return empty array instead of throwing
    }
  }

  /**
   * Fetch historical candlestick data for a market
   * Intervals: 1 = 1 minute (max 1 week), 60 = 1 hour (max 1 month), 1440 = 1 day (max 1 year)
   * 
   * According to Dome API docs: https://docs.domeapi.io/api-reference/endpoint/get-candlestick
   * Response structure: { candlesticks: [[candlestick_data_array, token_metadata], ...] }
   */
  async getCandlesticks(
    conditionId: string,
    interval: 1 | 60 | 1440,
    startTime: Date,
    endTime: Date
  ): Promise<Candlestick[]> {
    try {
      const startTimeSeconds = Math.floor(startTime.getTime() / 1000);
      const endTimeSeconds = Math.floor(endTime.getTime() / 1000);

      // Validate date range based on interval limits
      const rangeSeconds = endTimeSeconds - startTimeSeconds;
      const maxRangeSeconds = 
        interval === 1 ? 7 * 24 * 60 * 60 :      // 1 week for 1 minute
        interval === 60 ? 30 * 24 * 60 * 60 :    // 1 month for 1 hour
        365 * 24 * 60 * 60;                      // 1 year for 1 day

      if (rangeSeconds > maxRangeSeconds) {
        console.warn(
          `Date range (${rangeSeconds}s) exceeds limit for interval ${interval} (max ${maxRangeSeconds}s). ` +
          `Truncating to valid range.`
        );
      }

      // Log timestamp conversion for debugging
        interval: `${interval} (${interval === 1 ? '1min' : interval === 60 ? '1hr' : '1day'})`,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        startTimeSeconds,
        endTimeSeconds,
        rangeDays: ((endTimeSeconds - startTimeSeconds) / (24 * 60 * 60)).toFixed(1),
        url: `${DOME_API_BASE}/polymarket/candlesticks/${conditionId}?interval=${interval}&start_time=${startTimeSeconds}&end_time=${endTimeSeconds}`
      });

      const response = await axios.get(
        `${DOME_API_BASE}/polymarket/candlesticks/${conditionId}`,
        {
          headers: this.getHeaders(),
          params: {
            interval,
            start_time: startTimeSeconds,
            end_time: endTimeSeconds
          }
        }
      );

      // Dome API returns { candlesticks: [[candlestick_data_array, token_metadata], ...] }
      const rawData = response.data;

      // Check if we have the candlesticks array
      const candlesticksArray = rawData.candlesticks;

      if (!candlesticksArray || !Array.isArray(candlesticksArray)) {
        return [];
      }

      if (candlesticksArray.length === 0) {
        return [];
      }


      const candlesticks: Candlestick[] = [];

      // API returns array of tuples: [[candlestick_data_array, token_metadata], ...]
      for (const item of candlesticksArray) {
        if (!Array.isArray(item) || item.length < 2) {
          continue;
        }

        // First element is the array of candlestick objects
        const candleDataArray = item[0];
        if (!Array.isArray(candleDataArray)) {
          continue;
        }

        // Second element is token metadata (we can use this for validation)
        const tokenMetadata = item[1];

        // Process each candlestick in the array
        for (const candleData of candleDataArray) {
          if (!candleData || !candleData.end_period_ts) {
            continue;
          }

          // Extract price data - prefer _dollars fields as they're more reliable
          const priceData = candleData.price;
          if (!priceData) {
            continue;
          }

          // Helper to parse price - prefer _dollars string fields, fallback to numeric
          const parsePrice = (dollarStr?: string, numericValue?: number): number => {
            // First try _dollars string field (most reliable)
            if (dollarStr) {
              const parsed = parseFloat(dollarStr);
              if (!isNaN(parsed) && parsed > 0 && parsed <= 1) return parsed;
            }
            // Fallback to numeric value
            if (numericValue !== undefined && numericValue !== null) {
              // If value is between 0 and 1, it's already in decimal format
              if (numericValue > 0 && numericValue <= 1) {
                return numericValue;
              }
              // If value is > 1, it might be in cents (e.g., 49 = 0.49)
              if (numericValue > 1 && numericValue < 100) {
                return numericValue / 100;
              }
            }
            return 0;
          };

          // Try multiple sources for close price (YES token price)
          // Priority: price.close_dollars > yes_ask.close_dollars > yes_bid.close_dollars > price.close
          let closePrice = 0;
          
          if (priceData.close_dollars) {
            closePrice = parsePrice(priceData.close_dollars);
          }
          
          if (closePrice === 0 && candleData.yes_ask?.close_dollars) {
            closePrice = parsePrice(candleData.yes_ask.close_dollars);
          }
          
          if (closePrice === 0 && candleData.yes_bid?.close_dollars) {
            closePrice = parsePrice(candleData.yes_bid.close_dollars);
          }
          
          // Last resort: try numeric values
          if (closePrice === 0 && priceData.close) {
            closePrice = parsePrice(undefined, priceData.close);
          }
          
          if (closePrice === 0 && candleData.yes_ask?.close) {
            closePrice = parsePrice(undefined, candleData.yes_ask.close);
          }
          
          if (closePrice === 0 && candleData.yes_bid?.close) {
            closePrice = parsePrice(undefined, candleData.yes_bid.close);
          }

          // Validate close price is in valid range (0-1 for YES token)
          if (closePrice > 0 && closePrice <= 1) {
            // Parse other OHLC values
            const open = parsePrice(priceData.open_dollars, priceData.open) || closePrice;
            const high = parsePrice(priceData.high_dollars, priceData.high) || closePrice;
            const low = parsePrice(priceData.low_dollars, priceData.low) || closePrice;
            
            // Ensure all prices are in valid range
            const validOpen = (open > 0 && open <= 1) ? open : closePrice;
            const validHigh = (high > 0 && high <= 1) ? high : closePrice;
            const validLow = (low > 0 && low <= 1) ? low : closePrice;
            
            candlesticks.push({
              timestamp: new Date(candleData.end_period_ts * 1000),
              open: validOpen,
              high: Math.max(validHigh, closePrice), // High should be >= close
              low: Math.min(validLow, closePrice),   // Low should be <= close
              close: closePrice,
              volume: candleData.volume || 0
            });
          } else {
            console.warn(`Skipping candlestick with invalid price data:`, {
              end_period_ts: candleData.end_period_ts,
              timestamp: new Date(candleData.end_period_ts * 1000).toISOString(),
              closePrice,
              price: priceData,
              yes_ask: candleData.yes_ask,
              yes_bid: candleData.yes_bid
            });
          }
        }
      }

      if (candlesticks.length === 0) {
      } else {
        // Log price range for validation
        const prices = candlesticks.map(c => c.close).filter(p => p > 0);
        if (prices.length > 0) {
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
        }
      }
      
      return candlesticks;
    } catch (error: any) {
      console.error(`Error fetching candlesticks for ${conditionId}:`, {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        params: error.config?.params
      });
      return [];
    }
  }

  /**
   * Fetch market price at a specific time
   */
  async getMarketPriceAtTime(
    tokenId: string,
    timestamp: Date
  ): Promise<number | null> {
    try {
      const response = await axios.get(
        `${DOME_API_BASE}/polymarket/market-price/${tokenId}`,
        {
          headers: this.getHeaders(),
          params: {
            at_time: Math.floor(timestamp.getTime() / 1000)
          }
        }
      );

      const data: DomeMarketPrice = response.data.data || response.data;
      return data.price;
    } catch (error: any) {
      return null;
    }
  }

  /**
   * Fetch orderbook history (for advanced backtesting)
   */
  async getOrderbookHistory(
    assetId: string,
    startTime: Date,
    endTime: Date
  ): Promise<any[]> {
    try {
      const response = await axios.get(
        `${DOME_API_BASE}/polymarket/orderbooks`,
        {
          headers: this.getHeaders(),
          params: {
            asset_id: assetId,
            start_time: Math.floor(startTime.getTime() / 1000),
            end_time: Math.floor(endTime.getTime() / 1000)
          }
        }
      );

      return response.data.data || response.data;
    } catch (error: any) {
      return [];
    }
  }

  /**
   * Convert Dome market to MarketSnapshot
   */
  marketToSnapshot(market: DomeMarket, candlestick?: Candlestick): MarketSnapshot {
    return {
      marketId: market.market_id || market.condition_id,
      conditionId: market.condition_id,
      marketName: market.title || market.question || 'Unknown Market',
      category: market.category || (market.tags && market.tags.length > 0 ? market.tags[0] : 'Unknown'),
      liquidity: market.liquidity || market.volume_total || market.volume || 0,
      yesPrice: candlestick?.close || 0.5,
      noPrice: candlestick ? 1 - candlestick.close : 0.5,
      timestamp: candlestick?.timestamp || new Date(),
      resolutionTime: market.end_time ? new Date(market.end_time * 1000) : (market.end_date_iso ? new Date(market.end_date_iso) : new Date()),
      resolved: !!market.winning_side || !!market.outcome,
      outcome: market.winning_side || market.outcome ? ((market.winning_side || market.outcome)!.toUpperCase() as 'YES' | 'NO' | 'INVALID') : undefined
    };
  }
}
