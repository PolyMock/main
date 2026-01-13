import { json } from '@sveltejs/kit';
import { getUserFromSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const user = await getUserFromSession(event);

	if (!user) {
		return json({ user: null });
	}

	return json({ user });
};
