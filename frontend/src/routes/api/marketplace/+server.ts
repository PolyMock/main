import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET - Retrieve top backtest strategies sorted by PnL
 * TODO: Wire up to Supabase
 */
export const GET: RequestHandler = async () => {
	// TODO: Supabase query
	return json({ strategies: [] });
};
