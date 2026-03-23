<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet" />
</svelte:head>

<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import FilterForm from '$lib/components/backtesting/FilterForm.svelte';
	import TradeDataDisplay from '$lib/components/backtesting/TradeDataDisplay.svelte';
	import StrategyCodeEditorPart2 from '$lib/components/backtesting/StrategyCodeEditorPart2.svelte';
	import BacktestResults from '$lib/components/backtesting/BacktestResults.svelte';
	import {
		fetchTrades,
		validateStrategy,
		runBacktest,
	} from '$lib/services/backtest-step3-api';
	import type {
		TradeFilters,
		Trade,
		ValidationStatus,
		BacktestResult,
	} from '$lib/backtesting/step3-types';

	// Step state: 'filters' | 'editor' | 'results'
	let step: 'filters' | 'editor' | 'results' = $state('filters');

	// Step 1: Filters & Trades
	let filters: TradeFilters = $state({
		platform: ['polymarket'],
		strat_var: null,
		timestamp_start: null,
		timestamp_end: null,
		market_id: null,
		market_title: null,
		market_category: null,
		volume_inf: null,
		volume_sup: null,
		position: null,
		possible_outcomes: null,
		price_inf: 0.0,
		price_sup: 1.0,
		amount_inf: null,
		amount_sup: null,
		wallet_maker: null,
		wallet_taker: null,
		page: 1,
		limit: 100,
	});

	let trades: Trade[] = $state([]);
	let tradesLoading = $state(false);
	let tradesError: string | null = $state(null);
	let currentPage = $state(1);
	let totalPages = $state(1);
	let totalTrades = $state(0);

	// Step 2: Strategy Code & Validation
	let strategyCode = $state('');
	let validationStatus: ValidationStatus = $state({
		isValid: false,
		message: '',
		isChecking: false,
	});

	// Step 3: Backtest Results
	let backtestResult: BacktestResult | null = $state(null);
	let isBacktestRunning = $state(false);
	let backestProgress = $state(0);
	let backestError: string | null = $state(null);

	// Initialize: Auto-load trades on mount (only once)
	onMount(() => {
		if (browser) {
			loadTrades(filters, 1);
		}
	});

	async function loadTrades(
		newFilters: TradeFilters,
		page: number = 1
	) {
		tradesLoading = true;
		tradesError = null;

		try {
			const response = await fetchTrades({ ...newFilters, page: page, limit: 100 });
			trades = response.trades;
			currentPage = response.page;
			totalPages = response.total_pages;
			totalTrades = response.total_trades;
		} catch (error: any) {
			tradesError = error.message || 'Failed to load trades';
			trades = [];
		} finally {
			tradesLoading = false;
		}
	}

	function handleLoadFiltered(newFilters: TradeFilters) {
		filters = newFilters;
		loadTrades(newFilters, 1);
	}

	function handlePageChange(newPage: number) {
		loadTrades(filters, newPage);
	}

	function handleStrategyCodeChange(newCode: string) {
		strategyCode = newCode;
		validationStatus.isValid = false;
		validationStatus.message = '';
	}

	async function handleValidateStrategy() {
		if (!strategyCode.trim()) {
			validationStatus = {
				isValid: false,
				message: 'Strategy code cannot be empty',
				isChecking: false,
			};
			return;
		}

		validationStatus = { ...validationStatus, isChecking: true };

		try {
			const response = await validateStrategy(strategyCode);
			console.log('Validation response:', response);
			validationStatus = {
				isValid: response.status === 'valid',
				message: response.message,
				isChecking: false,
			};
		} catch (error: any) {
			console.error('Validation error:', error);
			validationStatus = {
				isValid: false,
				message: error.message || 'Validation failed',
				isChecking: false,
			};
		}
	}

	async function handleRunBacktest() {
		if (!validationStatus.isValid) {
			backestError = 'Please validate your strategy first';
			return;
		}

		isBacktestRunning = true;
		backestProgress = 0;
		backestError = null;
		step = 'results';

		try {
			const progressInterval = setInterval(() => {
				backestProgress = Math.min(backestProgress + 10, 90);
			}, 500);

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 180000);

			const result = await runBacktest(strategyCode, filters, 10000, false, controller.signal);

			clearTimeout(timeoutId);
			clearInterval(progressInterval);

			backtestResult = result;
			backestProgress = 100;
		} catch (error: any) {
			clearInterval(undefined as any);
			if (error.name === 'AbortError') {
				backestError = 'Backtest timeout - try reducing the date range or number of markets';
			} else {
				backestError = error.message || 'Backtest execution failed';
			}
			step = 'editor';
		} finally {
			isBacktestRunning = false;
		}
	}

	function handleEditStrategy() {
		step = 'editor';
	}

	function handleBackToFilters() {
		step = 'filters';
	}

	function handleBackToEdit() {
		step = 'editor';
	}
