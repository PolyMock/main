<script lang="ts">
	import { onMount } from 'svelte';

	export let data: any[] = [];
	export let outcome: string = 'Yes';
	export let loading: boolean = false;

	let chartContainer: HTMLDivElement;
	let tooltip: HTMLDivElement;
	let showTooltip = false;
	let tooltipData: any = {};

	$: filteredData = data.filter(d => d.outcome === outcome || !d.outcome);
	$: lineColor = outcome === 'Yes' ? '#00D084' : '#FF4757';

	function formatTimestamp(timestamp: number): string {
		return new Date(timestamp * 1000).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatPrice(price: number): string {
		return `$${price.toFixed(4)}`;
	}

	function formatPercentage(price: number): string {
		return `${(price * 100).toFixed(2)}%`;
	}

	function drawChart() {
		if (!chartContainer || !filteredData.length) return;

		const canvas = chartContainer.querySelector('canvas') as HTMLCanvasElement;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const rect = chartContainer.getBoundingClientRect();
		const padding = { top: 20, right: 50, bottom: 40, left: 60 };
		const chartWidth = rect.width - padding.left - padding.right;
		const chartHeight = rect.height - padding.top - padding.bottom;

		// Set canvas size
		canvas.width = rect.width;
		canvas.height = rect.height;

		// Clear canvas
		ctx.fillStyle = '#151B2F';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Find data bounds
		const prices = filteredData.map(d => d.close);
		const minPrice = Math.min(...prices);
		const maxPrice = Math.max(...prices);
		const priceRange = maxPrice - minPrice || 0.1;

		// Draw grid lines
		ctx.strokeStyle = '#2A2F45';
		ctx.lineWidth = 1;

		// Horizontal grid lines (price levels)
		for (let i = 0; i <= 5; i++) {
			const y = padding.top + (chartHeight / 5) * i;
			ctx.beginPath();
			ctx.moveTo(padding.left, y);
			ctx.lineTo(padding.left + chartWidth, y);
			ctx.stroke();

			// Price labels
			const price = maxPrice - (priceRange / 5) * i;
			ctx.fillStyle = '#A0A0A0';
			ctx.font = '12px Inter, sans-serif';
			ctx.textAlign = 'right';
			ctx.fillText(formatPrice(price), padding.left - 10, y + 4);
		}

		// Vertical grid lines (time)
		const timeStep = Math.ceil(filteredData.length / 6);
		for (let i = 0; i < filteredData.length; i += timeStep) {
			const x = padding.left + (chartWidth / (filteredData.length - 1)) * i;
			ctx.beginPath();
			ctx.moveTo(x, padding.top);
			ctx.lineTo(x, padding.top + chartHeight);
			ctx.stroke();

			// Time labels
			if (filteredData[i]) {
				ctx.fillStyle = '#A0A0A0';
				ctx.font = '11px Inter, sans-serif';
				ctx.textAlign = 'center';
				const timeLabel = new Date(filteredData[i].timestamp * 1000).toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric'
				});
				ctx.fillText(timeLabel, x, padding.top + chartHeight + 20);
			}
		}

		// Draw price line
		if (filteredData.length > 1) {
			ctx.strokeStyle = lineColor;
			ctx.lineWidth = 2;
			ctx.beginPath();

			filteredData.forEach((point, index) => {
				const x = padding.left + (chartWidth / (filteredData.length - 1)) * index;
				const y = padding.top + chartHeight - ((point.close - minPrice) / priceRange) * chartHeight;

				if (index === 0) {
					ctx.moveTo(x, y);
				} else {
					ctx.lineTo(x, y);
				}
			});

			ctx.stroke();

			// Draw data points
			ctx.fillStyle = lineColor;
			filteredData.forEach((point, index) => {
				const x = padding.left + (chartWidth / (filteredData.length - 1)) * index;
				const y = padding.top + chartHeight - ((point.close - minPrice) / priceRange) * chartHeight;
				
				ctx.beginPath();
				ctx.arc(x, y, 3, 0, 2 * Math.PI);
				ctx.fill();
			});
		}
	}

	function handleMouseMove(event: MouseEvent) {
		if (!chartContainer || !filteredData.length) return;

		const rect = chartContainer.getBoundingClientRect();
		const padding = { top: 20, right: 50, bottom: 40, left: 60 };
		const chartWidth = rect.width - padding.left - padding.right;
		
		const mouseX = event.clientX - rect.left - padding.left;
		const dataIndex = Math.round((mouseX / chartWidth) * (filteredData.length - 1));

		if (dataIndex >= 0 && dataIndex < filteredData.length) {
			const point = filteredData[dataIndex];
			tooltipData = {
				timestamp: point.timestamp,
				price: point.close,
				volume: point.volume || 0,
				high: point.high || point.close,
				low: point.low || point.close
			};

			// Position tooltip
			tooltip.style.left = `${event.clientX - rect.left + 10}px`;
			tooltip.style.top = `${event.clientY - rect.top - 10}px`;
			showTooltip = true;
		}
	}

	function handleMouseLeave() {
		showTooltip = false;
	}

	onMount(() => {
		const resizeObserver = new ResizeObserver(() => {
			setTimeout(drawChart, 100);
		});

		if (chartContainer) {
			resizeObserver.observe(chartContainer);
		}

		return () => resizeObserver.disconnect();
	});

	$: if (filteredData.length && chartContainer) {
		setTimeout(drawChart, 100);
	}
