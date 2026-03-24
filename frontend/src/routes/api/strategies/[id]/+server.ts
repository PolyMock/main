import { json } from '@sveltejs/kit';
import { getUserFromSession } from '$lib/server/auth';
import { supabase } from '$lib/supabase';
import type { RequestHandler } from './$types';

/**
 * GET - Retrieve full strategy details by ID
 */
export const GET: RequestHandler = async (event) => {
	const strategyId = event.params.id;

	const { data, error: dbErr } = await supabase
		.from('backtest_strategies')
		.select('*')
		.eq('id', strategyId)
		.maybeSingle();

	if (dbErr) {
		console.error('[strategies/id] GET error:', dbErr);
		return json({ error: 'Failed to fetch strategy' }, { status: 500 });
	}

	if (!data) {
		return json({ error: 'Strategy not found' }, { status: 404 });
	}

	return json({ strategy: data });
};

/**
 * DELETE - Delete a strategy by ID (owner only)
 */
export const DELETE: RequestHandler = async (event) => {
	const sessionUser = await getUserFromSession(event);
	if (!sessionUser) return json({ error: 'Unauthorized' }, { status: 401 });

	const strategyId = event.params.id;

	const { data: dbUser } = await supabase
		.from('users')
		.select('id')
		.eq('wallet_address', sessionUser.walletAddress)
		.maybeSingle();

	if (!dbUser) return json({ error: 'User not found' }, { status: 404 });

	// Verify ownership
	const { data: strategy } = await supabase
		.from('backtest_strategies')
		.select('user_id')
		.eq('id', strategyId)
		.maybeSingle();

	if (!strategy) return json({ error: 'Strategy not found' }, { status: 404 });
	if (strategy.user_id !== dbUser.id) return json({ error: 'Not authorized' }, { status: 403 });

	const { error: delErr } = await supabase
		.from('backtest_strategies')
		.delete()
		.eq('id', strategyId);

	if (delErr) {
		console.error('[strategies/id] DELETE error:', delErr);
		return json({ error: 'Failed to delete strategy' }, { status: 500 });
	}

	return json({ success: true });
};
