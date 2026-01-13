import { redirect } from '@sveltejs/kit';
import { clearSessionCookie } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	clearSessionCookie({ cookies } as any);
	throw redirect(302, '/');
};
