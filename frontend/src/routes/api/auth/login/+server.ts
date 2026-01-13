import { redirect } from '@sveltejs/kit';
import { GOOGLE_CLIENT_ID } from '$env/static/private';
import { PUBLIC_BASE_URL } from '$env/static/public';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const redirectUri = `${PUBLIC_BASE_URL}/api/auth/google/callback`;

	const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	googleAuthUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
	googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
	googleAuthUrl.searchParams.set('response_type', 'code');
	googleAuthUrl.searchParams.set('scope', 'openid email profile');
	googleAuthUrl.searchParams.set('access_type', 'offline');
	googleAuthUrl.searchParams.set('prompt', 'consent');

	throw redirect(302, googleAuthUrl.toString());
};
