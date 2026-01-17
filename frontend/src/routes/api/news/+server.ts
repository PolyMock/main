import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const CRYPTOCOMPARE_API_BASE = 'https://min-api.cryptocompare.com';

// Cache news data to reduce API calls
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Get query parameters from the request
		const lang = url.searchParams.get('lang') || 'EN';
		const cacheKey = `news-${lang}`;

		// Check cache first
		const cached = cache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
			return json(cached.data, {
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET',
					'Access-Control-Allow-Headers': 'Content-Type',
					'X-Cache-Status': 'hit'
				}
			});
		}

		// Fetch from CryptoCompare API with timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

		const response = await fetch(`${CRYPTOCOMPARE_API_BASE}/data/v2/news/?lang=${lang}`, {
			headers: {
				'Accept': 'application/json',
				'User-Agent': 'PolyMock/1.0'
			},
			signal: controller.signal
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			// If we have stale cache, return it on error
			if (cached) {
				return json(cached.data, {
					headers: {
						'Access-Control-Allow-Origin': '*',
						'Access-Control-Allow-Methods': 'GET',
						'Access-Control-Allow-Headers': 'Content-Type',
						'X-Cache-Status': 'stale'
					}
				});
			}
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();

		// Cache the response
		cache.set(cacheKey, {
			data,
			timestamp: Date.now()
		});

		// Limit cache size
		if (cache.size > 10) {
			const oldestKey = Array.from(cache.keys())[0];
			cache.delete(oldestKey);
		}

		// Return the data with CORS headers
		return json(data, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET',
				'Access-Control-Allow-Headers': 'Content-Type',
				'X-Cache-Status': 'miss'
			}
		});
	} catch (error) {
		console.error('Error fetching crypto news:', error);

		// Try to return cached data even if expired
		const lang = url.searchParams.get('lang') || 'EN';
		const cacheKey = `news-${lang}`;
		const cached = cache.get(cacheKey);

		if (cached) {
			return json(cached.data, {
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET',
					'Access-Control-Allow-Headers': 'Content-Type',
					'X-Cache-Status': 'stale-error'
				}
			});
		}

		return json(
			{ error: 'Failed to fetch news', details: error instanceof Error ? error.message : 'Unknown error' },
			{
				status: 500,
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET',
					'Access-Control-Allow-Headers': 'Content-Type'
				}
			}
		);
	}
};
