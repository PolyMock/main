import { json, error } from '@sveltejs/kit';
import { getUserFromSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

/**
 * GET - Retrieve all strategies for logged-in user
 * TODO: Wire up to Supabase
 */
export const GET: RequestHandler = async (event) => {
	const user = await getUserFromSession(event);
	if (!user) throw error(401, 'Unauthorized');

	// TODO: Supabase query
	return json({ strategies: [] });
};

/**
 * POST - Save a completed backtest strategy
 * TODO: Wire up to Supabase
 */
export const POST: RequestHandler = async (event) => {
	const user = await getUserFromSession(event);
	if (!user) throw error(401, 'Unauthorized');

	// TODO: Supabase insert
	await event.request.json();
	return json({ success: true, strategyId: null });
};
