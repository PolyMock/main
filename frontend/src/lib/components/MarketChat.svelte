<script lang="ts">
	import { onMount, afterUpdate } from 'svelte';
	import { chatStore, type ChatMessage } from '$lib/chat/chat-store';
	import { authStore } from '$lib/auth/auth-store';
	import { goto } from '$app/navigation';

	export let marketId: string;

	let messages: ChatMessage[] = [];
	let messageInput = '';
	let chatContainer: HTMLElement;
	let editingMessageId: string | null = null;
	let editingMessageContent: string = '';
	let showDeleteConfirm: string | null = null;

	$: currentUserId = $authStore.user?.sub;

	onMount(async () => {
		await chatStore.loadMessages(marketId);
		loadMessages();
	});

	function loadMessages() {
		messages = chatStore.getMessages(marketId);
	}

	chatStore.subscribe(() => {
		loadMessages();
		scrollToBottom();
	});

	function scrollToBottom() {
		if (chatContainer) {
			setTimeout(() => {
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}, 100);
		}
	}

	async function handleSendMessage() {
		if (!messageInput.trim()) return;

		if (!$authStore.isAuthenticated) {
			alert('Please log in to send messages');
			return;
		}

		try {
			await chatStore.sendMessage(marketId, messageInput);
			messageInput = '';
			scrollToBottom();
		} catch (error: any) {
			alert(error.message || 'Failed to send message');
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSendMessage();
		}
	}

	function startEdit(message: ChatMessage) {
		editingMessageId = message.id;
		editingMessageContent = message.message;
	}

	function cancelEdit() {
		editingMessageId = null;
		editingMessageContent = '';
	}

	async function saveEdit() {
		if (!editingMessageId || !editingMessageContent.trim()) return;

		try {
			await chatStore.editMessage(marketId, editingMessageId, editingMessageContent);
			editingMessageId = null;
			editingMessageContent = '';
		} catch (error: any) {
			alert(error.message || 'Failed to edit message');
		}
	}

	function confirmDelete(messageId: string) {
		showDeleteConfirm = messageId;
	}

	function cancelDelete() {
		showDeleteConfirm = null;
	}

	async function deleteMessage(messageId: string) {
		try {
			await chatStore.deleteMessage(marketId, messageId);
			showDeleteConfirm = null;
		} catch (error: any) {
			alert(error.message || 'Failed to delete message');
		}
	}

	function formatTime(date: Date): string {
		const now = new Date();
		const diff = now.getTime() - new Date(date).getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;

		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: now.getFullYear() !== new Date(date).getFullYear() ? 'numeric' : undefined
		});
	}

	function goToProfile(userId: string) {
		// Navigate to profile page (could be user-specific in the future)
		goto('/profile');
	}

	afterUpdate(() => {
		scrollToBottom();
	});
</script>

