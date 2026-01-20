<script lang="ts">
	export let distribution: {
		buckets: Array<{ min: number; max: number; count: number; trades: number[] }>;
		stats: {
			winCount: number;
			lossCount: number;
			breakEvenCount: number;
			avgWin: number;
			avgLoss: number;
			largestWin: number;
			largestLoss: number;
			median: number;
			mean: number;
		} | null;
	};

	$: maxCount = distribution.buckets.length > 0 ? Math.max(...distribution.buckets.map(d => d.count)) : 1;
	$: totalTrades = distribution.stats ? distribution.stats.winCount + distribution.stats.lossCount + distribution.stats.breakEvenCount : 0;
</script>

<div class="pnl-distribution-section">
	<div class="section-header">
		<h3>P&L Distribution</h3>
		<p class="section-description">Distribution of trade outcomes showing win/loss patterns</p>
	</div>

	{#if distribution.buckets.length === 0}
		<div class="no-data">No trade data available</div>
	{:else}
		<!-- Statistics Overview -->
		{#if distribution.stats}
			<div class="stats-overview">
				<div class="stat-card">
					<div class="stat-label">Win Rate</div>
					<div class="stat-value positive">
						{((distribution.stats.winCount / totalTrades) * 100).toFixed(1)}%
					</div>
					<div class="stat-sublabel">
						{distribution.stats.winCount} / {totalTrades} trades
					</div>
				</div>

				<div class="stat-card">
					<div class="stat-label">Avg Win</div>
					<div class="stat-value positive">+{distribution.stats.avgWin.toFixed(2)}%</div>
					<div class="stat-sublabel">Mean winning trade</div>
				</div>

				<div class="stat-card">
					<div class="stat-label">Avg Loss</div>
					<div class="stat-value negative">{distribution.stats.avgLoss.toFixed(2)}%</div>
					<div class="stat-sublabel">Mean losing trade</div>
				</div>

				<div class="stat-card">
					<div class="stat-label">Profit Factor</div>
					<div class="stat-value" class:positive={Math.abs(distribution.stats.avgWin * distribution.stats.winCount / (distribution.stats.avgLoss * distribution.stats.lossCount)) > 1}>
						{distribution.stats.lossCount > 0
							? Math.abs(distribution.stats.avgWin * distribution.stats.winCount / (distribution.stats.avgLoss * distribution.stats.lossCount)).toFixed(2)
							: '∞'}
					</div>
					<div class="stat-sublabel">Risk/reward ratio</div>
				</div>

				<div class="stat-card">
					<div class="stat-label">Best Trade</div>
					<div class="stat-value positive">+{distribution.stats.largestWin.toFixed(2)}%</div>
					<div class="stat-sublabel">Largest single win</div>
				</div>

				<div class="stat-card">
					<div class="stat-label">Worst Trade</div>
					<div class="stat-value negative">{distribution.stats.largestLoss.toFixed(2)}%</div>
					<div class="stat-sublabel">Largest single loss</div>
				</div>
			</div>
		{/if}

		<!-- Histogram -->
		<div class="histogram-container">
			<div class="histogram">
				{#each distribution.buckets as bucket, i}
					<div class="bar-wrapper">
						<div class="bar-container">
							<div
								class="bar"
								class:positive={bucket.min >= 0}
								class:negative={bucket.max < 0}
								class:mixed={bucket.min < 0 && bucket.max >= 0}
								style="height: {bucket.count > 0 ? (bucket.count / maxCount) * 100 : 0}%"
								title="{bucket.min.toFixed(1)}% to {bucket.max.toFixed(1)}%: {bucket.count} trade{bucket.count !== 1 ? 's' : ''}"
							>
								{#if bucket.count > 0}
									<span class="bar-count">{bucket.count}</span>
								{/if}
							</div>
						</div>
						<div class="bar-label">
							{bucket.min.toFixed(0)}
						</div>
					</div>
				{/each}
			</div>

			<!-- X-axis labels -->
			<div class="axis-labels">
				<span class="axis-label-start">P&L %</span>
			</div>

			<!-- Zero line indicator -->
			{#if distribution.stats && distribution.stats.largestLoss < 0 && distribution.stats.largestWin > 0}
				<div class="zero-line-label">0% (Break Even)</div>
			{/if}
		</div>

		<!-- Legend -->
		<div class="legend">
			<div class="legend-item">
				<span class="legend-box negative"></span>
				<span>Losses ({distribution.stats?.lossCount || 0})</span>
			</div>
			<div class="legend-item">
				<span class="legend-box mixed"></span>
				<span>Mixed ({distribution.stats?.breakEvenCount || 0})</span>
			</div>
			<div class="legend-item">
				<span class="legend-box positive"></span>
				<span>Wins ({distribution.stats?.winCount || 0})</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.pnl-distribution-section {
		background: #000000;
		border-radius: 12px;
		padding: 32px;
		margin: 24px 0;
		border: 1px solid #FFFFFF;
	}

	.section-header {
		margin-bottom: 28px;
		text-align: center;
	}

	h3 {
		color: white;
		font-size: 20px;
		font-weight: 700;
		margin: 0 0 8px 0;
		letter-spacing: -0.02em;
	}

	.section-description {
		color: #9ca3af;
		font-size: 14px;
		margin: 0;
	}

	.no-data {
		text-align: center;
		color: #6b7280;
		padding: 60px 20px;
		font-size: 14px;
	}

	/* Statistics Overview */
	.stats-overview {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 16px;
		margin-bottom: 32px;
		padding-bottom: 24px;
		border-bottom: 1px solid #404040;
	}

	.stat-card {
		background: #000000;
		padding: 16px;
		border-radius: 8px;
		border: 1px solid #FFFFFF;
	}

	.stat-label {
		font-size: 12px;
		color: #9ca3af;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 8px;
	}

	.stat-value {
		font-size: 24px;
		font-weight: 700;
		color: white;
		margin-bottom: 4px;
		line-height: 1.2;
	}

	.stat-value.positive {
		color: #10b981;
	}

	.stat-value.negative {
		color: #ef4444;
	}

	.stat-sublabel {
		font-size: 11px;
		color: #6b7280;
	}

	/* Histogram */
	.histogram-container {
		position: relative;
		margin-bottom: 20px;
	}

	.histogram {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		height: 300px;
		gap: 2px;
		padding: 20px 0;
		border-bottom: 2px solid #404040;
	}

	.bar-wrapper {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
		justify-content: flex-end;
	}

	.bar-container {
		width: 100%;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		height: 100%;
	}

	.bar {
		width: 100%;
		min-height: 2px;
		border-radius: 4px 4px 0 0;
		position: relative;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 8px;
		cursor: pointer;
	}

	.bar.positive {
		background: #10b981;
	}

	.bar.negative {
		background: #ef4444;
	}

	.bar.mixed {
		background: #6b7280;
	}

	.bar-count {
		font-size: 12px;
		font-weight: 700;
		color: white;
		text-shadow: 0 1px 3px rgba(0,0,0,0.5);
	}

	.bar-label {
		font-size: 11px;
		color: #6b7280;
		margin-top: 8px;
		white-space: nowrap;
		text-align: center;
		font-weight: 500;
	}

	.axis-labels {
		display: flex;
		justify-content: center;
		margin-top: 12px;
	}

	.axis-label-start {
		font-size: 12px;
		color: #9ca3af;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.zero-line-label {
		position: absolute;
		left: 50%;
		bottom: -8px;
		transform: translateX(-50%);
		font-size: 11px;
		color: #6b7280;
		background: #000000;
		padding: 2px 8px;
		border-radius: 4px;
	}

	/* Legend */
	.legend {
		display: flex;
		justify-content: center;
		gap: 32px;
		margin-top: 24px;
		padding-top: 20px;
		border-top: 1px solid #404040;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 13px;
		color: #d1d5db;
		font-weight: 500;
	}

	.legend-box {
		width: 20px;
		height: 20px;
		border-radius: 4px;
	}

	.legend-box.positive {
		background: #10b981;
	}

	.legend-box.negative {
		background: #ef4444;
	}

	.legend-box.mixed {
		background: #6b7280;
	}

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.stats-overview {
			grid-template-columns: repeat(2, 1fr);
		}

		.histogram {
			height: 250px;
		}

		.legend {
			flex-direction: column;
			gap: 12px;
			align-items: center;
		}
	}
</style>
