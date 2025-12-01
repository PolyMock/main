import axios from 'axios';
import { logger } from './logger.js';

export interface MarketResolution {
	marketId: string;
	resolved: boolean;
	outcome: 'yes' | 'no' | null;
	closedAt: Date | null;
	resolvedAt: Date | null;
	finalPrice: number; // 0 to 1
}

export class MarketResolver {
	private apiBaseUrl: string;
	private cache: Map<string, { data: MarketResolution; timestamp: number }>;
	private cacheTTL: number = 60000; // 1 minute cache

	constructor() {
		this.apiBaseUrl =
			process.env.POLYMARKET_API_BASE_URL || 'https://gamma-api.polymarket.com';
		this.cache = new Map();
		logger.info(`Market resolver initialized with API: ${this.apiBaseUrl}`);
	}

	/**
	 * Check if a market is resolved
	 */
	async getMarketResolution(marketId: string): Promise<MarketResolution> {
		// Check cache first
		const cached = this.cache.get(marketId);
		if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
			logger.debug(`Using cached data for market ${marketId}`);
			return cached.data;
		}

		try {
			logger.debug(`Fetching market data for ${marketId}`);

			const response = await axios.get(`${this.apiBaseUrl}/markets/${marketId}`);
			const market = response.data;

			// Determine if market is resolved
			const resolved = market.closed && market.resolved;
			let outcome: 'yes' | 'no' | null = null;
			let finalPrice = 0.5; // Default to 50/50

			if (resolved) {
				// Get the outcome from tokens
				const yesToken = market.tokens?.find((t: any) => t.outcome === 'Yes');
				const noToken = market.tokens?.find((t: any) => t.outcome === 'No');

				if (yesToken && yesToken.winner) {
					outcome = 'yes';
					finalPrice = 1.0;
				} else if (noToken && noToken.winner) {
					outcome = 'no';
					finalPrice = 0.0;
				} else {
					// Try to determine from prices
					const yesPrice = parseFloat(market.outcomePrices?.[0] || '0.5');
					outcome = yesPrice > 0.5 ? 'yes' : 'no';
					finalPrice = outcome === 'yes' ? 1.0 : 0.0;
				}
			} else {
				// Market not resolved, use current price
				finalPrice = parseFloat(market.outcomePrices?.[0] || '0.5');
			}

			const resolution: MarketResolution = {
				marketId,
				resolved,
				outcome,
				closedAt: market.closedAt ? new Date(market.closedAt) : null,
				resolvedAt: market.resolvedAt ? new Date(market.resolvedAt) : null,
				finalPrice,
			};

			// Cache the result
			this.cache.set(marketId, {
				data: resolution,
				timestamp: Date.now(),
			});

			logger.debug(
				`Market ${marketId}: resolved=${resolved}, outcome=${outcome}, price=${finalPrice}`
			);

			return resolution;
		} catch (error: any) {
			logger.warn(
				`Failed to fetch market ${marketId}: ${error.message}. Using fallback.`
			);

			// Return a fallback (not resolved)
			return {
				marketId,
				resolved: false,
				outcome: null,
				closedAt: null,
				resolvedAt: null,
				finalPrice: 0.5,
			};
		}
	}

	/**
	 * Get resolutions for multiple markets
	 */
	async getMultipleMarketResolutions(
		marketIds: string[]
	): Promise<Map<string, MarketResolution>> {
		const results = new Map<string, MarketResolution>();

		// Fetch in parallel but with a small delay to avoid rate limiting
		for (let i = 0; i < marketIds.length; i++) {
			const marketId = marketIds[i];
			const resolution = await this.getMarketResolution(marketId);
			results.set(marketId, resolution);

			// Small delay to avoid rate limiting
			if (i < marketIds.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, 200));
			}
		}

		return results;
	}

	/**
	 * Clear cache (useful for testing or forced refresh)
	 */
	clearCache() {
		this.cache.clear();
		logger.info('Market resolution cache cleared');
	}
}
