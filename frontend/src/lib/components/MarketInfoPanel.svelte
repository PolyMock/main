<script lang="ts">
	import type { PolyMarket } from '$lib/polymarket';

	export let market: PolyMarket;

	function formatPrice(price: number): string {
		return `$${price.toFixed(4)}`;
	}

	function formatPercentage(price: number): string {
		return `${(price * 100).toFixed(2)}%`;
	}

	function formatVolume(volume: number): string {
		if (volume >= 1000000) {
			return `$${(volume / 1000000).toFixed(1)}M`;
		} else if (volume >= 1000) {
			return `$${(volume / 1000).toFixed(0)}K`;
		}
		return `$${volume.toFixed(0)}`;
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function getMarketStatus(): { status: string; color: string } {
		if (market.resolvedBy) {
			return { status: 'Resolved', color: '#A0A0A0' };
		} else if (market.active) {
			return { status: 'Active', color: '#00D084' };
		} else {
			return { status: 'Inactive', color: '#FF4757' };
		}
	}

	$: marketStatus = getMarketStatus();
	$: yesPrice = market.yesPrice || 0;
	$: noPrice = market.noPrice || 0;
	$: volume24h = market.volume_24hr || market.volume || 0;
	$: liquidity = market.liquidity || 0;
</script>

<div class="market-info-panel">
	<!-- Market Information Header -->
	<div class="panel-section">
		<h3 class="section-title">Market Information</h3>
	</div>

	<!-- Current Prices -->
	<div class="panel-section">
		<div class="price-display">
			<div class="price-box yes-price">
				<div class="price-label">YES Price</div>
				<div class="price-value">{formatPrice(yesPrice)}</div>
				<div class="price-percentage">({formatPercentage(yesPrice)})</div>
			</div>
			
			<div class="price-box no-price">
				<div class="price-label">NO Price</div>
				<div class="price-value">{formatPrice(noPrice)}</div>
				<div class="price-percentage">({formatPercentage(noPrice)})</div>
			</div>
		</div>
	</div>

	<!-- Market Stats -->
	<div class="panel-section">
		<div class="stats-grid">
			<div class="stat-item">
				<div class="stat-label">24h Volume</div>
				<div class="stat-value">{formatVolume(volume24h)}</div>
			</div>
			
			{#if liquidity > 0}
				<div class="stat-item">
					<div class="stat-label">Liquidity</div>
					<div class="stat-value">{formatVolume(liquidity)}</div>
				</div>
			{/if}
			
			<div class="stat-item">
				<div class="stat-label">Resolves</div>
				<div class="stat-value">
					{market.end_date_iso ? formatDate(market.end_date_iso) : 'TBD'}
				</div>
			</div>
			
			<div class="stat-item">
				<div class="stat-label">Status</div>
				<div class="stat-value" style="color: {marketStatus.color}">
					{marketStatus.status}
				</div>
			</div>
		</div>
	</div>

	<!-- Market Description -->
	{#if market.description}
		<div class="panel-section">
			<h4 class="subsection-title">Description</h4>
			<div class="market-description">
				{market.description}
			</div>
		</div>
	{/if}

	<!-- Trade Buttons -->
	<div class="panel-section">
		<div class="trade-buttons">
			<button class="trade-btn yes-btn">
				<div class="btn-label">Trade YES</div>
				<div class="btn-price">{formatPrice(yesPrice)}</div>
			</button>
			
			<button class="trade-btn no-btn">
				<div class="btn-label">Trade NO</div>
				<div class="btn-price">{formatPrice(noPrice)}</div>
			</button>
		</div>
	</div>

	<!-- Market Categories -->
	{#if market.tags && market.tags.length > 0}
		<div class="panel-section">
			<h4 class="subsection-title">Categories</h4>
			<div class="market-tags">
				{#each market.tags.slice(0, 4) as tag}
					<span class="tag">{tag}</span>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.market-info-panel {
		background: #000000;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		display: flex;
		flex-direction: column;
		height: fit-content;
		min-height: 600px;
	}

	.panel-section {
		padding: 20px 24px;
		border-bottom: 1px solid #2A2F45;
	}

	.panel-section:last-child {
		border-bottom: none;
	}

	.section-title {
		color: #E8E8E8;
		font-size: 16px;
		font-weight: 600;
		margin: 0;
	}

	.subsection-title {
		color: #E8E8E8;
		font-size: 14px;
		font-weight: 600;
		margin: 0 0 12px 0;
	}

	.price-display {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.price-box {
		padding: 16px;
		border-radius: 8px;
		border: 1px solid;
		text-align: center;
	}

	.yes-price {
		border-color: #00D084;
		background: rgba(0, 208, 132, 0.05);
	}

	.no-price {
		border-color: #FF4757;
		background: rgba(255, 71, 87, 0.05);
	}

	.price-label {
		color: #A0A0A0;
		font-size: 11px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 4px;
	}

	.yes-price .price-label {
		color: #00D084;
	}

	.no-price .price-label {
		color: #FF4757;
	}

	.price-value {
		font-size: 24px;
		font-weight: 700;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		margin-bottom: 2px;
	}

	.yes-price .price-value {
		color: #00D084;
	}

	.no-price .price-value {
		color: #FF4757;
	}

	.price-percentage {
		color: #A0A0A0;
		font-size: 12px;
		font-weight: 500;
	}

	.stats-grid {
		display: grid;
		gap: 16px;
	}

	.stat-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 0;
	}

	.stat-label {
		color: #A0A0A0;
		font-size: 12px;
		font-weight: 400;
	}

	.stat-value {
		color: #E8E8E8;
		font-size: 14px;
		font-weight: 600;
		text-align: right;
	}

	.market-description {
		color: #A0A0A0;
		font-size: 13px;
		line-height: 1.5;
		max-height: 120px;
		overflow-y: auto;
	}

	.trade-buttons {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.trade-btn {
		width: 100%;
		padding: 14px 16px;
		border-radius: 8px;
		border: 1px solid;
		cursor: pointer;
		transition: all 200ms ease-out;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}

	.yes-btn {
		background: #00D084;
		border-color: #00D084;
		color: #ffffff;
	}

	.yes-btn:hover {
		background: #00B570;
		border-color: #00B570;
		transform: scale(1.02);
	}

	.no-btn {
		background: #FF4757;
		border-color: #FF4757;
		color: #ffffff;
	}

	.no-btn:hover {
		background: #e63946;
		border-color: #e63946;
		transform: scale(1.02);
	}

	.btn-label {
		font-size: 14px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.btn-price {
		font-size: 16px;
		font-weight: 600;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
	}

	.market-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.tag {
		background: #1E2139;
		color: #A0A0A0;
		padding: 6px 12px;
		border-radius: 16px;
		font-size: 11px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		border: 1px solid #2A2F45;
	}

	/* Mobile responsive */
	@media (max-width: 768px) {
		.panel-section {
			padding: 16px 20px;
		}
		
		.price-value {
			font-size: 20px;
		}
		
		.trade-btn {
			padding: 12px 16px;
		}
	}
</style>