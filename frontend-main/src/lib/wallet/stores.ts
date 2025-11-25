import { writable } from 'svelte/store';
import type { Adapter } from '@solana/wallet-adapter-base';

export interface WalletState {
	connected: boolean;
	connecting: boolean;
	disconnecting: boolean;
	publicKey: any | null;
	adapter: Adapter | null;
}

const initialState: WalletState = {
	connected: false,
	connecting: false,
	disconnecting: false,
	publicKey: null,
	adapter: null
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
		
		return {
			...state,
			connected: state.adapter.connected ?? false,
			publicKey: state.adapter.publicKey ?? null,
			connecting: false,
			disconnecting: false
		};
	});
}