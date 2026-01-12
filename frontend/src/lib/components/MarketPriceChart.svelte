<script lang="ts">
	import { onMount } from 'svelte';
	import type { BacktestTrade, Candlestick } from '$lib/backtesting/types';

	export let trades: BacktestTrade[] = [];
	export let candlesticks: Candlestick[] = [];
	export let title: string = 'Market Price & Trade Markers';

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;

	onMount(() => {
		ctx = canvas.getContext('2d');
		if (ctx) {
			drawChart();
		}
	});

	$: if (ctx && (trades.length > 0 || candlesticks.length > 0)) {
		drawChart();
	}

	function drawChart() {
		if (!ctx || !canvas) return;

		const width = canvas.width;
		const height = canvas.height;
		const padding = { top: 40, right: 80, bottom: 60, left: 60 };
		const chartWidth = width - padding.left - padding.right;
		const chartHeight = height - padding.top - padding.bottom;

		// Clear canvas
		ctx.fillStyle = '#0a0e1a';
		ctx.fillRect(0, 0, width, height);

		// If no candlesticks, show message
		if (candlesticks.length === 0) {
			ctx.fillStyle = '#6b7280';
			ctx.font = '16px sans-serif';
			ctx.textAlign = 'center';
			ctx.fillText('Historical price data not available', width / 2, height / 2);
			return;
		}

		// Get price range
		const prices = candlesticks.map(c => c.close);
		const minPrice = Math.min(...prices) * 0.95;
		const maxPrice = Math.max(...prices) * 1.05;
		const priceRange = maxPrice - minPrice;

		// Get time range
		const timestamps = candlesticks.map(c => c.timestamp.getTime());
		const minTime = Math.min(...timestamps);
		const maxTime = Math.max(...timestamps);
		const timeRange = maxTime - minTime;

		// Helper functions
		const xScale = (time: number) => padding.left + ((time - minTime) / timeRange) * chartWidth;
		const yScale = (price: number) => padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight;

		// Draw grid lines
		ctx.strokeStyle = '#1e2537';
		ctx.lineWidth = 1;

		// Horizontal grid lines (price levels)
		for (let i = 0; i <= 5; i++) {
			const price = minPrice + (priceRange * i) / 5;
			const y = yScale(price);

			ctx.beginPath();
			ctx.moveTo(padding.left, y);
			ctx.lineTo(width - padding.right, y);
			ctx.stroke();

			// Price labels
			ctx.fillStyle = '#9ca3af';
			ctx.font = '12px sans-serif';
			ctx.textAlign = 'right';
			ctx.fillText(price.toFixed(3), padding.left - 10, y + 4);
		}

		// Vertical grid lines (time)
		for (let i = 0; i <= 5; i++) {
			const time = minTime + (timeRange * i) / 5;
			const x = xScale(time);

			ctx.beginPath();
			ctx.moveTo(x, padding.top);
			ctx.lineTo(x, height - padding.bottom);
			ctx.stroke();

			// Time labels
			const date = new Date(time);
			ctx.fillStyle = '#9ca3af';
			ctx.font = '11px sans-serif';
			ctx.textAlign = 'center';
			ctx.fillText(
				date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
				x,
				height - padding.bottom + 20
			);
		}

		// Draw price line
		ctx.beginPath();
		ctx.strokeStyle = '#3b82f6';
		ctx.lineWidth = 2;

		candlesticks.forEach((candle, i) => {
			const x = xScale(candle.timestamp.getTime());
			const y = yScale(candle.close);

			if (i === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
		});
		ctx.stroke();

		// Draw trade markers
		trades.forEach(trade => {
			const entryX = xScale(trade.entryTime.getTime());
			const entryY = yScale(trade.entryPrice);

			// Entry marker (triangle up for buy)
			ctx.fillStyle = trade.side === 'YES' ? '#10b981' : '#f59e0b';
			ctx.beginPath();
			ctx.moveTo(entryX, entryY - 10);
			ctx.lineTo(entryX - 6, entryY);
			ctx.lineTo(entryX + 6, entryY);
			ctx.closePath();
			ctx.fill();

			// Exit marker (if exists)
			if (trade.exitTime && trade.exitPrice) {
				const exitX = xScale(trade.exitTime.getTime());
				const exitY = yScale(trade.exitPrice);

				// Exit marker (triangle down for sell)
				ctx.fillStyle = trade.pnl >= 0 ? '#10b981' : '#ef4444';
				ctx.beginPath();
				ctx.moveTo(exitX, exitY + 10);
				ctx.lineTo(exitX - 6, exitY);
				ctx.lineTo(exitX + 6, exitY);
				ctx.closePath();
				ctx.fill();

				// Draw line connecting entry to exit
				ctx.strokeStyle = trade.pnl >= 0 ? '#10b98140' : '#ef444440';
				ctx.lineWidth = 1;
				ctx.setLineDash([5, 5]);
				ctx.beginPath();
				ctx.moveTo(entryX, entryY);
				ctx.lineTo(exitX, exitY);
				ctx.stroke();
				ctx.setLineDash([]);
			}
		});

		// Draw title
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 16px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(title, width / 2, 25);

		// Draw legend
		const legendX = width - padding.right + 10;
		let legendY = padding.top;

		ctx.font = '12px sans-serif';
		ctx.textAlign = 'left';

		// Entry marker legend
		ctx.fillStyle = '#10b981';
		ctx.beginPath();
		ctx.moveTo(legendX, legendY - 5);
		ctx.lineTo(legendX - 5, legendY + 3);
		ctx.lineTo(legendX + 5, legendY + 3);
		ctx.closePath();
		ctx.fill();
		ctx.fillStyle = '#9ca3af';
		ctx.fillText('Entry', legendX + 10, legendY + 3);

		// Exit marker legend
		legendY += 25;
		ctx.fillStyle = '#ef4444';
		ctx.beginPath();
		ctx.moveTo(legendX, legendY + 5);
		ctx.lineTo(legendX - 5, legendY - 3);
		ctx.lineTo(legendX + 5, legendY - 3);
		ctx.closePath();
		ctx.fill();
		ctx.fillStyle = '#9ca3af';
		ctx.fillText('Exit', legendX + 10, legendY + 3);
	}
</script>

<div class="chart-container">
	<canvas bind:this={canvas} width={1000} height={400}></canvas>
</div>

<style>
	.chart-container {
		width: 100%;
		background: #141824;
		border-radius: 12px;
		padding: 20px;
		margin: 20px 0;
	}

	canvas {
		width: 100%;
		height: auto;
		display: block;
	}
</style>
