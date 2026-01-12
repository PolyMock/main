<script lang="ts">
	export let distribution: Array<{ min: number; max: number; count: number }> = [];
	export let title: string = 'P&L Distribution';

	$: maxCount = distribution.length > 0 ? Math.max(...distribution.map(d => d.count)) : 1;
</script>

<div class="chart-wrapper">
	<h3>{title}</h3>

	{#if distribution.length === 0}
		<div class="no-data">No trade data available</div>
	{:else}
		<div class="histogram">
			{#each distribution as bucket, i}
				<div class="histogram-bar-wrapper">
					<div class="histogram-bar-container">
						<div
							class="histogram-bar"
							class:positive={bucket.min >= 0}
							class:negative={bucket.max < 0}
							style="height: {(bucket.count / maxCount) * 100}%"
						>
							<span class="bar-count">{bucket.count}</span>
						</div>
					</div>
					{#if i % 2 === 0 || distribution.length <= 6}
						<div class="histogram-label">
							{bucket.min.toFixed(0)}%
						</div>
					{:else}
						<div class="histogram-label-spacer"></div>
					{/if}
				</div>
			{/each}
		</div>

		<div class="chart-footer">
			<div class="footer-label">
				<span class="legend-box negative"></span>
				Losses
			</div>
			<div class="footer-label">
				<span class="legend-box positive"></span>
				Wins
			</div>
		</div>
	{/if}
</div>

<style>
	.chart-wrapper {
		background: #141824;
		border-radius: 12px;
		padding: 24px;
		margin: 20px 0;
	}

	h3 {
		color: white;
		font-size: 18px;
		font-weight: 600;
		margin: 0 0 24px 0;
		text-align: center;
	}

	.no-data {
		text-align: center;
		color: #6b7280;
		padding: 40px;
		font-size: 14px;
	}

	.histogram {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		height: 250px;
		gap: 4px;
		padding: 0 10px;
	}

	.histogram-bar-wrapper {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
		justify-content: flex-end;
	}

	.histogram-bar-container {
		width: 100%;
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}

	.histogram-bar {
		width: 100%;
		min-height: 4px;
		border-radius: 4px 4px 0 0;
		position: relative;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 6px;
	}

	.histogram-bar.positive {
		background: #10b981;
	}

	.histogram-bar.negative {
		background: #ef4444;
	}

	.bar-count {
		font-size: 11px;
		font-weight: 600;
		color: white;
		text-shadow: 0 1px 2px rgba(0,0,0,0.3);
	}

	.histogram-label {
		font-size: 10px;
		color: #9ca3af;
		margin-top: 8px;
		white-space: nowrap;
		text-align: center;
		min-height: 20px;
	}

	.histogram-label-spacer {
		min-height: 20px;
	}

	.chart-footer {
		display: flex;
		justify-content: center;
		gap: 24px;
		margin-top: 30px;
		padding-top: 16px;
		border-top: 1px solid #1e2537;
	}

	.footer-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: #9ca3af;
	}

	.legend-box {
		width: 16px;
		height: 16px;
		border-radius: 3px;
	}

	.legend-box.positive {
		background: #10b981;
	}

	.legend-box.negative {
		background: #ef4444;
	}
</style>
