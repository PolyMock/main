/**
 * API endpoint for fetching candlestick data
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DomeApiClient } from '$lib/backtesting/domeApiClient';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ params, url }) => {
  try {
    const { conditionId } = params;

    if (!conditionId) {
      return json({ error: 'Condition ID is required' }, { status: 400 });
    }

    const startTime = url.searchParams.get('startTime');
    const endTime = url.searchParams.get('endTime');
    const interval = url.searchParams.get('interval') || '1440'; // Default 1 day

    if (!startTime || !endTime) {
      return json({ error: 'Start time and end time are required' }, { status: 400 });
    }

    const apiKey = env.DOME_API_KEY || '';
    if (!apiKey) {
      return json({ error: 'DOME_API_KEY not configured in .env file' }, { status: 500 });
    }

    const domeClient = new DomeApiClient(apiKey);

    const candlesticks = await domeClient.getCandlesticks(
      conditionId,
      parseInt(interval) as 1 | 60 | 1440,
      new Date(parseInt(startTime) * 1000),
      new Date(parseInt(endTime) * 1000)
    );


    return json({ candlesticks });
  } catch (error: any) {
    console.error('Error fetching candlesticks:', error);
    return json(
      { error: error.message || 'An error occurred while fetching candlesticks' },
      { status: 500 }
    );
  }
};
