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
	let progressMessage = $state('');
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
		selectedMarkets = cfg.selectedMarkets || [];
		strategyTab = 'strategy';
	}

	function handleEditConfig() {
		strategyTab = 'configure';
	}

	async function handleRunBacktest(strategyCode: string, strategyType: string | null, strategyParams?: any) {
		const isSynthesis = configState.dataSource === 'synthesis';

		if (isSynthesis) {
			await runSynthesisBacktest(strategyCode, strategyType, strategyParams);
		} else {
			await runLegacyBacktest(strategyCode);
		}
	}

	async function runSynthesisBacktest(strategyCode: string, strategyType: string | null, strategyParams?: any) {
		isRunning = true;
		error = '';
		progress = 0;
		progressMessage = 'Sending backtest request...';
		strategyTab = 'results';

		try {
			if (selectedMarkets.length === 0) {
				throw new Error('No markets selected. Go back and select markets in the config.');
			}

			if (!strategyType) {
				throw new Error('Please select one of the example strategies (load 1-5) before running.');
			}

			progress = 10;
			progressMessage = 'Running backtest on server...';

			const response = await fetch('/api/backtest/run', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					markets: selectedMarkets,
					strategyType,
					strategyCode,
					initialCash: strategyParams?.initialCash ?? config.initialBankroll ?? 10000,
					reimburseOpenPositions: strategyParams?.reimburseOpenPositions ?? false,
					priceInf: strategyParams?.priceInf ?? null,
					priceSup: strategyParams?.priceSup ?? null,
					position: configState.config?.position ?? null,
					timestampStart: configState.useTimePeriod ? configState.timestampStartStr : null,
					timestampEnd: configState.useTimePeriod ? configState.timestampEndStr : null,
				}),
			});

			if (!response.ok) {
				const errData = await response.json();
				throw new Error(errData.error || 'Failed to run backtest');
			}

			// Parse NDJSON stream for progress updates and final result
			const reader = response.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop()!;

				for (const line of lines) {
					if (!line.trim()) continue;
					const msg = JSON.parse(line);

					if (msg.type === 'progress') {
						progress = msg.progress ?? progress;
						progressMessage = msg.message ?? progressMessage;
					} else if (msg.type === 'result') {
						backtestResult = msg.data;
						progress = 100;
						progressMessage = 'Backtest complete!';
					} else if (msg.type === 'error') {
						throw new Error(msg.error);
					}
				}
			}

			if (!backtestResult) {
				throw new Error('No result received from backtest engine.');
			}
		} catch (err: any) {
			error = err.message || 'An error occurred during backtest';
			strategyTab = 'strategy';
		} finally {
			isRunning = false;
		}
	}

	async function runLegacyBacktest(strategyCode: string) {
		isRunning = true;
		error = '';
		progress = 0;
		progressMessage = 'Running backtest...';
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
					{selectedMarkets}
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
						<div class="video-wrapper">
							<video autoplay loop muted playsinline>
								<source src="/loader.mp4" type="video/mp4" />
							</video>
						</div>
						<div class="loading-text-block">
							<p class="loading-status">{progressMessage || 'Initializing backtest engine...'}</p>
							<div class="progress-track">
								<div class="progress-glow" style="width: {progress}%"></div>
							</div>
							<p class="loading-pct">{progress}%</p>
						</div>
						<div class="loading-steps">
							<span class="step" class:done={progress >= 5} class:active={progress > 0 && progress < 5}>Connecting</span>
							<span class="step-dot">—</span>
							<span class="step" class:done={progress >= 20} class:active={progress >= 5 && progress < 20}>Fetching trades</span>
							<span class="step-dot">—</span>
							<span class="step" class:done={progress >= 90} class:active={progress >= 20 && progress < 90}>Running strategy</span>
							<span class="step-dot">—</span>
							<span class="step" class:done={progress >= 100} class:active={progress >= 90 && progress < 100}>Finalizing</span>
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
		background: #000000;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10;
	}

	.running-content {
		text-align: center;
		color: #fff;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 24px;
	}

	.video-wrapper {
		width: 180px;
		height: 180px;
		border-radius: 50%;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 0 60px rgba(249, 115, 22, 0.15), 0 0 120px rgba(249, 115, 22, 0.05);
		animation: pulse-ring 2s ease-in-out infinite;
	}

	.video-wrapper video {
		width: 180px;
		height: 180px;
		object-fit: cover;
		display: block;
	}

	@keyframes pulse-ring {
		0%, 100% { box-shadow: 0 0 40px rgba(249, 115, 22, 0.12), 0 0 80px rgba(249, 115, 22, 0.04); }
		50% { box-shadow: 0 0 60px rgba(249, 115, 22, 0.25), 0 0 120px rgba(249, 115, 22, 0.08); }
	}

	.loading-text-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		width: 320px;
	}

	.loading-status {
		margin: 0;
		font-size: 13px;
		font-family: 'Share Tech Mono', monospace;
		color: #f97316;
		letter-spacing: 0.5px;
		min-height: 20px;
	}

	.progress-track {
		width: 100%;
		height: 2px;
		background: #1a1a1a;
		border-radius: 1px;
		overflow: hidden;
		position: relative;
	}

	.progress-glow {
		height: 100%;
		background: linear-gradient(90deg, #f97316, #fb923c);
		border-radius: 1px;
		transition: width 0.4s ease;
		box-shadow: 0 0 8px rgba(249, 115, 22, 0.6);
	}

	.loading-pct {
		margin: 0;
		font-size: 11px;
		font-family: 'Share Tech Mono', monospace;
		color: #555;
		letter-spacing: 1px;
	}

	.loading-steps {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: 'Share Tech Mono', monospace;
		font-size: 10px;
		letter-spacing: 0.5px;
	}

	.step {
		color: #333;
		transition: color 0.3s ease;
	}

	.step.active {
		color: #f97316;
	}

	.step.done {
		color: #555;
	}

	.step-dot {
		color: #222;
		font-size: 8px;
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
