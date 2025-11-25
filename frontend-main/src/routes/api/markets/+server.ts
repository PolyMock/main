import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const POLYMARKET_API_BASE = 'https://gamma-api.polymarket.com';

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Get query parameters from the request
		const limit = url.searchParams.get('limit') || '5';
		const active = url.searchParams.get('active') || 'true';
		const closed = url.searchParams.get('closed') || 'false';
		
		// Fetch from Polymarket API with additional fields
		const response = await fetch(`${POLYMARKET_API_BASE}/markets?limit=${limit}&active=${active}&closed=${closed}&order=volume24hr&ascending=false`, {
			headers: {
				'Accept': 'application/json',
				'User-Agent': 'PolyPaper/1.0'
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
		console.error('Error fetching Polymarket markets:', error);
		return json(
			{ error: 'Failed to fetch markets', details: error instanceof Error ? error.message : 'Unknown error' },
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