</script>

<div class="backtesting-step3-container">
	{#if step === 'filters'}
		<div class="step-container">
			<div class="step-header">
				<div class="step-indicator">
					<span class="step-badge active">1</span>
					<span class="step-label">Data Exploration</span>
				</div>
				<div class="step-indicator">
					<span class="step-badge">2</span>
					<span class="step-label">Build Strategy</span>
				</div>
				<div class="step-indicator">
					<span class="step-badge">3</span>
					<span class="step-label">Backtest Results</span>
				</div>
			</div>

			<div class="exploration-workspace">
				<!-- Left: Filter Form -->
				<div class="filters-pane">
					<FilterForm
						{filters}
						isLoading={tradesLoading}
						onLoadFiltered={handleLoadFiltered}
					/>
				</div>

				<!-- Right: Trades Data Display -->
				<div class="trades-pane">
					<TradeDataDisplay
						{trades}
						isLoading={tradesLoading}
						error={tradesError}
						{currentPage}
						{totalPages}
						{totalTrades}
						onPageChange={handlePageChange}
					/>
				</div>
			</div>

			<div class="step-actions">
				<button
					class="btn btn-primary"
					onclick={() => (step = 'editor')}
					disabled={trades.length === 0 || tradesLoading}
				>
					Continue to Strategy Editor →
				</button>
			</div>
		</div>

	{:else if step === 'editor'}
		<div class="step-container full-height">
			<div class="step-header">
				<div class="step-indicator">
					<span class="step-badge">1</span>
					<span class="step-label">Data Exploration</span>
				</div>
				<div class="step-indicator">
					<span class="step-badge active">2</span>
					<span class="step-label">Build Strategy</span>
				</div>
				<div class="step-indicator">
					<span class="step-badge">3</span>
					<span class="step-label">Backtest Results</span>
				</div>
			</div>

			<StrategyCodeEditorPart2
				{strategyCode}
				{validationStatus}
				{trades}
				tradesLoading={false}
				tradesError={null}
				{currentPage}
				{totalPages}
				{totalTrades}
				onStrategyCodeChange={handleStrategyCodeChange}
				onValidate={handleValidateStrategy}
				onPageChange={handlePageChange}
				onBackClick={handleBackToFilters}
			/>

			<div class="strategy-actions">
				<button
					class="btn btn-secondary"
					onclick={handleBackToFilters}
					disabled={isBacktestRunning}
				>
					← Back to Filters
				</button>
				<button
					class="btn btn-primary"
					onclick={handleRunBacktest}
					disabled={!validationStatus.isValid || isBacktestRunning}
				>
					{isBacktestRunning ? 'Running Backtest...' : 'Run Backtest →'}
				</button>
			</div>

			{#if isBacktestRunning}
				<div class="running-overlay">
					<div class="running-content">
						<div class="spinner"></div>
						<p>Running backtest... {backestProgress}%</p>
						<div class="progress-bar-wrapper">
							<div class="progress-bar-fill" style="width: {backestProgress}%"></div>
						</div>
					</div>
				</div>
			{/if}

			{#if backestError && !isBacktestRunning}
				<div class="error-banner">
					<p>{backestError}</p>
					<button onclick={() => (backestError = '')}>Dismiss</button>
				</div>
			{/if}
		</div>

	{:else if step === 'results' && backtestResult}
		<div class="step-container full-height">
			<div class="step-header">
				<div class="step-indicator">
					<span class="step-badge">1</span>
					<span class="step-label">Data Exploration</span>
				</div>
				<div class="step-indicator">
					<span class="step-badge">2</span>
					<span class="step-label">Build Strategy</span>
				</div>
				<div class="step-indicator">
					<span class="step-badge active">3</span>
					<span class="step-label">Backtest Results</span>
				</div>
			</div>

			<BacktestResults
				backtestResult={backtestResult}
				selectedMarkets={[]}
				config={filters}
				walletConnected={false}
			/>

			<div class="results-actions">
				<button class="btn btn-secondary" onclick={handleBackToEdit}>
					← Back to Edit Strategy
				</button>
				<button class="btn btn-primary" onclick={() => (step = 'filters')}>
					← Back to Data Exploration
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.backtesting-step3-container {
		height: calc(100vh - 97px);
		background: #000000;
		color: white;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.step-container {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		position: relative;
	}

	.step-container.full-height {
		flex: 1;
		min-height: 0;
	}

	.step-header {
		padding: 20px 24px;
		background: #1a1a1a;
		border-bottom: 1px solid #333;
		display: flex;
		align-items: center;
		gap: 40px;
	}

	.step-indicator {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.step-badge {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: #333;
		color: #999;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		font-weight: 600;
		border: 1px solid #555;
		transition: all 0.2s ease;
	}

	.step-badge.active {
		background: #f97316;
		color: #000;
		border-color: #f97316;
		box-shadow: 0 0 20px rgba(249, 115, 22, 0.3);
	}

	.step-label {
		font-size: 12px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #999;
	}

	.filters-pane {
		flex: 1;
		overflow: auto;
	}

	.exploration-workspace {
		display: grid;
		grid-template-columns: 1fr 1fr;
		flex: 1;
		overflow: hidden;
		gap: 0;
		min-height: 0;
	}

	.trades-pane {
		flex: 1;
		overflow: auto;
		background: #000;
		min-height: 0;
	}

	.step-actions,
	.strategy-actions,
	.results-actions {
		padding: 20px 24px;
		background: #1a1a1a;
		border-top: 1px solid #333;
		display: flex;
		gap: 12px;
		justify-content: flex-end;
	}

	.btn {
		padding: 10px 20px;
		border-radius: 4px;
		border: none;
		cursor: pointer;
		font-size: 13px;
		font-weight: 500;
		font-family: 'Share Tech Mono', monospace;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		transition: all 0.2s ease;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background: #f97316;
		color: #000;
	}

	.btn-primary:hover:not(:disabled) {
		background: #ea580c;
		box-shadow: 0 0 20px rgba(249, 115, 22, 0.3);
	}

	.btn-secondary {
		background: transparent;
		border: 1px solid #333;
		color: #999;
	}

	.btn-secondary:hover:not(:disabled) {
		border-color: #f97316;
		color: #f97316;
	}

	.running-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 20;
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
		margin-top: 12px;
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
		to {
			transform: rotate(360deg);
		}
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

	@media (max-width: 768px) {
		.backtesting-step3-container {
			height: calc(100vh - 64px);
		}

		.step-header {
			flex-wrap: wrap;
			gap: 16px;
		}
	}

	:global(.light-mode) .backtesting-step3-container {
		background: #ffffff;
		color: #1a1a1a;
	}

	:global(.light-mode) .step-header {
		background: #f5f5f5;
		border-bottom-color: #e0e0e0;
	}

	:global(.light-mode) .step-actions,
	:global(.light-mode) .strategy-actions,
	:global(.light-mode) .results-actions {
		background: #f5f5f5;
		border-top-color: #e0e0e0;
	}
</style>
