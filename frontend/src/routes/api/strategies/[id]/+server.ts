import { json, error } from '@sveltejs/kit';
import { getUserFromSession } from '$lib/server/auth';
import { getStrategyById, deleteStrategy } from '$lib/server/db';
import type { RequestHandler } from './$types';

/**
 * GET - Retrieve full strategy details by ID
 */
export const GET: RequestHandler = async (event) => {
	const user = await getUserFromSession(event);

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const db = event.platform?.env?.DB as D1Database;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const strategyId = parseInt(event.params.id);

	if (isNaN(strategyId)) {
		throw error(400, 'Invalid strategy ID');
	}

	try {
		const strategy = await getStrategyById(db, strategyId, user.id);

		if (!strategy) {
			throw error(404, 'Strategy not found');
		}

		return json({ strategy });
	} catch (err: any) {
		console.error('Error fetching strategy:', err);
		throw error(500, err.message || 'Failed to fetch strategy');
	}
};

/**
 * DELETE - Delete a strategy by ID
 */
export const DELETE: RequestHandler = async (event) => {
	const user = await getUserFromSession(event);

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const db = event.platform?.env?.DB as D1Database;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const strategyId = parseInt(event.params.id);

	if (isNaN(strategyId)) {
		throw error(400, 'Invalid strategy ID');
	}

	try {
		const success = await deleteStrategy(db, strategyId, user.id);

		if (!success) {
			throw error(404, 'Strategy not found or already deleted');
		}

		return json({ success: true });
	} catch (err: any) {
		console.error('Error deleting strategy:', err);
		throw error(500, err.message || 'Failed to delete strategy');
	}
};
