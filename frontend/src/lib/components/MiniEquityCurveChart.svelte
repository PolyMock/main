<script lang="ts">
	export let equityCurve: Array<{ timestamp: string; capital: number }> = [];
	export let initialCapital: number = 0;
	export let isPositive: boolean = true;

	let svgWidth = 300;
	let svgHeight = 60;
	let padding = 2;

	$: points = generatePoints(equityCurve);
	$: pathD = generatePath(points);
	$: areaD = generateArea(points);

	function generatePoints(curve: Array<{ timestamp: string; capital: number }>) {
		if (!curve || curve.length === 0) return [];

		const values = curve.map((d) => d.capital);
		const minValue = Math.min(...values, initialCapital);
		const maxValue = Math.max(...values, initialCapital);
		const range = maxValue - minValue || 1;

		const chartWidth = svgWidth - padding * 2;
		const chartHeight = svgHeight - padding * 2;

		return curve.map((d, i) => {
			const x = padding + (i / (curve.length - 1 || 1)) * chartWidth;
			const y =
				padding + chartHeight - ((d.capital - minValue) / range) * chartHeight;
			return { x, y };
		});
	}

	function generatePath(pts: Array<{ x: number; y: number }>) {
		if (pts.length === 0) return '';
		return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
	}

	function generateArea(pts: Array<{ x: number; y: number }>) {
		if (pts.length === 0) return '';
		const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
		const lastPoint = pts[pts.length - 1];
		const firstPoint = pts[0];
		return `${path} L ${lastPoint.x} ${svgHeight - padding} L ${firstPoint.x} ${svgHeight - padding} Z`;
	}
</script>

<div class="mini-equity-curve">
	{#if points.length > 0}
		<svg viewBox="0 0 {svgWidth} {svgHeight}" preserveAspectRatio="none" class="chart-svg">
			<!-- Area fill -->
			<path
				d={areaD}
				fill={isPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}
				class="area"
			/>
			<!-- Line -->
			<path
				d={pathD}
				fill="none"
				stroke={isPositive ? '#10b981' : '#ef4444'}
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="line"
			/>
		</svg>
	{:else}
		<div class="no-data">No equity data</div>
	{/if}
</div>

<style>
	.mini-equity-curve {
		width: 100%;
		height: 60px;
		position: relative;
		overflow: hidden;
	}

	.chart-svg {
		width: 100%;
		height: 100%;
	}

	.line {
		vector-effect: non-scaling-stroke;
	}

	.no-data {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #6b7280;
		font-size: 12px;
	}
</style>
