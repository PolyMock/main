<script lang="ts">
	export let selectedInterval: string = '1h';
	export let onIntervalChange: (interval: string) => void;

	const intervals = [
		{ value: '1h', label: '1H' },
		{ value: '4h', label: '4H' },
		{ value: '1d', label: '1D' },
		{ value: '1w', label: '1W' },
		{ value: '1m', label: '1M' },
		{ value: 'all', label: 'ALL' }
	];

	function handleIntervalClick(interval: string) {
		selectedInterval = interval;
		onIntervalChange(interval);
	}
</script>

<div class="interval-selector">
	{#each intervals as interval}
		<button
			class="interval-btn"
			class:active={selectedInterval === interval.value}
			on:click={() => handleIntervalClick(interval.value)}
		>
			{interval.label}
		</button>
	{/each}
</div>

<style>
	.interval-selector {
		display: flex;
		gap: 4px;
		margin-top: 16px;
	}

	.interval-btn {
		background: transparent;
		border: 1px solid #2A2F45;
		color: #A0A0A0;
		padding: 6px 12px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 12px;
		font-weight: 600;
		font-family: Inter, sans-serif;
		transition: all 200ms ease-out;
		min-width: 48px;
	}

	.interval-btn:hover {
		border-color: #3A4055;
		color: #E8E8E8;
	}

	.interval-btn.active {
		background: #00D084;
		border-color: #00D084;
		color: #ffffff;
	}

	.interval-btn.active:hover {
		background: #00B570;
		border-color: #00B570;
	}
</style>