import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';


const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID || '';
const REDIRECT_URI = env.PUBLIC_BASE_URL
	? `${env.PUBLIC_BASE_URL}/api/auth/google/callback`
	: 'http://localhost:5173/api/auth/google/callback';

export const GET: RequestHandler = async () => {
	// Check if credentials are set
	if (!GOOGLE_CLIENT_ID) {
		return new Response('Google OAuth is not configured. Please set GOOGLE_CLIENT_ID in environment variables.', {
			status: 500,
			headers: { 'Content-Type': 'text/plain' }
		});
	}

	// Build Google OAuth URL
	const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');

	googleAuthUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
	googleAuthUrl.searchParams.set('redirect_uri', REDIRECT_URI);
	googleAuthUrl.searchParams.set('response_type', 'code');
	googleAuthUrl.searchParams.set('scope', 'openid email profile');
	googleAuthUrl.searchParams.set('access_type', 'offline');
	googleAuthUrl.searchParams.set('prompt', 'consent');

	throw redirect(302, googleAuthUrl.toString());
};
