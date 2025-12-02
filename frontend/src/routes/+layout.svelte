<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import Navbar from '$lib/components/Navbar.svelte';

	let { children } = $props();

	// Auto-refresh every 5 minutes
	onMount(() => {
		const refreshInterval = setInterval(() => {
			window.location.reload();
		}, 5 * 60 * 1000); // 5 minutes in milliseconds

		return () => {
			clearInterval(refreshInterval);
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Navbar />

{@render children?.()}

<style>
	:global(body) {
		font-family: Arial, Helvetica, sans-serif;
		margin: 0;
		padding: 0;
		background: #0A0E27;
		color: #E8E8E8;
	}
</style>
