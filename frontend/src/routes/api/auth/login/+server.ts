import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ url }) => {
	const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID || '';
	const baseUrl = env.PUBLIC_BASE_URL || url.origin;
	const redirectUri = `${baseUrl}/api/auth/google/callback`;

	const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	googleAuthUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
	googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
	googleAuthUrl.searchParams.set('response_type', 'code');
	googleAuthUrl.searchParams.set('scope', 'openid email profile');
	googleAuthUrl.searchParams.set('access_type', 'offline');
	googleAuthUrl.searchParams.set('prompt', 'consent');

	throw redirect(302, googleAuthUrl.toString());
};
