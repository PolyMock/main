import type { RequestEvent } from '@sveltejs/kit';

export interface SessionUser {
	id: string;
	walletAddress: string;
	username: string;
	email?: string | null;
	picture?: string | null;
}

/**
 * Get user from session cookie
 */
export async function getUserFromSession(event: RequestEvent): Promise<SessionUser | null> {
	const session = event.cookies.get('session');
	if (!session) return null;

	try {
		return JSON.parse(session);
	} catch {
		return null;
	}
}

/**
 * Set session cookie
 */
export function setSessionCookie(event: RequestEvent, user: SessionUser) {
	const isProduction = event.url.hostname !== 'localhost' && event.url.hostname !== '127.0.0.1';

	event.cookies.set('session', JSON.stringify(user), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: isProduction,
		maxAge: 60 * 60 * 24 * 30 // 30 days
	});
}

/**
 * Clear session cookie
 */
export function clearSessionCookie(event: RequestEvent) {
	event.cookies.delete('session', { path: '/' });
}
