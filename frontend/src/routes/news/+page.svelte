<script lang="ts">
	import { onMount } from 'svelte';

	type NewsArticle = {
		id: string;
		title: string;
		body: string;
		url: string;
		source: string;
		published_on: number;
		imageurl?: string;
		tags?: string;
		categories?: string;
	};

	let news: NewsArticle[] = [];
	let selectedArticle: NewsArticle | null = null;
	let newsLoading = true;
	let articleLoading = false;

	async function fetchNews() {
		newsLoading = true;
		try {
			const response = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=BTC,ETH,SOL');

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();

			if (data.Data && data.Data.length > 0) {
				news = data.Data.slice(0, 50);
				// Auto-select the first article
				if (news.length > 0 && !selectedArticle) {
					selectedArticle = news[0];
				}
			}
		} catch (error) {
			console.error('Error fetching news:', error);
			news = [];
		} finally {
			newsLoading = false;
		}
	}

	function selectArticle(article: NewsArticle) {
		articleLoading = true;
		selectedArticle = article;
		// Simulate loading delay for smooth transition
		setTimeout(() => {
			articleLoading = false;
		}, 200);
	}

	function formatDate(timestamp: number): string {
		const date = new Date(timestamp * 1000);
		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	onMount(() => {
		fetchNews();
		// Refresh news every 5 minutes
		const interval = setInterval(fetchNews, 300000);
		return () => clearInterval(interval);
	});
</script>

<div class="news-page">
	<div class="news-list-panel">
		<div class="panel-header">
			<h2>CRYPTO NEWS</h2>
			<span class="news-count">{news.length} Articles</span>
		</div>
		<div class="news-list">
			{#if newsLoading}
				<div class="loading-state">Loading news from CryptoCompare API...</div>
			{:else if news.length === 0}
				<div class="error-state">Failed to load news. Please try again later.</div>
			{:else}
				{#each news as article}
					<button
						class="news-item"
						class:active={selectedArticle?.id === article.id}
						on:click={() => selectArticle(article)}
					>
						<div class="news-meta">
							<span class="news-time">{formatDate(article.published_on)}</span>
							<span class="news-source">{article.source}</span>
						</div>
						<div class="news-title">{article.title}</div>
						{#if article.tags}
							<div class="news-tags">
								{#each article.tags.split('|').slice(0, 3) as tag}
									<span class="tag">{tag}</span>
								{/each}
							</div>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	</div>

	<div class="article-viewer-panel">
		{#if articleLoading}
			<div class="loading-state">Loading article...</div>
		{:else if selectedArticle}
			<div class="article-content">
				<div class="article-header">
					{#if selectedArticle.imageurl}
						<img src={selectedArticle.imageurl} alt={selectedArticle.title} class="article-image" />
					{/if}
					<h1 class="article-title">{selectedArticle.title}</h1>
					<div class="article-meta">
						<span class="article-source">{selectedArticle.source}</span>
						<span class="article-date">{formatDate(selectedArticle.published_on)}</span>
					</div>
				</div>

				<div class="article-body">
					<p>{selectedArticle.body}</p>
				</div>

				{#if selectedArticle.tags}
					<div class="article-tags">
						{#each selectedArticle.tags.split('|') as tag}
							<span class="article-tag">{tag}</span>
						{/each}
					</div>
				{/if}

				<div class="article-footer">
					<a href={selectedArticle.url} target="_blank" rel="noopener noreferrer" class="read-more-btn">
						Read Full Article
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M7 17L17 7M17 7H7M17 7V17"/>
						</svg>
					</a>
				</div>
			</div>
		{:else}
			<div class="empty-state">
				<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/>
				</svg>
				<p>Select an article to read</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.news-page {
		display: grid;
		grid-template-columns: 400px 1fr;
		gap: 24px;
		padding: 24px;
		min-height: calc(100vh - 64px);
		background: #0A0E27;
	}

	.news-list-panel {
		background: #151B2F;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.panel-header {
		background: transparent;
		color: #E8E8E8;
		padding: 20px 24px;
		border-bottom: 1px solid #2A2F45;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.panel-header h2 {
		font-size: 16px;
		font-weight: 600;
		margin: 0;
		letter-spacing: 0.5px;
	}

	.news-count {
		font-size: 12px;
		color: #A0A0A0;
		background: #1E2139;
		padding: 4px 10px;
		border-radius: 12px;
	}

	.news-list {
		overflow-y: auto;
		flex: 1;
		padding: 16px;
	}

	.loading-state,
	.error-state {
		padding: 40px 20px;
		text-align: center;
		color: #666;
		font-size: 14px;
	}

	.error-state {
		color: #ff0000;
	}

	.news-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 16px;
		margin-bottom: 12px;
		background: transparent;
		border: 1px solid #2A2F45;
		border-radius: 8px;
		transition: all 200ms ease-out;
		cursor: pointer;
		color: inherit;
		font-family: inherit;
	}

	.news-item:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: #3A4055;
		transform: translateX(4px);
	}

	.news-item.active {
		background: rgba(0, 208, 132, 0.1);
		border-color: #00D084;
	}

	.news-meta {
		display: flex;
		gap: 12px;
		margin-bottom: 8px;
		font-size: 11px;
		color: #A0A0A0;
		flex-wrap: wrap;
	}

	.news-time {
		color: #666;
	}

	.news-source {
		color: #00D084;
		font-weight: 600;
	}

	.news-title {
		color: #E8E8E8;
		font-size: 14px;
		line-height: 1.5;
		font-weight: 500;
		margin-bottom: 8px;
	}

	.news-tags {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		margin-top: 8px;
	}

	.tag {
		background: #1E2139;
		color: #A0A0A0;
		padding: 3px 8px;
		border-radius: 4px;
		font-size: 10px;
		font-weight: 500;
	}

	.article-viewer-panel {
		background: #151B2F;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		overflow-y: auto;
		padding: 32px;
	}

	.article-content {
		max-width: 800px;
		margin: 0 auto;
	}

	.article-header {
		margin-bottom: 32px;
	}

	.article-image {
		width: 100%;
		max-height: 400px;
		object-fit: cover;
		border-radius: 12px;
		margin-bottom: 24px;
	}

	.article-title {
		font-size: 32px;
		font-weight: 700;
		color: #E8E8E8;
		line-height: 1.3;
		margin: 0 0 16px 0;
	}

	.article-meta {
		display: flex;
		gap: 16px;
		align-items: center;
		padding-bottom: 16px;
		border-bottom: 1px solid #2A2F45;
	}

	.article-source {
		color: #00D084;
		font-weight: 600;
		font-size: 14px;
	}

	.article-date {
		color: #A0A0A0;
		font-size: 13px;
	}

	.article-body {
		margin: 32px 0;
		line-height: 1.8;
	}

	.article-body p {
		color: #CCCCCC;
		font-size: 16px;
		margin: 0 0 20px 0;
	}

	.article-tags {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin: 32px 0;
		padding-top: 24px;
		border-top: 1px solid #2A2F45;
	}

	.article-tag {
		background: #1E2139;
		color: #00B4FF;
		padding: 6px 14px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		border: 1px solid #2A2F45;
	}

	.article-footer {
		margin-top: 40px;
		padding-top: 24px;
		border-top: 1px solid #2A2F45;
	}

	.read-more-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 12px 24px;
		background: #00B4FF;
		color: #ffffff;
		text-decoration: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 14px;
		transition: all 200ms ease-out;
	}

	.read-more-btn:hover {
		background: #0088DD;
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 180, 255, 0.3);
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #666;
		gap: 16px;
		padding: 40px;
	}

	.empty-state svg {
		opacity: 0.5;
	}

	.empty-state p {
		font-size: 16px;
		margin: 0;
	}

	@media (max-width: 1024px) {
		.news-page {
			grid-template-columns: 1fr;
			gap: 16px;
			padding: 16px;
		}

		.news-list-panel {
			max-height: 400px;
		}

		.article-viewer-panel {
			padding: 24px 16px;
		}

		.article-title {
			font-size: 24px;
		}
	}

	::-webkit-scrollbar {
		width: 8px;
	}

	::-webkit-scrollbar-track {
		background: #0A0E27;
	}

	::-webkit-scrollbar-thumb {
		background: #2A2F45;
		border-radius: 4px;
	}

	::-webkit-scrollbar-thumb:hover {
		background: #3A4055;
	}
</style>