</script>

<div class="chart-wrapper">
	{#if loading}
		<div class="chart-loading">
			<div class="loading-spinner"></div>
			<p>Loading chart data...</p>
		</div>
	{:else if !filteredData.length}
		<div class="chart-empty">
			<p>No chart data available</p>
		</div>
	{:else}
		<div 
			bind:this={chartContainer}
			class="chart-container"
			on:mousemove={handleMouseMove}
			on:mouseleave={handleMouseLeave}
			role="img"
			aria-label="Price chart"
		>
			<canvas></canvas>
			
			{#if showTooltip}
				<div bind:this={tooltip} class="chart-tooltip">
					<div class="tooltip-time">
						{formatTimestamp(tooltipData.timestamp)}
					</div>
					<div class="tooltip-price" style="color: {lineColor}">
						{formatPrice(tooltipData.price)}
					</div>
					<div class="tooltip-percentage" style="color: {lineColor}">
						{formatPercentage(tooltipData.price)}
					</div>
					{#if tooltipData.volume}
						<div class="tooltip-volume">
							Volume: ${(tooltipData.volume / 1000).toFixed(0)}K
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.chart-wrapper {
		position: relative;
		width: 100%;
		height: 400px;
		background: transparent;
	}

	.chart-container {
		position: relative;
		width: 100%;
		height: 100%;
		cursor: crosshair;
		overflow: hidden;
	}

	.chart-container canvas {
		width: 100%;
		height: 100%;
		display: block;
	}

	.chart-tooltip {
		position: absolute;
		background: #1E2139;
		border: 1px solid #2A2F45;
		border-radius: 6px;
		padding: 12px;
		pointer-events: none;
		z-index: 10;
		min-width: 160px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.tooltip-time {
		color: #A0A0A0;
		font-size: 11px;
		margin-bottom: 4px;
	}

	.tooltip-price {
		font-size: 16px;
		font-weight: 700;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		margin-bottom: 2px;
	}

	.tooltip-percentage {
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 4px;
	}

	.tooltip-volume {
		color: #A0A0A0;
		font-size: 11px;
		border-top: 1px solid #2A2F45;
		padding-top: 4px;
		margin-top: 4px;
	}

	.chart-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #A0A0A0;
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid #2A2F45;
		border-top: 3px solid #00D084;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 16px;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.chart-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #A0A0A0;
	}
</style>