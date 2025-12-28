import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface UserAccount {
	id: string;
	email: string;
	name: string;
	picture: string;
	walletAddress?: string;
	createdAt: Date;
}

export interface AuthState {
	user: UserAccount | null;
	isAuthenticated: boolean;
	loading: boolean;
}

const initialState: AuthState = {
	user: null,
	isAuthenticated: false,
	loading: false
};

// Load from localStorage if available
function loadAuthState(): AuthState {
	if (browser) {
		const stored = localStorage.getItem('auth_state');
		if (stored) {
			try {
				const parsed = JSON.parse(stored);
				return {
					...parsed,
					user: parsed.user ? {
						...parsed.user,
						createdAt: new Date(parsed.user.createdAt)
					} : null
				};
			} catch (e) {
				console.error('Failed to parse auth state:', e);
			}
		}
	}
	return initialState;
}

function createAuthStore() {
	const { subscribe, set, update } = writable<AuthState>(loadAuthState());

	return {
		subscribe,
		setUser: (user: UserAccount | null) => {
			update(state => {
				const newState = {
					...state,
					user,
					isAuthenticated: !!user
				};
				if (browser) {
					localStorage.setItem('auth_state', JSON.stringify(newState));
				}
				return newState;
			});
		},
		setLoading: (loading: boolean) => {
			update(state => ({ ...state, loading }));
		},
		logout: () => {
			if (browser) {
				localStorage.removeItem('auth_state');
			}
			set(initialState);
		},
		linkWallet: (walletAddress: string) => {
			update(state => {
				if (!state.user) return state;
				const newState = {
					...state,
					user: {
						...state.user,
						walletAddress
					}
				};
				if (browser) {
					localStorage.setItem('auth_state', JSON.stringify(newState));
				}
				return newState;
			});
		},
		updateProfilePicture: (pictureUrl: string) => {
			update(state => {
				if (!state.user) return state;
				const newState = {
					...state,
					user: {
						...state.user,
						picture: pictureUrl
					}
				};
				if (browser) {
					localStorage.setItem('auth_state', JSON.stringify(newState));
				}
				return newState;
			});
		},
		reset: () => set(initialState)
	};
}

export const authStore = createAuthStore();

/**
 * Google OAuth login handler - uses redirect flow
 */
export async function loginWithGoogle() {
	if (!browser) return;

	authStore.setLoading(true);

	// Store return URL
	sessionStorage.setItem('auth_return_url', window.location.pathname);

	// Redirect to Google OAuth
	window.location.href = '/api/auth/google';
}

/**
 * Handle OAuth callback data
 */
export function handleAuthCallback() {
	if (!browser) return;

	// Check if there's auth data in URL hash
	const hash = window.location.hash;
	if (hash.startsWith('#auth=')) {
		try {
			const authData = JSON.parse(decodeURIComponent(hash.substring(6)));

			if (authData.user) {
				const user: UserAccount = {
					id: authData.user.id,
					email: authData.user.email,
					name: authData.user.name,
					picture: authData.user.picture,
					createdAt: new Date()
				};

				authStore.setUser(user);

				// Get return URL and redirect
				const returnUrl = sessionStorage.getItem('auth_return_url') || '/';
				sessionStorage.removeItem('auth_return_url');

				// Clear hash and redirect
				window.history.replaceState(null, '', returnUrl);
			}
		} catch (error) {
			console.error('Failed to parse auth data:', error);
		}
	}

	authStore.setLoading(false);
}
