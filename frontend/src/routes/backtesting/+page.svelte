<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet" />
</svelte:head>

<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { walletStore } from '$lib/wallet/stores';
	import type { BacktestResult } from '$lib/backtesting/types';
	import TradeSummary from '$lib/components/backtesting/TradeSummary.svelte';
	import ConfigTerminal from '$lib/components/backtesting/ConfigTerminal.svelte';
	import CodeEditor from '$lib/components/backtesting/CodeEditor.svelte';
	import BacktestResults from '$lib/components/backtesting/BacktestResults.svelte';

	const BACKTEST_API_URL = 'https://main-production-5e3b.up.railway.app';

	// Main tab state
	let activeMainTab: 'summary' | 'strategies' = $state('summary');

	$effect(() => {
		if (browser) {
			const tab = $page.url.searchParams.get('tab');
			activeMainTab = tab === 'strategy' ? 'strategies' : 'summary';
		}
	});

	// Strategy sub-tab state
	let strategyTab: 'configure' | 'strategy' | 'results' = $state('configure');
	let isRunning = $state(false);
	let progress = $state(0);
	let error = $state('');

	// Config from terminal wizard
	let engineConfig: any = $state(null);
	let configState: any = $state({});

	// Backtest results
	let backtestResult: BacktestResult | null = $state(null);

	// Legacy config for API calls
	let config: any = $state({
		specificMarkets: [],
		categories: [],
		initialBankroll: 10000,
		entryType: 'BOTH',
		startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
		endDate: new Date(),
		positionSizing: { type: 'PERCENTAGE', fixedAmount: 100, percentageOfBankroll: 5, maxExposurePercent: undefined },
		entryPriceThreshold: { yes: { min: 0.3, max: 0.7 }, no: { min: 0.3, max: 0.7 } },
		exitRules: {
			resolveOnExpiry: true, stopLoss: undefined, takeProfit: undefined, maxHoldTime: undefined,
			trailingStop: { enabled: false, activationPercent: undefined, trailPercent: undefined },
			partialExits: { enabled: false, takeProfit1: { percent: undefined, sellPercent: undefined }, takeProfit2: { percent: undefined, sellPercent: undefined } }
		},
		tradeFrequency: { maxTradesPerDay: undefined, cooldownHours: undefined },
		entryTimeConstraints: { earliestEntry: undefined, latestEntry: undefined },
	});
	let selectedMarkets: any[] = $state([]);

	function handleConfigComplete(cfg: any) {
		engineConfig = cfg.config;
		configState = cfg;
		strategyTab = 'strategy';
	}

	function handleEditConfig() {
		strategyTab = 'configure';
	}

	async function handleRunBacktest(strategyCode: string) {
		isRunning = true;
		error = '';
		progress = 0;
		strategyTab = 'results';

		try {
			const progressInterval = setInterval(() => {
				progress = Math.min(progress + 10, 90);
			}, 500);

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 180000);

			const response = await fetch(`${BACKTEST_API_URL}/api/backtest`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...config,
					strategyCode,
					engineConfig,
				}),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);
			clearInterval(progressInterval);

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Backtest failed');
			}

			backtestResult = await response.json();
			progress = 100;
		} catch (err: any) {
			if (err.name === 'AbortError') {
				error = 'Request timeout - try reducing the date range or number of markets.';
			} else {
				error = err.message || 'An error occurred';
			}
			strategyTab = 'strategy';
		} finally {
			isRunning = false;
		}
	}
</script>

<div class="backtesting-container">
	{#if activeMainTab === 'summary'}
		<TradeSummary />

	{:else if activeMainTab === 'strategies'}
		<div class="strategy-backtesting">
			{#if strategyTab === 'configure'}
				<ConfigTerminal onConfigComplete={handleConfigComplete} />

			{:else if strategyTab === 'strategy'}
				<CodeEditor
					dataSource={configState.dataSource ?? 'synthesis'}
					useTimePeriod={configState.useTimePeriod ?? false}
					timestampStartStr={configState.timestampStartStr ?? ''}
					timestampEndStr={configState.timestampEndStr ?? ''}
					filterTitleSearch={configState.filterTitleSearch ?? ''}
					filterCategories={configState.filterCategories ?? new Set()}
					filterVolumeInf={configState.filterVolumeInf ?? null}
					filterVolumeSup={configState.filterVolumeSup ?? null}
					onEditConfig={handleEditConfig}
					onRunBacktest={handleRunBacktest}
				/>

			{:else if strategyTab === 'results' && backtestResult}
				<BacktestResults
					{backtestResult}
					{selectedMarkets}
					{config}
					walletConnected={$walletStore.connected}
				/>
			{/if}

			{#if isRunning}
				<div class="running-overlay">
					<div class="running-content">
						<div class="spinner"></div>
						<p>Running backtest... {progress}%</p>
						<div class="progress-bar-wrapper">
							<div class="progress-bar-fill" style="width: {progress}%"></div>
						</div>
					</div>
				</div>
			{/if}

			{#if error}
				<div class="error-banner">
					<p>{error}</p>
					<button onclick={() => error = ''}>Dismiss</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.backtesting-container {
		height: calc(100vh - 97px);
		background: #000000;
		color: white;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.strategy-backtesting {
		width: 100%;
		max-width: 100%;
		margin: 0;
		padding: 0;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		position: relative;
	}

	.running-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10;
	}

	.running-content {
		text-align: center;
		color: #fff;
	}

	.running-content p {
		margin: 16px 0;
		font-size: 16px;
		font-family: 'Share Tech Mono', monospace;
		color: #f97316;
	}

	.progress-bar-wrapper {
		width: 300px;
		height: 4px;
		background: #333;
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-bar-fill {
		height: 100%;
		background: #f97316;
		transition: width 0.3s ease;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #333;
		border-top-color: #f97316;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.error-banner {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		background: #1a0000;
		border-top: 1px solid #ff4757;
		padding: 12px 24px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		z-index: 10;
	}

	.error-banner p {
		color: #ff4757;
		margin: 0;
		font-size: 14px;
	}

	.error-banner button {
		background: transparent;
		border: 1px solid #ff4757;
		color: #ff4757;
		padding: 4px 12px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 12px;
	}

	.error-banner button:hover {
		background: #ff4757;
		color: #000;
	}

	:global(.light-mode) .backtesting-container {
		background: #FFFFFF;
		color: #1A1A1A;
	}

	@media (max-width: 768px) {
		.backtesting-container {
			height: calc(100vh - 64px);
		}
	}
</style>
