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

export function updateWalletConnection() {
	walletStore.update(state => {
		if (!state.adapter) return state;

		const newState = {
			...state,
			connected: state.adapter.connected ?? false,
			publicKey: state.adapter.publicKey ?? null,
			connecting: false,
			disconnecting: false
		};

		// Link wallet to Google account if authenticated
		if (newState.connected && newState.publicKey) {
			const auth = get(authStore);
			if (auth.isAuthenticated && !auth.user?.walletAddress) {
				authStore.linkWallet(newState.publicKey.toString());
			}
		}

		return newState;
	});
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
			console.log('User account does not exist, initializing...');
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
	} catch (error) {
		console.error('Error initializing user account:', error);
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