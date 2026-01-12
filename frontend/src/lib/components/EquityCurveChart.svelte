<script lang="ts">
	import { onMount } from 'svelte';
	import type { EquityPoint } from '$lib/backtesting/types';

	export let equityCurve: EquityPoint[] = [];
	export let initialCapital: number = 10000;

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;

	$: if (canvas && equityCurve.length > 0) {
		drawChart();
	}

	onMount(() => {
		if (canvas) {
			ctx = canvas.getContext('2d');
			if (equityCurve.length > 0) {
				drawChart();
			}
		}
	});

	function drawChart() {
		if (!ctx || !canvas || equityCurve.length === 0) return;

		const width = canvas.width;
		const height = canvas.height;
		const padding = { top: 30, right: 10, bottom: 50, left: 70 };

		// Clear canvas
		ctx.fillStyle = '#0A0E1A';
		ctx.fillRect(0, 0, width, height);

		// Calculate bounds
		const chartWidth = width - padding.left - padding.right;
		const chartHeight = height - padding.top - padding.bottom;

		const minEquity = Math.min(...equityCurve.map((p) => p.equity), initialCapital);
		const maxEquity = Math.max(...equityCurve.map((p) => p.equity), initialCapital);
		const equityRange = maxEquity - minEquity;

		// Draw grid lines
		ctx.strokeStyle = '#1e2537';
		ctx.lineWidth = 1;

		// Horizontal grid lines (5 lines)
		for (let i = 0; i <= 5; i++) {
			const y = padding.top + (chartHeight / 5) * i;
			ctx.beginPath();
			ctx.moveTo(padding.left, y);
			ctx.lineTo(width - padding.right, y);
			ctx.stroke();

			// Y-axis labels
			const value = maxEquity - (equityRange / 5) * i;
			ctx.fillStyle = '#9ca3af';
			ctx.font = '12px sans-serif';
			ctx.textAlign = 'right';
			ctx.fillText(`$${value.toFixed(0)}`, padding.left - 10, y + 4);
		}

		// Draw baseline (initial capital)
		const baselineY =
			padding.top + chartHeight - ((initialCapital - minEquity) / equityRange) * chartHeight;
		ctx.strokeStyle = '#6B7280';
		ctx.lineWidth = 1;
		ctx.setLineDash([5, 5]);
		ctx.beginPath();
		ctx.moveTo(padding.left, baselineY);
		ctx.lineTo(width - padding.right, baselineY);
		ctx.stroke();
		ctx.setLineDash([]);

		// Draw equity curve
		ctx.strokeStyle = '#3b82f6';
		ctx.lineWidth = 2.5;
		ctx.beginPath();

		equityCurve.forEach((point, i) => {
			const x = padding.left + (i / (equityCurve.length - 1)) * chartWidth;
			const y =
				padding.top + chartHeight - ((point.equity - minEquity) / equityRange) * chartHeight;

			if (i === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
		});

		ctx.stroke();

		// X-axis labels (time)
		const numLabels = 5;
		ctx.fillStyle = '#9ca3af';
		ctx.font = '12px sans-serif';
		ctx.textAlign = 'center';

		for (let i = 0; i <= numLabels; i++) {
			const index = Math.floor((i / numLabels) * (equityCurve.length - 1));
			const point = equityCurve[index];
			const x = padding.left + (i / numLabels) * chartWidth;
			const label = new Date(point.timestamp).toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric'
			});
			ctx.fillText(label, x, height - padding.bottom + 20);
		}

		// Chart title
		ctx.fillStyle = 'white';
		ctx.font = '600 16px sans-serif';
		ctx.textAlign = 'left';
		ctx.fillText('Equity Curve', padding.left, padding.top - 5);
	}
</script>

<div class="chart-container">
	<canvas bind:this={canvas} width="1000" height="400"></canvas>
</div>

<style>
	.chart-container {
		background: #141824;
		border: 1px solid #2d3748;
		border-radius: 12px;
		padding: 20px;
		overflow: hidden;
	}

	canvas {
		width: 100%;
		height: auto;
		display: block;
	}
</style>
