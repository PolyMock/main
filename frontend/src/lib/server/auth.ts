import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '$env/static/private';
import type { RequestEvent } from '@sveltejs/kit';

export interface GoogleUser {
	id: string;
	email: string;
	name: string;
	picture: string;
}

export interface SessionUser {
	id: number;
	googleId: string;
	email: string;
	name: string;
	picture: string;
}

/**
 * Exchange Google authorization code for user info
 */
export async function getGoogleUser(code: string, redirectUri: string): Promise<GoogleUser> {
	// Exchange code for access token
	const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			code,
			client_id: GOOGLE_CLIENT_ID,
			client_secret: GOOGLE_CLIENT_SECRET,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code'
		})
	});

	if (!tokenResponse.ok) {
		throw new Error('Failed to exchange authorization code');
	}

	const { access_token } = await tokenResponse.json();

	// Get user info
	const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
		headers: {
			Authorization: `Bearer ${access_token}`
		}
	});

	if (!userResponse.ok) {
		throw new Error('Failed to get user info');
	}

	const userInfo = await userResponse.json();

	return {
		id: userInfo.id,
		email: userInfo.email,
		name: userInfo.name,
		picture: userInfo.picture
	};
}

/**
 * Create or update user in database
 */
export async function upsertUser(db: D1Database, googleUser: GoogleUser): Promise<SessionUser> {
	// Check if user exists
	const existingUser = await db
		.prepare('SELECT * FROM users WHERE google_id = ?')
		.bind(googleUser.id)
		.first();

	if (existingUser) {
		// Update last login
		await db
			.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE google_id = ?')
			.bind(googleUser.id)
			.run();

		return {
			id: existingUser.id as number,
			googleId: existingUser.google_id as string,
			email: existingUser.email as string,
			name: existingUser.name as string,
			picture: existingUser.picture as string
		};
	}

	// Create new user
	const result = await db
		.prepare(
			'INSERT INTO users (google_id, email, name, picture) VALUES (?, ?, ?, ?) RETURNING *'
		)
		.bind(googleUser.id, googleUser.email, googleUser.name, googleUser.picture)
		.first();

	if (!result) {
		throw new Error('Failed to create user');
	}

	return {
		id: result.id as number,
		googleId: result.google_id as string,
		email: result.email as string,
		name: result.name as string,
		picture: result.picture as string
	};
}

/**
 * Get user from session cookie
 */
export async function getUserFromSession(event: RequestEvent): Promise<SessionUser | null> {
	const session = event.cookies.get('session');
	if (!session) return null;

	try {
		const user = JSON.parse(session);
		return user;
	} catch {
		return null;
	}
}

/**
 * Set session cookie
 */
export function setSessionCookie(event: RequestEvent, user: SessionUser) {
	event.cookies.set('session', JSON.stringify(user), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		maxAge: 60 * 60 * 24 * 30 // 30 days
	});
}

/**
 * Clear session cookie
 */
export function clearSessionCookie(event: RequestEvent) {
	event.cookies.delete('session', { path: '/' });
}
