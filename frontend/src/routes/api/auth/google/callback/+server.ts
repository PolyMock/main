import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ url }) => {
	const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID || '';
	const GOOGLE_CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET || '';
	const baseUrl = env.PUBLIC_BASE_URL || url.origin;
	const REDIRECT_URI = `${baseUrl}/api/auth/google/callback`;
	const code = url.searchParams.get('code');
	const error = url.searchParams.get('error');

	if (error) {
		return new Response(
			`
			<!DOCTYPE html>
			<html>
			<head><title>Authentication Error</title></head>
			<body>
				<script>
					alert('Authentication failed: ${error}');
					window.location.href = '/';
				</script>
			</body>
			</html>
			`,
			{ headers: { 'Content-Type': 'text/html' } }
		);
	}

	if (!code) {
		return new Response(
			`
			<!DOCTYPE html>
			<html>
			<head><title>Authentication Error</title></head>
			<body>
				<script>
					alert('No authorization code received');
					window.location.href = '/';
				</script>
			</body>
			</html>
			`,
			{ headers: { 'Content-Type': 'text/html' } }
		);
	}

	try {
		// Exchange code for tokens
		const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams({
				code,
				client_id: GOOGLE_CLIENT_ID,
				client_secret: GOOGLE_CLIENT_SECRET,
				redirect_uri: REDIRECT_URI,
				grant_type: 'authorization_code'
			})
		});

		const tokens = await tokenResponse.json();

		if (!tokenResponse.ok || tokens.error) {
			throw new Error(tokens.error_description || 'Failed to get tokens');
		}

		// Get user info
		const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
			headers: {
				Authorization: `Bearer ${tokens.access_token}`
			}
		});

		const userInfo = await userInfoResponse.json();

		if (!userInfoResponse.ok) {
			throw new Error('Failed to get user info');
		}

		// Redirect back to app with user data in hash
		const authData = encodeURIComponent(JSON.stringify({
			user: {
				id: userInfo.id,
				email: userInfo.email,
				name: userInfo.name,
				picture: userInfo.picture
			}
		}));

		return new Response(
			`
			<!DOCTYPE html>
			<html>
			<head>
				<title>Authentication Successful</title>
			</head>
			<body>
				<script>
					window.location.href = '/#auth=${authData}';
				</script>
			</body>
			</html>
			`,
			{ headers: { 'Content-Type': 'text/html' } }
		);
	} catch (error: any) {
		return new Response(
			`
			<!DOCTYPE html>
			<html>
			<head><title>Authentication Error</title></head>
			<body>
				<script>
					alert('Authentication failed: ${error.message || 'Unknown error'}');
					window.location.href = '/';
				</script>
			</body>
			</html>
			`,
			{ headers: { 'Content-Type': 'text/html' } }
		);
	}
};
