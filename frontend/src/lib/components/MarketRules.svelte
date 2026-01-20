<script lang="ts">
	export let event: any;
	export let market: any;
</script>

<div class="rules-section">
	<h3 class="rules-title">Rules</h3>

	<div class="rules-card">
		<div class="rule-item">
			<h4 class="rule-header">Description</h4>
			<p class="rule-text">{event.description || market?.description || 'This market will resolve based on official outcomes.'}</p>
		</div>

		{#if event.resolutionSource || market?.resolutionSource}
			<div class="rule-item">
				<h4 class="rule-header">Resolution Source</h4>
				<p class="rule-text">{event.resolutionSource || market.resolutionSource}</p>
			</div>
		{/if}

		<div class="rule-item">
			<h4 class="rule-header">Market Details</h4>
			<p class="rule-text">
				All trades are final and non-reversible.
				{#if event.endDate || market?.endDate}
					This market closes on {new Date(event.endDate || market.endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
				{/if}
			</p>
		</div>

		{#if event.categories && event.categories.length > 0}
			<div class="rule-item">
				<h4 class="rule-header">Categories</h4>
				<div class="categories">
					{#each event.categories as category}
						<span class="category-tag">{category}</span>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.rules-section {
		padding: 24px;
		border-top: 1px solid #2A2F45;
	}

	.rules-title {
		font-size: 16px;
		font-weight: 700;
		color: #E8E8E8;
		margin: 0 0 16px 0;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.rules-card {
		background: #000000;
		border: 1px solid #404040;
		border-radius: 12px;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.rule-item {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.rule-header {
		font-size: 13px;
		font-weight: 600;
		color: #F97316;
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.rule-text {
		font-size: 14px;
		color: #FFFFFF;
		line-height: 1.6;
		margin: 0;
	}

	.categories {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.category-tag {
		background: rgba(249, 115, 22, 0.1);
		color: #F97316;
		padding: 4px 12px;
		border-radius: 16px;
		font-size: 12px;
		font-weight: 500;
		border: 1px solid rgba(249, 115, 22, 0.2);
	}
</style>
