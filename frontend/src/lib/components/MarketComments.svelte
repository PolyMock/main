<script lang="ts">
	import { walletStore } from '$lib/wallet/stores';

	export let marketId: string;

	interface Comment {
		id: string;
		address: string;
		text: string;
		timestamp: Date;
		replyTo?: string; // ID of the comment being replied to
	}

	let comments: Comment[] = [];
	let newComment = '';
	let replyingTo: string | null = null;
	let replyingToText = '';
	let walletState = $walletStore;

	// Subscribe to wallet state
	walletStore.subscribe(value => {
		walletState = value;
	});

	// Load comments from localStorage
	function loadComments() {
		const stored = localStorage.getItem(`comments_${marketId}`);
		if (stored) {
			const parsed = JSON.parse(stored);
			comments = parsed.map((c: any) => ({
				...c,
				timestamp: new Date(c.timestamp)
			}));
		}
	}

	// Save comments to localStorage
	function saveComments() {
		localStorage.setItem(`comments_${marketId}`, JSON.stringify(comments));
	}

	// Post a new comment
	function postComment() {
		if (!newComment.trim() || !walletState.connected || !walletState.publicKey) {
			return;
		}

		const comment: Comment = {
			id: Date.now().toString(),
			address: walletState.publicKey.toString(),
			text: newComment.trim(),
			timestamp: new Date(),
			replyTo: replyingTo || undefined
		};

		comments = [comment, ...comments];
		saveComments();
		newComment = '';
		replyingTo = null;
		replyingToText = '';
	}

	// Start replying to a comment
	function startReply(comment: Comment) {
		replyingTo = comment.id;
		replyingToText = `${comment.address.slice(0, 6)}...${comment.address.slice(-4)}`;
		// Focus the input
		const textarea = document.querySelector('.comment-input') as HTMLTextAreaElement;
		if (textarea) textarea.focus();
	}

	// Cancel reply
	function cancelReply() {
		replyingTo = null;
		replyingToText = '';
	}

	// Delete a comment
	function deleteComment(commentId: string) {
		if (!walletState.publicKey) return;

		const comment = comments.find(c => c.id === commentId);
		if (comment && comment.address === walletState.publicKey.toString()) {
			comments = comments.filter(c => c.id !== commentId);
			saveComments();
		}
	}

	// Get the parent comment for a reply
	function getParentComment(replyToId: string): Comment | undefined {
		return comments.find(c => c.id === replyToId);
	}

	// Get first letter of address for avatar
	function getAvatar(address: string): string {
		return address.charAt(0).toUpperCase();
	}

	// Format timestamp
	function formatTime(date: Date): string {
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		return `${days}d ago`;
	}

	// Load comments on mount
	loadComments();
</script>

