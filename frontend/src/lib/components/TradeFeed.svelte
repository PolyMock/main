<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { walletStore } from '$lib/wallet/stores';
	import { get } from 'svelte/store';

	type FeedItem = {
		id: string;
		type: 'trade' | 'strategy';
		// Trade fields
		source?: string;
		position_type?: string;
		entry_price?: number;
		exit_price?: number;
		pnl?: number;
		market_title?: string;
		market_id?: string;
		platform?: string;
		pair_index?: number;
		analysis?: string;
		status?: string;
		// Strategy fields
		strategy_name?: string;
		total_return_percent?: number;
		total_trades?: number;
		win_rate?: number;
		initial_capital?: number;
		final_capital?: number;
		// Common
		username: string;
		wallet_address: string;
		likes_count: number;
		comments_count: number;
		created_at: string;
		user_liked: boolean;
	};

	const PAIR_SYMBOLS: Record<number, string> = {
		0: 'SOL/USDT', 1: 'BTC/USDT', 2: 'ETH/USDT', 3: 'AVAX/USDT', 4: 'LINK/USDT'
	};

	let feedItems: FeedItem[] = [];
	let loading = true;
	let activeTab: 'all' | 'trades' | 'strategies' = 'all';
	let commentingOn: string | null = null;
	let commentText = '';
	let comments: Record<string, any[]> = {};
	let loadingComments: Record<string, boolean> = {};
	let submittingComment = false;

	function getCurrentWallet(): string | null {
		const state = get(walletStore);
		return state.publicKey?.toString() || null;
	}

	async function getCurrentUserId(): Promise<string | null> {
		const wallet = getCurrentWallet();
		if (!wallet) return null;
		const { data } = await supabase
			.from('users')
			.select('id')
			.eq('wallet_address', wallet)
			.maybeSingle();
		return data?.id || null;
	}

	async function loadFeed() {
		loading = true;
		const wallet = getCurrentWallet();
		let userId: string | null = null;

		if (wallet) {
			const { data } = await supabase.from('users').select('id').eq('wallet_address', wallet).maybeSingle();
			userId = data?.id || null;
		}

		// Load published trades
		const { data: trades } = await supabase
			.from('trades')
			.select('*, users!inner(username, wallet_address)')
			.eq('is_published', true)
			.order('created_at', { ascending: false })
			.limit(50);

		// Load published strategies
		const { data: strategies } = await supabase
			.from('backtest_strategies')
			.select('*, users!inner(username, wallet_address)')
			.eq('is_published', true)
			.order('created_at', { ascending: false })
			.limit(50);

		// Check which ones the user liked
		let likedTradeIds = new Set<string>();
		let likedStrategyIds = new Set<string>();
		if (userId) {
			const { data: tLikes } = await supabase.from('trade_likes').select('trade_id').eq('user_id', userId);
			const { data: sLikes } = await supabase.from('strategy_likes').select('strategy_id').eq('user_id', userId);
			likedTradeIds = new Set((tLikes || []).map((l: any) => l.trade_id));
			likedStrategyIds = new Set((sLikes || []).map((l: any) => l.strategy_id));
		}

		const tradeItems: FeedItem[] = (trades || []).map((t: any) => ({
			id: t.id,
			type: 'trade' as const,
			source: t.source,
			position_type: t.position_type,
			entry_price: t.entry_price,
			exit_price: t.exit_price,
			pnl: t.pnl,
			market_title: t.market_title,
			market_id: t.market_id,
			platform: t.platform,
			pair_index: t.pair_index,
			analysis: t.analysis,
			status: t.status,
			username: t.users.username,
			wallet_address: t.users.wallet_address,
			likes_count: t.likes_count || 0,
			comments_count: t.comments_count || 0,
			created_at: t.created_at,
			user_liked: likedTradeIds.has(t.id)
		}));

		const strategyItems: FeedItem[] = (strategies || []).map((s: any) => ({
			id: s.id,
			type: 'strategy' as const,
			strategy_name: s.strategy_name,
			total_return_percent: s.total_return_percent,
			total_trades: s.total_trades,
			win_rate: s.win_rate,
			initial_capital: s.initial_capital,
			final_capital: s.final_capital,
			username: s.users.username,
			wallet_address: s.users.wallet_address,
			likes_count: s.likes_count || 0,
			comments_count: s.comments_count || 0,
			created_at: s.created_at,
			user_liked: likedStrategyIds.has(s.id)
		}));

		const all = [...tradeItems, ...strategyItems].sort(
			(a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
		);

		feedItems = all;
		loading = false;
	}

	async function toggleLike(item: FeedItem) {
		const userId = await getCurrentUserId();
		if (!userId) return;

		const table = item.type === 'trade' ? 'trade_likes' : 'strategy_likes';
		const fk = item.type === 'trade' ? 'trade_id' : 'strategy_id';
		const countTable = item.type === 'trade' ? 'trades' : 'backtest_strategies';

		if (item.user_liked) {
			await supabase.from(table).delete().eq(fk, item.id).eq('user_id', userId);
			item.likes_count--;
			item.user_liked = false;
		} else {
			await supabase.from(table).insert({ [fk]: item.id, user_id: userId });
			item.likes_count++;
			item.user_liked = true;
		}

		// Update count on parent
		await supabase.from(countTable).update({ likes_count: item.likes_count }).eq('id', item.id);
		feedItems = feedItems;
	}

	async function loadComments(item: FeedItem) {
		if (commentingOn === item.id) {
			commentingOn = null;
			return;
		}
		commentingOn = item.id;
		commentText = '';
		loadingComments[item.id] = true;

		const table = item.type === 'trade' ? 'trade_comments' : 'strategy_comments';
		const fk = item.type === 'trade' ? 'trade_id' : 'strategy_id';

		const { data } = await supabase
			.from(table)
			.select('*, users!inner(username)')
			.eq(fk, item.id)
			.order('created_at', { ascending: true });

		comments[item.id] = data || [];
		loadingComments[item.id] = false;
	}

	async function submitComment(item: FeedItem) {
		if (!commentText.trim()) return;
		const userId = await getCurrentUserId();
		if (!userId) return;

		submittingComment = true;
		const table = item.type === 'trade' ? 'trade_comments' : 'strategy_comments';
		const fk = item.type === 'trade' ? 'trade_id' : 'strategy_id';
		const countTable = item.type === 'trade' ? 'trades' : 'backtest_strategies';

		const { data: newComment } = await supabase
			.from(table)
			.insert({ [fk]: item.id, user_id: userId, content: commentText.trim() })
			.select('*, users!inner(username)')
			.single();

		if (newComment) {
			if (!comments[item.id]) comments[item.id] = [];
			comments[item.id] = [...comments[item.id], newComment];
			item.comments_count++;
			await supabase.from(countTable).update({ comments_count: item.comments_count }).eq('id', item.id);
			feedItems = feedItems;
		}

		commentText = '';
		submittingComment = false;
	}

	function formatTime(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		const days = Math.floor(hrs / 24);
		return `${days}d ago`;
	}

	function getTradeLabel(item: FeedItem): string {
		if (item.source === 'blockberg') {
			const symbol = item.pair_index != null ? PAIR_SYMBOLS[item.pair_index] || 'UNKNOWN' : '';
			return `${item.position_type} ${symbol}`;
		}
		return `${item.position_type} on ${item.market_title || item.market_id || 'market'}`;
	}

	function getPnlClass(pnl: number | undefined): string {
		if (!pnl) return '';
		return pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
	}

	$: filtered = activeTab === 'all' ? feedItems :
		activeTab === 'trades' ? feedItems.filter(i => i.type === 'trade') :
		feedItems.filter(i => i.type === 'strategy');

	onMount(() => {
		loadFeed();
	});
</script>

<div class="feed-container">
	<div class="feed-header">
		<span class="feed-title">COMMUNITY FEED</span>
		<div class="feed-tabs">
			<button class:active={activeTab === 'all'} on:click={() => activeTab = 'all'}>All</button>
			<button class:active={activeTab === 'trades'} on:click={() => activeTab = 'trades'}>Trades</button>
			<button class:active={activeTab === 'strategies'} on:click={() => activeTab = 'strategies'}>Strategies</button>
		</div>
	</div>

	{#if loading}
		<div class="feed-loading">Loading feed...</div>
	{:else if filtered.length === 0}
		<div class="feed-empty">No posts yet. Be the first to share a trade!</div>
	{:else}
		<div class="feed-list">
			{#each filtered as item (item.id)}
				<div class="feed-card">
					<div class="feed-card-header">
						<span class="feed-author">@{item.username}</span>
						<span class="feed-time">{formatTime(item.created_at)}</span>
					</div>

					{#if item.type === 'trade'}
						<div class="trade-content">
							<div class="trade-badge" class:blockberg={item.source === 'blockberg'} class:polymock={item.source === 'polymock'}>
								{item.source === 'blockberg' ? 'Blockberg' : (item.platform || 'Polymock')}
							</div>
							<div class="trade-info">
								<span class="trade-label">{getTradeLabel(item)}</span>
								{#if item.entry_price != null}
									<span class="trade-prices">
										Entry: ${Number(item.entry_price).toFixed(2)}
										{#if item.exit_price != null}
											→ Exit: ${Number(item.exit_price).toFixed(2)}
										{/if}
									</span>
								{/if}
								{#if item.pnl != null}
									<span class="trade-pnl {getPnlClass(item.pnl)}">
										PnL: {item.pnl >= 0 ? '+' : ''}{Number(item.pnl).toFixed(2)}
									</span>
								{/if}
							</div>
							{#if item.analysis}
								<p class="trade-analysis">{item.analysis}</p>
							{/if}
						</div>
					{:else}
						<div class="strategy-content">
							<div class="strategy-badge">Backtest</div>
							<div class="strategy-info">
								<span class="strategy-name">{item.strategy_name}</span>
								<div class="strategy-stats">
									<span class="stat">
										ROI: <span class={item.total_return_percent && item.total_return_percent >= 0 ? 'pnl-positive' : 'pnl-negative'}>
											{item.total_return_percent?.toFixed(1)}%
										</span>
									</span>
									<span class="stat">Trades: {item.total_trades}</span>
									<span class="stat">Win: {item.win_rate?.toFixed(0)}%</span>
								</div>
							</div>
						</div>
					{/if}

					<div class="feed-actions">
						<button class="action-btn" class:liked={item.user_liked} on:click={() => toggleLike(item)}>
							{item.user_liked ? '&#9829;' : '&#9825;'} {item.likes_count}
						</button>
						<button class="action-btn" class:active-comment={commentingOn === item.id} on:click={() => loadComments(item)}>
							&#128172; {item.comments_count}
						</button>
					</div>

					{#if commentingOn === item.id}
						<div class="comments-section">
							{#if loadingComments[item.id]}
								<div class="comments-loading">Loading...</div>
							{:else}
								{#each (comments[item.id] || []) as comment}
									<div class="comment">
										<span class="comment-author">@{comment.users?.username || 'anon'}</span>
										<span class="comment-text">{comment.content}</span>
										<span class="comment-time">{formatTime(comment.created_at)}</span>
									</div>
								{/each}
							{/if}
							<form class="comment-form" on:submit|preventDefault={() => submitComment(item)}>
								<input
									type="text"
									bind:value={commentText}
									placeholder="Write a comment..."
									maxlength="500"
									disabled={submittingComment}
								/>
								<button type="submit" disabled={submittingComment || !commentText.trim()}>Post</button>
							</form>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.feed-container {
		width: 100%;
	}

	.feed-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 0 12px 0;
	}

	.feed-title {
		font-size: 12px;
		font-weight: 600;
		color: #888;
		letter-spacing: 0.05em;
	}

	.feed-tabs {
		display: flex;
		gap: 4px;
	}

	.feed-tabs button {
		background: transparent;
		border: 1px solid #333;
		color: #888;
		padding: 4px 10px;
		font-size: 11px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.feed-tabs button.active {
		background: #F97316;
		border-color: #F97316;
		color: #fff;
	}

	.feed-loading, .feed-empty {
		color: #666;
		font-size: 13px;
		padding: 24px 0;
		text-align: center;
	}

	.feed-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.feed-card {
		background: #0a0a0a;
		border: 1px solid #222;
		border-radius: 8px;
		padding: 12px;
	}

	.feed-card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
	}

	.feed-author {
		font-size: 13px;
		font-weight: 600;
		color: #F97316;
	}

	.feed-time {
		font-size: 11px;
		color: #555;
	}

	.trade-content, .strategy-content {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.trade-badge, .strategy-badge {
		display: inline-block;
		font-size: 10px;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 4px;
		width: fit-content;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.trade-badge.blockberg {
		background: rgba(139, 92, 246, 0.15);
		color: #8b5cf6;
		border: 1px solid rgba(139, 92, 246, 0.3);
	}

	.trade-badge.polymock {
		background: rgba(249, 115, 22, 0.15);
		color: #F97316;
		border: 1px solid rgba(249, 115, 22, 0.3);
	}

	.strategy-badge {
		background: rgba(0, 208, 132, 0.15);
		color: #00D084;
		border: 1px solid rgba(0, 208, 132, 0.3);
	}

	.trade-info, .strategy-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.trade-label, .strategy-name {
		font-size: 14px;
		font-weight: 600;
		color: #eee;
	}

	.trade-prices {
		font-size: 12px;
		color: #999;
		font-family: 'SF Mono', Consolas, monospace;
	}

	.trade-pnl {
		font-size: 13px;
		font-weight: 700;
		font-family: 'SF Mono', Consolas, monospace;
	}

	.pnl-positive { color: #00D084; }
	.pnl-negative { color: #FF6B6B; }

	.strategy-stats {
		display: flex;
		gap: 12px;
		font-size: 12px;
		color: #999;
	}

	.strategy-stats .stat {
		font-family: 'SF Mono', Consolas, monospace;
	}

	.trade-analysis {
		margin: 4px 0 0 0;
		font-size: 13px;
		color: #aaa;
		line-height: 1.4;
	}

	.feed-actions {
		display: flex;
		gap: 12px;
		margin-top: 10px;
		padding-top: 8px;
		border-top: 1px solid #1a1a1a;
	}

	.action-btn {
		background: transparent;
		border: none;
		color: #666;
		font-size: 13px;
		cursor: pointer;
		padding: 2px 4px;
		transition: color 0.15s;
	}

	.action-btn:hover {
		color: #ccc;
	}

	.action-btn.liked {
		color: #FF6B6B;
	}

	.action-btn.active-comment {
		color: #F97316;
	}

	.comments-section {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid #1a1a1a;
	}

	.comments-loading {
		font-size: 12px;
		color: #555;
		padding: 8px 0;
	}

	.comment {
		padding: 6px 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: baseline;
	}

	.comment-author {
		font-size: 12px;
		font-weight: 600;
		color: #F97316;
	}

	.comment-text {
		font-size: 13px;
		color: #ccc;
	}

	.comment-time {
		font-size: 10px;
		color: #555;
	}

	.comment-form {
		display: flex;
		gap: 6px;
		margin-top: 8px;
	}

	.comment-form input {
		flex: 1;
		background: #000;
		border: 1px solid #333;
		color: #fff;
		padding: 8px 10px;
		font-size: 13px;
		border-radius: 6px;
		outline: none;
	}

	.comment-form input:focus {
		border-color: #F97316;
	}

	.comment-form button {
		background: #F97316;
		color: #fff;
		border: none;
		padding: 8px 14px;
		font-size: 12px;
		font-weight: 600;
		border-radius: 6px;
		cursor: pointer;
	}

	.comment-form button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
