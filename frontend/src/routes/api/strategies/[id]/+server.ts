import { json, error } from '@sveltejs/kit';
import { getUserFromSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

/**
 * GET - Retrieve full strategy details by ID
 * TODO: Wire up to Supabase
 */
export const GET: RequestHandler = async (event) => {
	const user = await getUserFromSession(event);
	if (!user) throw error(401, 'Unauthorized');

	// TODO: Supabase query
	throw error(404, 'Not implemented yet');
};

/**
 * DELETE - Delete a strategy by ID
 * TODO: Wire up to Supabase
 */
export const DELETE: RequestHandler = async (event) => {
	const user = await getUserFromSession(event);
	if (!user) throw error(401, 'Unauthorized');

	// TODO: Supabase delete
	return json({ success: true });
};