<div class="comments-section">
	<h3 class="comments-title">Comments ({comments.length})</h3>

	<!-- Comment Input -->
	{#if walletState.connected}
		{#if replyingTo}
			<div class="reply-indicator">
				<span>Replying to {replyingToText}</span>
				<button class="cancel-reply" on:click={cancelReply}>✕</button>
			</div>
		{/if}
		<div class="comment-input-container">
			<div class="avatar">{getAvatar(walletState.publicKey?.toString() || 'A')}</div>
			<textarea
				bind:value={newComment}
				placeholder={replyingTo ? "Write your reply..." : "Share your thoughts..."}
				class="comment-input"
				rows="3"
				maxlength="500"
			></textarea>
		</div>
		<button
			class="post-button"
			disabled={!newComment.trim()}
			on:click={postComment}
		>
			{replyingTo ? 'Post Reply' : 'Post Comment'}
		</button>
	{:else}
		<div class="connect-prompt">
			<p>Connect your wallet to comment</p>
		</div>
	{/if}

	<!-- Comments List -->
	<div class="comments-list">
		{#if comments.length === 0}
			<div class="empty-comments">
				<p>No comments yet. Be the first to share your thoughts!</p>
			</div>
		{:else}
			{#each comments as comment (comment.id)}
				<div class="comment-item" class:is-reply={comment.replyTo}>
					{#if comment.replyTo}
						{@const parentComment = getParentComment(comment.replyTo)}
						{#if parentComment}
							<div class="reply-context">
								Replying to {parentComment.address.slice(0, 6)}...{parentComment.address.slice(-4)}
							</div>
						{/if}
					{/if}
					<div class="comment-header">
						<div class="avatar">{getAvatar(comment.address)}</div>
						<div class="comment-meta">
							<span class="comment-address">{comment.address.slice(0, 6)}...{comment.address.slice(-4)}</span>
							<span class="comment-time">{formatTime(comment.timestamp)}</span>
						</div>
						<div class="comment-actions">
							<button class="action-btn reply-btn" on:click={() => startReply(comment)}>
								Reply
							</button>
							{#if walletState.publicKey?.toString() === comment.address}
								<button class="action-btn delete-btn" on:click={() => deleteComment(comment.id)}>
									Delete
								</button>
							{/if}
						</div>
					</div>
					<p class="comment-text">{comment.text}</p>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.comments-section {
		padding: 24px;
		border-top: 1px solid #2A2F45;
	}

	.comments-title {
		font-size: 16px;
		font-weight: 700;
		color: #E8E8E8;
		margin: 0 0 16px 0;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.comment-input-container {
		display: flex;
		gap: 12px;
		margin-bottom: 12px;
	}

	.avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: linear-gradient(135deg, #00B4FF 0%, #00D084 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 16px;
		font-weight: 700;
		color: white;
		flex-shrink: 0;
	}

	.comment-input {
		flex: 1;
		background: #0A0E1A;
		border: 1px solid #2A2F45;
		border-radius: 8px;
		padding: 12px;
		color: #E8E8E8;
		font-size: 14px;
		font-family: Inter, sans-serif;
		resize: none;
		transition: border-color 0.2s;
	}

	.comment-input:focus {
		outline: none;
		border-color: #00B4FF;
	}

	.comment-input::placeholder {
		color: #666;
	}

	.post-button {
		background: #00B4FF;
		color: white;
		border: none;
		border-radius: 8px;
		padding: 10px 24px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		align-self: flex-end;
	}

	.post-button:hover:not(:disabled) {
		background: #0094D6;
		transform: translateY(-1px);
	}

	.post-button:disabled {
		background: #2A2F45;
		color: #666;
		cursor: not-allowed;
		transform: none;
	}

	.connect-prompt {
		background: rgba(0, 180, 255, 0.1);
		border: 1px solid rgba(0, 180, 255, 0.3);
		border-radius: 8px;
		padding: 20px;
		text-align: center;
	}

	.connect-prompt p {
		margin: 0;
		color: #00B4FF;
		font-size: 14px;
		font-weight: 500;
	}

	.comments-list {
		margin-top: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.empty-comments {
		background: #0A0E1A;
		border: 1px solid #2A2F45;
		border-radius: 8px;
		padding: 40px;
		text-align: center;
	}

	.empty-comments p {
		margin: 0;
		color: #666;
		font-size: 14px;
	}

	.comment-item {
		background: #0A0E1A;
		border: 1px solid #2A2F45;
		border-radius: 8px;
		padding: 16px;
	}

	.comment-header {
		display: flex;
		gap: 12px;
		margin-bottom: 12px;
	}

	.comment-meta {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.comment-address {
		font-size: 13px;
		font-weight: 600;
		color: #E8E8E8;
	}

	.comment-time {
		font-size: 12px;
		color: #666;
	}

	.comment-text {
		margin: 0;
		font-size: 14px;
		color: #9BA3B4;
		line-height: 1.6;
		word-wrap: break-word;
	}

	.reply-indicator {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: rgba(0, 180, 255, 0.1);
		border: 1px solid rgba(0, 180, 255, 0.3);
		border-radius: 8px;
		padding: 8px 12px;
		margin-bottom: 12px;
		font-size: 13px;
		color: #00B4FF;
	}

	.cancel-reply {
		background: none;
		border: none;
		color: #00B4FF;
		cursor: pointer;
		font-size: 18px;
		padding: 0 4px;
		line-height: 1;
		transition: color 0.2s;
	}

	.cancel-reply:hover {
		color: #FF6B6B;
	}

	.comment-actions {
		display: flex;
		gap: 8px;
		margin-left: auto;
	}

	.action-btn {
		background: none;
		border: 1px solid #2A2F45;
		color: #9BA3B4;
		padding: 4px 12px;
		border-radius: 4px;
		font-size: 12px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.reply-btn:hover {
		border-color: #00B4FF;
		color: #00B4FF;
		background: rgba(0, 180, 255, 0.1);
	}

	.delete-btn:hover {
		border-color: #FF6B6B;
		color: #FF6B6B;
		background: rgba(255, 107, 107, 0.1);
	}

	.comment-item.is-reply {
		margin-left: 40px;
		border-left: 2px solid #00B4FF;
	}

	.reply-context {
		font-size: 12px;
		color: #666;
		margin-bottom: 8px;
		font-style: italic;
	}
</style>
