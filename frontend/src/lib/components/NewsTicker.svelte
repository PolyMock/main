<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	interface NewsItem {
		title: string;
		link?: string;
		image_url?: string;
	}

	let newsItems: NewsItem[] = [];
	let loading = true;
	let tickerElement: HTMLDivElement;

	async function fetchTickerNews() {
		try {
			// Fetch business, tech, and science news
			const categories = ['business', 'technology', 'science'];
			const allNews: NewsItem[] = [];

			for (const category of categories) {
				const response = await fetch(`/api/newsdata?category=${category}&language=en`);
				if (response.ok) {
					const data = await response.json();
					if (data.results && Array.isArray(data.results)) {
						const categoryNews = data.results
							.slice(0, 5) // Take top 5 from each category
							.map((item: any) => ({
								title: item.title,
								link: item.link,
								image_url: item.image_url || null
							}));
						allNews.push(...categoryNews);
					}
				}
			}

			if (allNews.length > 0) {
				newsItems = allNews;
			} else {
				// Fallback news if API fails
				newsItems = [
					{ title: 'Markets update in real-time' },
					{ title: 'Trade prediction markets with confidence' }
				];
			}
		} catch (error) {
			console.error('Error fetching ticker news:', error);
			newsItems = [
				{ title: 'Welcome to PolyMock' },
				{ title: 'Real-time prediction markets' }
			];
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		fetchTickerNews();
		// Refresh news every 10 minutes
		const interval = setInterval(fetchTickerNews, 10 * 60 * 1000);
		return () => clearInterval(interval);
	});
</script>

<div class="news-ticker">
	{#if loading}
		<div class="ticker-content">
			<span class="news-item">Loading news...</span>
		</div>
	{:else}
		<div class="ticker-content" bind:this={tickerElement}>
			{#each newsItems as item}
				<span class="news-item">
					{#if item.image_url}
						<img src={item.image_url} alt="" class="news-image" />
					{/if}
					<span class="bullet">•</span>
					{item.title}
				</span>
			{/each}
			<!-- Duplicate for seamless loop -->
			{#each newsItems as item}
				<span class="news-item">
					{#if item.image_url}
						<img src={item.image_url} alt="" class="news-image" />
					{/if}
					<span class="bullet">•</span>
					{item.title}
				</span>
			{/each}
		</div>
	{/if}
</div>

<style>
	.news-ticker {
		flex: 1;
		overflow: hidden;
		background: #000000;
		border: 1px solid #404040;
		border-radius: 8px;
		padding: 8px 12px;
		position: relative;
		height: 40px;
		display: flex;
		align-items: center;
		pointer-events: none;
		user-select: none;
	}

	.ticker-content {
		display: flex;
		gap: 40px;
		white-space: nowrap;
		animation: scroll 60s linear infinite;
		will-change: transform;
	}

	@keyframes scroll {
		0% {
			transform: translateX(0);
		}
		100% {
			transform: translateX(-50%);
		}
	}

	.news-item {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: #E8E8E8;
		font-weight: 500;
	}

	.news-image {
		width: 28px;
		height: 28px;
		object-fit: cover;
		border-radius: 4px;
		border: 1px solid #404040;
		flex-shrink: 0;
	}

	.bullet {
		color: #F97316;
		font-size: 14px;
		font-weight: bold;
	}
</style>
