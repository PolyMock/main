import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { NEWDATA_API_KEY } from '$env/static/private';


const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000; // 60 minutes (1 hour)

export const GET: RequestHandler = async ({ url }) => {
	try {
		const category = url.searchParams.get('category') || 'top';
		const language = url.searchParams.get('language') || 'en';


		const cacheKey = `${category}-${language}`;


		const cached = cache.get(cacheKey);
		if (cached) {
			const isExpired = Date.now() - cached.timestamp >= CACHE_DURATION;

			// Always return cached data if available
			if (!isExpired) {
				console.log('Returning fresh cached news data for:', cacheKey);
				return json(cached.data);
			} else {
				console.log('Cached data expired, but will use as fallback if API fails:', cacheKey);
			}
		}

		// Fetch from NewsData API
		const apiUrl = new URL('https://newsdata.io/api/1/news');
		apiUrl.searchParams.set('apikey', NEWDATA_API_KEY);
		apiUrl.searchParams.set('language', language);
		

		
		if (category !== 'all' && category !== 'top') {
			apiUrl.searchParams.set('category', category);
		}

		console.log('Fetching news from NewsData API:', category);
		const response = await fetch(apiUrl.toString());

		if (!response.ok) {
			const errorText = await response.text();
			console.error('NewsData API error:', response.status, errorText);

			// If rate limited and we have cached data, return it even if expired
			if (response.status === 429 && cached) {
				console.log('Rate limited - returning stale cached data for:', cacheKey);
				return json(cached.data, {
					headers: {
						'X-Cache-Status': 'stale-due-to-rate-limit'
					}
				});
			}

			return json(
				{
					error: 'Failed to fetch news',
					status: response.status,
					message: errorText
				},
				{ status: response.status }
			);
		}

		const data = await response.json();

		// Cache the response
		cache.set(cacheKey, {
			data,
			timestamp: Date.now()
		});

		
		if (cache.size > 50) {
			const oldestKey = Array.from(cache.keys())[0];
			cache.delete(oldestKey);
		}

		return json(data);
	} catch (error: any) {
		console.error('Error in newsdata API route:', error);
		return json(
			{ error: 'Internal server error', message: error.message },
			{ status: 500 }
		);
	}
};
