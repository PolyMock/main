import { writable, get } from 'svelte/store';
import type { Adapter } from '@solana/wallet-adapter-base';
import { polymarketService } from '$lib/solana/polymarket-service';
import { PublicKey } from '@solana/web3.js';
import { authStore } from '$lib/auth/auth-store';

export interface WalletState {
	connected: boolean;
	connecting: boolean;
	disconnecting: boolean;
	publicKey: any | null;
	adapter: Adapter | null;
	usdcBalance: number;  // Mock USDC balance
	userAccountInitialized: boolean;
	loading: boolean;
}

const initialState: WalletState = {
	connected: false,
	connecting: false,
	disconnecting: false,
	publicKey: null,
	adapter: null,
	usdcBalance: 0,
	userAccountInitialized: false,
	loading: false
};

export const walletStore = writable<WalletState>(initialState);

export function setWalletAdapter(adapter: Adapter | null) {
	walletStore.update(state => ({
		...state,
		adapter,
		connected: adapter?.connected ?? false,
		publicKey: adapter?.publicKey ?? null
	}));
}

export function setWalletConnecting(connecting: boolean) {
	walletStore.update(state => ({
		...state,
		connecting
	}));
}

export function setWalletDisconnecting(disconnecting: boolean) {
	walletStore.update(state => ({
		...state,
		disconnecting
	}));
}

export async function updateWalletConnection() {
	const state = get(walletStore);
	if (!state.adapter) return;

	const newState = {
		...state,
		connected: state.adapter.connected ?? false,
		publicKey: state.adapter.publicKey ?? null,
		connecting: false,
		disconnecting: false
	};

	walletStore.set(newState);

	// Authenticate wallet and create session when connected
	if (newState.connected && newState.publicKey && state.adapter) {
		try {
			const walletAddress = newState.publicKey.toString();

			// Check if already authenticated
			const userResponse = await fetch('/api/auth/user', { credentials: 'include' });
			const userData = await userResponse.json();

			// Only authenticate if not already authenticated with this wallet
			if (!userData.user || userData.user.solanaAddress !== walletAddress) {
				// Create authentication message
				const message = `Sign this message to authenticate with Polymock.\n\nWallet: ${walletAddress}\nTimestamp: ${Date.now()}`;
				const messageBytes = new TextEncoder().encode(message);

				// Request signature from wallet
				const signature = await state.adapter.signMessage!(messageBytes);

				// Send to backend for verification and session creation
				const response = await fetch('/api/auth/wallet', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({
						walletAddress,
						signature: Array.from(signature),
						message
					})
				});

				if (response.ok) {

					// Link wallet to Google account if authenticated
					const auth = get(authStore);
					if (auth.isAuthenticated && !auth.user?.walletAddress) {
						authStore.linkWallet(walletAddress);
					}
				}
			}
		} catch (error) {
			console.error('Error authenticating wallet:', error);
			// Continue even if authentication fails - user can still use wallet without server session
		}
	}
}

export function setUserBalance(usdcBalance: number) {
	walletStore.update(state => ({
		...state,
		usdcBalance
	}));
}

export function setUserAccountInitialized(initialized: boolean) {
	walletStore.update(state => ({
		...state,
		userAccountInitialized: initialized
	}));
}

export function setWalletLoading(loading: boolean) {
	walletStore.update(state => ({
		...state,
		loading
	}));
}

/**
 * Initialize user account and fetch balance
 */
export async function initializeUserAccountIfNeeded(wallet: any) {
	try {
		if (!wallet || !wallet.publicKey) {
			console.error('No wallet connected');
			return;
		}

		setWalletLoading(true);

		// Initialize the Solana program with MagicBlock RPC
		// MagicBlock RPC automatically handles ER routing - no delegation needed!
		await polymarketService.initializeProgram(wallet);

		const userPublicKey = new PublicKey(wallet.publicKey.toString());

		// Check if user account exists
		const exists = await polymarketService.checkUserAccount(userPublicKey);

		if (!exists) {
			// Initialize with 0.1 SOL entry fee
			await polymarketService.initializeUserAccount(wallet, 0.1);
		}

		// Fetch user account data
		const userAccount = await polymarketService.getUserAccount(userPublicKey);
		if (userAccount) {
			const balance = userAccount.usdcBalance.toNumber() / 1_000_000; // Convert from 6 decimals
			setUserBalance(balance);
			setUserAccountInitialized(true);
		}
	} catch (error: any) {
		console.error('Error initializing user account:', error);
		console.error('Error details:', {
			message: error?.message,
			code: error?.code,
			stack: error?.stack
		});
	} finally {
		setWalletLoading(false);
	}
}

/**
 * Refresh user balance
 */
export async function refreshUserBalance(publicKey: PublicKey) {
	try {
		const userAccount = await polymarketService.getUserAccount(publicKey);
		if (userAccount) {
			const balance = userAccount.usdcBalance.toNumber() / 1_000_000;
			setUserBalance(balance);
		}
	} catch (error) {
		console.error('Error refreshing balance:', error);
	}
}