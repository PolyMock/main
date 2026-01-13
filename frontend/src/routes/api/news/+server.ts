import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const CRYPTOCOMPARE_API_BASE = 'https://min-api.cryptocompare.com';

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Get query parameters from the request
		const lang = url.searchParams.get('lang') || 'EN';

		// Note: categories parameter causes API timeouts, so we fetch all news and filter later if needed
		const response = await fetch(`${CRYPTOCOMPARE_API_BASE}/data/v2/news/?lang=${lang}`, {
			headers: {
				'Accept': 'application/json',
				'User-Agent': 'PolyMock/1.0'
			}
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();

		// Return the data with CORS headers
		return json(data, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET',
				'Access-Control-Allow-Headers': 'Content-Type'
			}
		});
	} catch (error) {
		console.error('Error fetching crypto news:', error);
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
