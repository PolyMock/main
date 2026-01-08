import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const POLYMARKET_API_BASE = 'https://gamma-api.polymarket.com';

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Get query parameters from the request
		const limit = url.searchParams.get('limit') || '10';
		const active = url.searchParams.get('active') || 'true';
		const closed = url.searchParams.get('closed') || 'false';
		const offset = url.searchParams.get('offset') || '0';

		// Fetch events from Polymarket API
		// Events contain nested markets, so we get the complete structure
		const response = await fetch(
			`${POLYMARKET_API_BASE}/events?limit=${limit}&offset=${offset}&active=${active}&closed=${closed}&order=volume&ascending=false`,
			{
				headers: {
					'Accept': 'application/json',
					'User-Agent': 'PolyMock/1.0'
				}
			}
		);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const events = await response.json();

		// Return the data with CORS headers
		return json(events, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET',
				'Access-Control-Allow-Headers': 'Content-Type'
			}
		});
	} catch (error) {
		console.error('Error fetching Polymarket events:', error);
		return json(
			{ error: 'Failed to fetch events', details: error instanceof Error ? error.message : 'Unknown error' },
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
