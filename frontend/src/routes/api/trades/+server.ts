import { json } from '@sveltejs/kit';
import { getUserFromSession } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const sessionUser = await getUserFromSession(event);
	if (!sessionUser) {
		return json({ error: 'Not authenticated. Please connect your wallet.' }, { status: 401 });
	}

	const { data: dbUser, error: userErr } = await supabaseAdmin
		.from('users')
		.select('id')
		.eq('wallet_address', sessionUser.walletAddress)
		.maybeSingle();

	if (userErr || !dbUser) {
		return json({ error: 'User not found. Please set a username first.' }, { status: 404 });
	}

	const body = await event.request.json();

	// Prevent duplicate posts
	const { data: existing } = await supabaseAdmin
		.from('trades')
		.select('id')
		.eq('user_id', dbUser.id)
		.eq('market_id', body.marketId)
		.eq('position_type', body.positionType)
		.eq('entry_price', body.entryPrice)
		.maybeSingle();

	if (existing) {
		return json({ error: 'This trade has already been posted.' }, { status: 409 });
	}

	const { error: insertErr } = await supabaseAdmin.from('trades').insert({
		user_id: dbUser.id,
		source: 'polymock',
		position_type: body.positionType,
		entry_price: body.entryPrice,
		exit_price: body.exitPrice || null,
		amount: body.amount,
		pnl: body.pnl || null,
		market_id: body.marketId,
		market_title: body.marketName,
		platform: 'polymarket',
		status: body.status === 'closed' ? 'closed' : 'open',
		analysis: body.analysis?.trim() || null,
		is_published: true,
		opened_at: new Date().toISOString(),
	});

	if (insertErr) {
		console.error('[trades] POST error:', insertErr);
		return json({ error: insertErr.message }, { status: 500 });
	}

	return json({ success: true });
};
