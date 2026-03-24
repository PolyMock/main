<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet" />
</svelte:head>

<script lang="ts">
	import { walletStore } from '$lib/wallet/stores';
	import type { BacktestResult } from '$lib/backtesting/types';
	import ConfigTerminal from '$lib/components/backtesting/ConfigTerminal.svelte';
	import CodeEditor from '$lib/components/backtesting/CodeEditor.svelte';
	import BacktestResults from '$lib/components/backtesting/BacktestResults.svelte';

	const BACKTEST_API_URL = 'https://main-production-5e3b.up.railway.app';

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

	let lastStrategyParams: any = $state(null);

	async function runSynthesisBacktest(strategyCode: string, strategyType: string | null, strategyParams?: any) {
		isRunning = true;
		error = '';
		progress = 0;
		progressMessage = 'Sending backtest request...';
		strategyTab = 'results';
		lastStrategyParams = strategyParams;

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
					strategyParams: strategyParams?.strategyParams ?? null,
					stopLoss: strategyParams?.stopLoss ?? null,
					takeProfit: strategyParams?.takeProfit ?? null,
					trailingStop: strategyParams?.trailingStop ?? null,
					maxHoldHours: strategyParams?.maxHoldHours ?? null,
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
						backtestResult = {
							...msg.data,
							strategyConfig: {
								strategyType,
								initialCash: lastStrategyParams?.initialCash ?? config.initialBankroll ?? 10000,
								priceInf: lastStrategyParams?.priceInf ?? null,
								priceSup: lastStrategyParams?.priceSup ?? null,
								position: configState.config?.position ?? null,
								stopLoss: lastStrategyParams?.stopLoss ?? null,
								takeProfit: lastStrategyParams?.takeProfit ?? null,
								trailingStop: lastStrategyParams?.trailingStop ?? null,
								maxHoldHours: lastStrategyParams?.maxHoldHours ?? null,
								amount: lastStrategyParams?.strategyParams?.amount ?? null,
								threshold: lastStrategyParams?.strategyParams?.threshold ?? null,
								cooldownHours: lastStrategyParams?.strategyParams?.cooldownHours ?? null,
							},
						};
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
					config={{ ...config, strategyType: backtestResult.strategyConfig?.strategyType, exitRules: { ...config.exitRules, stopLoss: backtestResult.strategyConfig?.stopLoss, takeProfit: backtestResult.strategyConfig?.takeProfit, trailingStop: backtestResult.strategyConfig?.trailingStop, maxHoldTime: backtestResult.strategyConfig?.maxHoldHours }, strategyParams: backtestResult.strategyConfig }}
					walletConnected={$walletStore.connected}
				/>
			{/if}

			{#if isRunning}
				<div class="running-overlay">
					<!-- Skeleton hero bar -->
					<div class="skel-hero">
						<div class="skel-hero-left">
							<div class="skel-label-sm shimmer"></div>
							<div class="skel-value-lg shimmer"></div>
							<div class="skel-label-sm shimmer" style="width:60px"></div>
						</div>
						<div class="skel-hero-divider"></div>
						<div class="skel-hero-cap">
							<div class="skel-line shimmer" style="width:110px"></div>
							<div class="skel-line shimmer" style="width:130px"></div>
						</div>
						<div class="skel-hero-stats">
							{#each Array(6) as _}
								<div class="skel-stat">
									<div class="skel-line shimmer" style="width:40px;height:14px"></div>
									<div class="skel-line shimmer" style="width:32px;height:8px"></div>
								</div>
							{/each}
						</div>
					</div>

					<!-- Skeleton charts row -->
					<div class="skel-charts">
						{#each Array(3) as _, i}
							{#if i > 0}<div class="skel-chart-sep"></div>{/if}
							<div class="skel-chart-card">
								<div class="skel-chart-head">
									<div class="skel-line shimmer" style="width:90px;height:10px"></div>
									<div class="skel-line shimmer" style="width:70px;height:12px"></div>
								</div>
								<div class="skel-chart-body shimmer"></div>
								<div class="skel-chart-foot">
									<div class="skel-line shimmer" style="width:80px;height:9px"></div>
									<div class="skel-line shimmer" style="width:60px;height:9px"></div>
								</div>
							</div>
						{/each}
					</div>

					<!-- Progress section -->
					<div class="skel-progress-section">
						<div class="skel-spinner">
							<svg viewBox="0 0 50 50">
								<circle cx="25" cy="25" r="20" fill="none" stroke="#1a1a1a" stroke-width="3"/>
								<circle cx="25" cy="25" r="20" fill="none" stroke="#f97316" stroke-width="3" stroke-dasharray="31.4 94.2" stroke-linecap="round" class="spinner-arc"/>
							</svg>
						</div>
						<div class="skel-progress-info">
							<p class="skel-progress-msg">{progressMessage || 'Initializing backtest engine...'}</p>
							<div class="skel-progress-track">
								<div class="skel-progress-fill" style="width: {progress}%"></div>
							</div>
							<div class="skel-progress-steps">
								<span class="skel-step" class:done={progress >= 5} class:active={progress > 0 && progress < 5}>Connecting</span>
								<span class="skel-step-dot"></span>
								<span class="skel-step" class:done={progress >= 20} class:active={progress >= 5 && progress < 20}>Fetching trades</span>
								<span class="skel-step-dot"></span>
								<span class="skel-step" class:done={progress >= 90} class:active={progress >= 20 && progress < 90}>Running strategy</span>
								<span class="skel-step-dot"></span>
								<span class="skel-step" class:done={progress >= 100} class:active={progress >= 90 && progress < 100}>Finalizing</span>
							</div>
						</div>
					</div>

					<!-- Skeleton metrics grid -->
					<div class="skel-tabs">
						<div class="skel-tab-active shimmer" style="width:70px"></div>
						<div class="skel-tab shimmer" style="width:85px"></div>
						<div class="skel-tab shimmer" style="width:60px"></div>
					</div>
					<div class="skel-metrics-grid">
						{#each Array(4) as _}
							<div class="skel-panel">
								<div class="skel-line shimmer" style="width:100px;height:11px;margin-bottom:14px"></div>
								{#each Array(5) as _}
									<div class="skel-metric-row">
										<div class="skel-line shimmer" style="width:70px;height:10px"></div>
										<div class="skel-line shimmer" style="width:45px;height:10px"></div>
									</div>
								{/each}
							</div>
						{/each}
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

	/* ═══ SKELETON LOADING OVERLAY ═══ */
	.running-overlay {
		position: absolute;
		inset: 0;
		background: #0a0a0a;
		display: flex;
		flex-direction: column;
		z-index: 10;
		overflow: hidden;
	}

	/* Shimmer animation */
	@keyframes shimmer {
		0% { background-position: -400px 0; }
		100% { background-position: 400px 0; }
	}
	.shimmer {
		background: linear-gradient(90deg, #111 0%, #1a1a1a 40%, #222 50%, #1a1a1a 60%, #111 100%);
		background-size: 800px 100%;
		animation: shimmer 1.8s ease-in-out infinite;
		border-radius: 4px;
	}

	.skel-line { height: 12px; border-radius: 3px; }

	/* Skeleton hero bar */
	.skel-hero {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 16px 24px;
		background: #000;
		border-bottom: 1px solid #1a1a1a;
	}
	.skel-hero-left { display: flex; flex-direction: column; gap: 6px; }
	.skel-hero-left .skel-label-sm { width: 50px; height: 9px; }
	.skel-hero-left .skel-value-lg { width: 160px; height: 28px; border-radius: 4px; }
	.skel-hero-divider { width: 1px; height: 48px; background: #1a1a1a; }
	.skel-hero-cap { display: flex; flex-direction: column; gap: 6px; }
	.skel-hero-stats { display: flex; gap: 20px; margin-left: auto; }
	.skel-stat { display: flex; flex-direction: column; align-items: center; gap: 4px; }

	/* Skeleton charts */
	.skel-charts {
		flex-shrink: 0;
		display: flex;
		padding: 12px 16px;
		gap: 0;
		border-bottom: 1px solid #1a1a1a;
	}
	.skel-chart-sep { width: 12px; flex-shrink: 0; }
	.skel-chart-card {
		flex: 1;
		min-width: 0;
		background: #0f0f0f;
		border: 1px solid #1a1a1a;
		border-radius: 8px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.skel-chart-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 14px;
		border-bottom: 1px solid #1a1a1a;
		background: #0a0a0a;
	}
	.skel-chart-body {
		flex: 1;
		min-height: 140px;
		margin: 8px;
		border-radius: 4px;
	}
	.skel-chart-foot {
		display: flex;
		justify-content: space-between;
		padding: 8px 14px;
		border-top: 1px solid #1a1a1a;
		background: #0a0a0a;
	}

	/* Progress section */
	.skel-progress-section {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 18px 24px;
		background: #000;
		border-bottom: 1px solid #1a1a1a;
	}
	.skel-spinner {
		width: 36px;
		height: 36px;
		flex-shrink: 0;
	}
	.skel-spinner svg { width: 100%; height: 100%; }
	@keyframes spin { to { transform: rotate(360deg); } }
	.spinner-arc {
		transform-origin: center;
		animation: spin 1s linear infinite;
	}
	.skel-progress-info { flex: 1; display: flex; flex-direction: column; gap: 8px; }
	.skel-progress-msg {
		margin: 0;
		font-size: 13px;
		font-family: 'Share Tech Mono', monospace;
		color: #f97316;
		letter-spacing: 0.5px;
	}
	.skel-progress-track {
		width: 100%;
		height: 3px;
		background: #1a1a1a;
		border-radius: 2px;
		overflow: hidden;
	}
	.skel-progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #f97316, #fb923c);
		border-radius: 2px;
		transition: width 0.4s ease;
		box-shadow: 0 0 8px rgba(249, 115, 22, 0.5);
	}
	.skel-progress-steps {
		display: flex;
		align-items: center;
		gap: 6px;
		font-family: 'Share Tech Mono', monospace;
		font-size: 10px;
		letter-spacing: 0.5px;
	}
	.skel-step { color: #333; transition: color 0.3s ease; }
	.skel-step.active { color: #f97316; }
	.skel-step.done { color: #666; }
	.skel-step-dot { width: 12px; height: 1px; background: #222; }

	/* Skeleton tabs */
	.skel-tabs {
		flex-shrink: 0;
		display: flex;
		gap: 8px;
		padding: 12px 24px 0;
		border-bottom: 1px solid #1a1a1a;
	}
	.skel-tab-active, .skel-tab {
		height: 32px;
		border-radius: 4px 4px 0 0;
	}
	.skel-tab-active {
		border-bottom: 2px solid #f97316;
	}

	/* Skeleton metrics grid */
	.skel-metrics-grid {
		flex: 1;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16px;
		padding: 16px 24px;
		overflow: hidden;
	}
	.skel-panel {
		background: #0f0f0f;
		border: 1px solid #1a1a1a;
		border-radius: 8px;
		padding: 16px;
	}
	.skel-metric-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 10px;
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
