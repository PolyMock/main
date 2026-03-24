<script lang="ts">
	import TradeSummary from '$lib/components/backtesting/TradeSummary.svelte';
</script>

<div class="performance-container">
	<TradeSummary />
</div>

<style>
	.performance-container {
		height: calc(100vh - 97px);
		background: #000000;
		color: white;
		overflow: auto;
	}
</style>