<div class="chat-container">
	<div class="chat-header">
		<h3>Market Discussion</h3>
		<span class="message-count">{messages.length} {messages.length === 1 ? 'message' : 'messages'}</span>
	</div>

	<div class="messages-container" bind:this={chatContainer}>
		{#if messages.length === 0}
			<div class="empty-chat">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
				</svg>
				<p>No messages yet</p>
				<span>Be the first to start the discussion!</span>
			</div>
		{:else}
			{#each messages as message (message.id)}
				<div class="message" class:own-message={message.userId === currentUserId}>
					<button class="message-avatar" on:click={() => goToProfile(message.userId)}>
						{#if message.userPicture}
							<img src={message.userPicture} alt={message.userName} />
						{:else}
							<div class="avatar-placeholder">
								{message.userName.charAt(0).toUpperCase()}
							</div>
						{/if}
					</button>

					<div class="message-content">
						<div class="message-header">
							<button class="message-author" on:click={() => goToProfile(message.userId)}>
								{message.userName}
							</button>
							<span class="message-time">
								{formatTime(message.timestamp)}
								{#if message.edited}
									<span class="edited-indicator">(edited)</span>
								{/if}
							</span>
						</div>

						{#if editingMessageId === message.id}
							<div class="edit-container">
								<textarea
									bind:value={editingMessageContent}
									class="edit-input"
									rows="2"
									placeholder="Edit your message..."
								/>
								<div class="edit-actions">
									<button class="edit-btn save" on:click={saveEdit}>Save</button>
									<button class="edit-btn cancel" on:click={cancelEdit}>Cancel</button>
								</div>
							</div>
						{:else}
							<div class="message-text">{message.message}</div>
						{/if}

						{#if message.userId === currentUserId && !editingMessageId}
							<div class="message-actions">
								<button class="action-btn" on:click={() => startEdit(message)}>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
										<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
									</svg>
									Edit
								</button>
								<button class="action-btn delete" on:click={() => confirmDelete(message.id)}>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<polyline points="3 6 5 6 21 6"/>
										<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
									</svg>
									Delete
								</button>
							</div>
						{/if}
					</div>
				</div>

				{#if showDeleteConfirm === message.id}
					<div class="delete-confirm">
						<span>Delete this message?</span>
						<div class="confirm-actions">
							<button class="confirm-btn delete" on:click={() => deleteMessage(message.id)}>Delete</button>
							<button class="confirm-btn cancel" on:click={cancelDelete}>Cancel</button>
						</div>
					</div>
				{/if}
			{/each}
		{/if}
	</div>

	<div class="chat-input-container">
		{#if $authStore.isAuthenticated}
			<textarea
				bind:value={messageInput}
				on:keydown={handleKeyDown}
				class="chat-input"
				placeholder="Type your message... (Press Enter to send)"
				rows="2"
			/>
			<button class="send-btn" on:click={handleSendMessage} disabled={!messageInput.trim()}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="22" y1="2" x2="11" y2="13"/>
					<polygon points="22 2 15 22 11 13 2 9 22 2"/>
				</svg>
				Send
			</button>
		{:else}
			<div class="login-prompt">
				<p>Please log in to join the discussion</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.chat-container {
		display: flex;
		flex-direction: column;
		height: 600px;
		background: #000000;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		overflow: hidden;
	}

	.chat-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 20px;
		border-bottom: 1px solid #2A2F45;
		background: rgba(26, 32, 53, 0.5);
	}

	.chat-header h3 {
		font-size: 16px;
		font-weight: 600;
		color: #E8E8E8;
		margin: 0;
	}

	.message-count {
		font-size: 12px;
		color: #8B92AB;
		font-weight: 500;
	}

	.messages-container {
		flex: 1;
		overflow-y: auto;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.messages-container::-webkit-scrollbar {
		width: 8px;
	}

	.messages-container::-webkit-scrollbar-track {
		background: #0A0E1A;
		border-radius: 4px;
	}

	.messages-container::-webkit-scrollbar-thumb {
		background: #2A2F45;
		border-radius: 4px;
	}

	.messages-container::-webkit-scrollbar-thumb:hover {
		background: #3A3F55;
	}

	.empty-chat {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #8B92AB;
		gap: 12px;
		text-align: center;
	}

	.empty-chat svg {
		opacity: 0.5;
	}

	.empty-chat p {
		font-size: 16px;
		font-weight: 600;
		margin: 0;
	}

	.empty-chat span {
		font-size: 13px;
		opacity: 0.8;
	}

	.message {
		display: flex;
		gap: 12px;
		animation: slideIn 0.2s ease-out;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.message-avatar {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		overflow: hidden;
		cursor: pointer;
		border: 2px solid transparent;
		transition: all 0.2s;
		background: none;
		padding: 0;
	}

	.message-avatar:hover {
		border-color: #F97316;
		transform: scale(1.05);
	}

	.message-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, #F97316, #ea580c);
		color: white;
		font-weight: 700;
		font-size: 14px;
	}

	.message-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	.message-header {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}

	.message-author {
		font-size: 14px;
		font-weight: 600;
		color: #E8E8E8;
		cursor: pointer;
		transition: color 0.2s;
		background: none;
		border: none;
		padding: 0;
		font-family: inherit;
	}

	.message-author:hover {
		color: #F97316;
		text-decoration: underline;
	}

	.message-time {
		font-size: 11px;
		color: #666;
	}

	.edited-indicator {
		font-style: italic;
		margin-left: 4px;
	}

	.message-text {
		font-size: 14px;
		color: #CCCCCC;
		line-height: 1.5;
		word-wrap: break-word;
		white-space: pre-wrap;
	}

	.message.own-message .message-text {
		color: #E8E8E8;
	}

	.message-actions {
		display: flex;
		gap: 8px;
		margin-top: 4px;
		opacity: 0;
		transition: opacity 0.2s;
	}

	.message:hover .message-actions {
		opacity: 1;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: transparent;
		border: 1px solid #2A2F45;
		border-radius: 4px;
		color: #8B92AB;
		font-size: 11px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.action-btn:hover {
		background: rgba(249, 115, 22, 0.1);
		border-color: #F97316;
		color: #F97316;
	}

	.action-btn.delete:hover {
		background: rgba(255, 107, 107, 0.1);
		border-color: #FF6B6B;
		color: #FF6B6B;
	}

	.edit-container {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.edit-input {
		width: 100%;
		padding: 8px 12px;
		background: #0A0E1A;
		border: 1px solid #2A2F45;
		border-radius: 6px;
		color: #E8E8E8;
		font-size: 14px;
		font-family: inherit;
		resize: vertical;
		min-height: 60px;
	}

	.edit-input:focus {
		outline: none;
		border-color: #F97316;
	}

	.edit-actions {
		display: flex;
		gap: 8px;
	}

	.edit-btn {
		padding: 6px 12px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
	}

	.edit-btn.save {
		background: #F97316;
		color: white;
	}

	.edit-btn.save:hover {
		background: #ea580c;
	}

	.edit-btn.cancel {
		background: #2A2F45;
		color: #8B92AB;
	}

	.edit-btn.cancel:hover {
		background: #3A3F55;
	}

	.delete-confirm {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px;
		background: rgba(255, 107, 107, 0.1);
		border: 1px solid #FF6B6B;
		border-radius: 8px;
		margin-left: 48px;
		animation: slideIn 0.2s ease-out;
	}

	.delete-confirm span {
		font-size: 13px;
		color: #E8E8E8;
		font-weight: 500;
	}

	.confirm-actions {
		display: flex;
		gap: 8px;
	}

	.confirm-btn {
		padding: 6px 12px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
	}

	.confirm-btn.delete {
		background: #FF6B6B;
		color: white;
	}

	.confirm-btn.delete:hover {
		background: #FF5555;
	}

	.confirm-btn.cancel {
		background: #2A2F45;
		color: #8B92AB;
	}

	.confirm-btn.cancel:hover {
		background: #3A3F55;
	}

	.chat-input-container {
		padding: 16px 20px;
		border-top: 1px solid #2A2F45;
		background: rgba(26, 32, 53, 0.5);
		display: flex;
		gap: 12px;
		align-items: flex-end;
	}

	.chat-input {
		flex: 1;
		padding: 10px 14px;
		background: #0A0E1A;
		border: 1px solid #2A2F45;
		border-radius: 8px;
		color: #E8E8E8;
		font-size: 14px;
		font-family: inherit;
		resize: none;
		min-height: 44px;
		max-height: 120px;
	}

	.chat-input:focus {
		outline: none;
		border-color: #F97316;
	}

	.chat-input::placeholder {
		color: #666;
	}

	.send-btn {
		padding: 10px 20px;
		background: #F97316;
		border: none;
		border-radius: 8px;
		color: white;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
	}

	.send-btn:hover:not(:disabled) {
		background: #ea580c;
		transform: translateY(-1px);
	}

	.send-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.login-prompt {
		flex: 1;
		text-align: center;
		padding: 12px;
	}

	.login-prompt p {
		margin: 0;
		color: #8B92AB;
		font-size: 13px;
	}

	/* Light mode */
	:global(.light-mode) .chat-container {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .chat-header {
		background: #F5F5F5;
		border-bottom-color: #E0E0E0;
	}

	:global(.light-mode) .chat-header h3,
	:global(.light-mode) .message-author,
	:global(.light-mode) .message-text {
		color: #1A1A1A;
	}

	:global(.light-mode) .message-count,
	:global(.light-mode) .empty-chat,
	:global(.light-mode) .action-btn {
		color: #666;
	}

	:global(.light-mode) .messages-container::-webkit-scrollbar-track {
		background: #F5F5F5;
	}

	:global(.light-mode) .messages-container::-webkit-scrollbar-thumb {
		background: #CCC;
	}

	:global(.light-mode) .chat-input,
	:global(.light-mode) .edit-input {
		background: #FFFFFF;
		border-color: #E0E0E0;
		color: #1A1A1A;
	}

	:global(.light-mode) .chat-input-container {
		background: #F5F5F5;
		border-top-color: #E0E0E0;
	}

	:global(.light-mode) .action-btn {
		border-color: #E0E0E0;
	}

	:global(.light-mode) .action-btn:hover {
		background: rgba(249, 115, 22, 0.1);
		border-color: #00B570;
		color: #00B570;
	}

	:global(.light-mode) .send-btn {
		background: #00B570;
	}

	:global(.light-mode) .send-btn:hover:not(:disabled) {
		background: #009560;
	}
</style>
