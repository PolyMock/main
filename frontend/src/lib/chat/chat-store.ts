import { writable, derived } from 'svelte/store';
import { authStore } from '$lib/auth/auth-store';
import { get } from 'svelte/store';

export interface ChatMessage {
	id: string;
	marketId: string;
	userId: string;
	userName: string;
	userPicture?: string;
	message: string;
	timestamp: Date;
	edited: boolean;
	editedAt?: Date;
}

interface ChatState {
	messages: Map<string, ChatMessage[]>; // marketId -> messages
	loading: boolean;
}

const initialState: ChatState = {
	messages: new Map(),
	loading: false
};

function createChatStore() {
	const { subscribe, set, update } = writable<ChatState>(initialState);

	// In-memory storage (in production, this would be a backend API)
	const messageStorage = new Map<string, ChatMessage[]>();

	return {
		subscribe,

		// Get messages for a market
		getMessages: (marketId: string): ChatMessage[] => {
			const state = get({ subscribe });
			return state.messages.get(marketId) || [];
		},

		// Load messages for a market
		loadMessages: async (marketId: string) => {
			update(state => ({ ...state, loading: true }));

			try {
				// Simulate API call - in production, fetch from backend
				await new Promise(resolve => setTimeout(resolve, 300));

				const messages = messageStorage.get(marketId) || [];

				update(state => {
					const newMessages = new Map(state.messages);
					newMessages.set(marketId, messages);
					return {
						...state,
						messages: newMessages,
						loading: false
					};
				});
			} catch (error) {
				console.error('Failed to load messages:', error);
				update(state => ({ ...state, loading: false }));
			}
		},

		// Send a message
		sendMessage: async (marketId: string, message: string): Promise<ChatMessage> => {
			const auth = get(authStore);

			if (!auth.isAuthenticated || !auth.user) {
				throw new Error('You must be logged in to send messages');
			}

			const newMessage: ChatMessage = {
				id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				marketId,
				userId: auth.user.sub,
				userName: auth.user.name,
				userPicture: auth.user.picture,
				message: message.trim(),
				timestamp: new Date(),
				edited: false
			};

			// Save to storage
			const existingMessages = messageStorage.get(marketId) || [];
			messageStorage.set(marketId, [...existingMessages, newMessage]);

			// Update store
			update(state => {
				const newMessages = new Map(state.messages);
				const marketMessages = newMessages.get(marketId) || [];
				newMessages.set(marketId, [...marketMessages, newMessage]);
				return {
					...state,
					messages: newMessages
				};
			});

			return newMessage;
		},

		// Edit a message
		editMessage: async (marketId: string, messageId: string, newContent: string): Promise<void> => {
			const auth = get(authStore);

			if (!auth.isAuthenticated || !auth.user) {
				throw new Error('You must be logged in to edit messages');
			}

			update(state => {
				const newMessages = new Map(state.messages);
				const marketMessages = newMessages.get(marketId) || [];

				const updatedMessages = marketMessages.map(msg => {
					if (msg.id === messageId && msg.userId === auth.user!.sub) {
						return {
							...msg,
							message: newContent.trim(),
							edited: true,
							editedAt: new Date()
						};
					}
					return msg;
				});

				// Update storage
				messageStorage.set(marketId, updatedMessages);
				newMessages.set(marketId, updatedMessages);

				return {
					...state,
					messages: newMessages
				};
			});
		},

		// Delete a message
		deleteMessage: async (marketId: string, messageId: string): Promise<void> => {
			const auth = get(authStore);

			if (!auth.isAuthenticated || !auth.user) {
				throw new Error('You must be logged in to delete messages');
			}

			update(state => {
				const newMessages = new Map(state.messages);
				const marketMessages = newMessages.get(marketId) || [];

				const updatedMessages = marketMessages.filter(
					msg => !(msg.id === messageId && msg.userId === auth.user!.sub)
				);

				// Update storage
				messageStorage.set(marketId, updatedMessages);
				newMessages.set(marketId, updatedMessages);

				return {
					...state,
					messages: newMessages
				};
			});
		}
	};
}

export const chatStore = createChatStore();
