<script lang="ts">
	import { onMount } from 'svelte';
	import type { StrategyConfig, BacktestResult, BacktestTrade } from '$lib/backtesting/types';
	import EquityCurveChart from '$lib/components/EquityCurveChart.svelte';

	// UI State
	let activeTab: 'configure' | 'results' = 'configure';
	let isRunning = false;
	let progress = 0;
	let error = '';

	// Strategy Configuration
	let config: Partial<StrategyConfig> = {
		categories: [],
		minLiquidity: undefined,
		maxLiquidity: undefined,
		minTimeToResolution: undefined,
		maxTimeToResolution: undefined,
		entryType: 'BOTH',
		entryPriceThreshold: {
			yes: { min: undefined, max: undefined },
			no: { min: undefined, max: undefined }
		},
		exitRules: {
			resolveOnExpiry: true,
			stopLoss: undefined,
			takeProfit: undefined,
			maxHoldTime: undefined
		},
		positionSizing: {
			type: 'PERCENTAGE',
			fixedAmount: 100,
			percentageOfBankroll: 5
		},
		startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
		endDate: new Date(),
		initialBankroll: 10000
	};

	// Results
	let backtestResult: BacktestResult | null = null;
	let showProMetrics = false; // Toggle for pro metrics (implement subscription later)

	// Available categories
	const availableCategories = [
		'Politics',
		'Crypto',
		'Sports',
		'Business',
		'Science',
		'Entertainment',
		'Other'
	];

	async function runBacktest() {
		isRunning = true;
		error = '';
		progress = 0;

		try {
			// Validate configuration
			if (!config.startDate || !config.endDate) {
				throw new Error('Please select start and end dates');
			}

			if (!config.initialBankroll || config.initialBankroll <= 0) {
				throw new Error('Initial bankroll must be greater than 0');
			}

			// Simulate progress (actual backtest runs on server)
			const progressInterval = setInterval(() => {
				progress = Math.min(progress + 10, 90);
			}, 500);

			const response = await fetch('/api/backtest', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(config)
			});

			clearInterval(progressInterval);

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Backtest failed');
			}

			backtestResult = await response.json();
			progress = 100;
			activeTab = 'results';

			console.log('Backtest completed:', backtestResult);
		} catch (err: any) {
			error = err.message || 'An error occurred';
			console.error('Backtest error:', err);
		} finally {
			isRunning = false;
		}
	}

	function formatUSDC(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	}

	function formatPercentage(percentage: number): string {
		const sign = percentage >= 0 ? '+' : '';
		return `${sign}${percentage.toFixed(2)}%`;
	}

	function formatDate(date: Date | string): string {
		return new Date(date).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatDateTime(date: Date | string): string {
		return new Date(date).toLocaleString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	$: sortedTrades = backtestResult?.trades
		? [...backtestResult.trades].sort((a, b) => b.entryTime.getTime() - a.entryTime.getTime())
		: [];

	$: topTrades = backtestResult?.trades
		? [...backtestResult.trades].sort((a, b) => b.pnl - a.pnl).slice(0, 5)
		: [];

	$: worstTrades = backtestResult?.trades
		? [...backtestResult.trades].sort((a, b) => a.pnl - b.pnl).slice(0, 5)
		: [];

	function exportToCSV() {
		if (!backtestResult) return;

		// Create CSV content
		const headers = [
			'Market',
			'Side',
			'Entry Time',
			'Exit Time',
			'Entry Price',
			'Exit Price',
			'Amount Invested',
			'Shares',
			'P&L',
			'P&L %',
			'Fees',
			'Exit Reason'
		];

		const rows = backtestResult.trades.map((trade) => [
			trade.marketName,
			trade.side,
			formatDateTime(trade.entryTime),
			trade.exitTime ? formatDateTime(trade.exitTime) : 'N/A',
			trade.entryPrice.toFixed(4),
			trade.exitPrice.toFixed(4),
			trade.amountInvested.toFixed(2),
			trade.shares.toFixed(4),
			trade.pnl.toFixed(2),
			trade.pnlPercentage.toFixed(2),
			trade.fees.toFixed(2),
			trade.exitReason || 'N/A'
		]);

		const csvContent = [
			headers.join(','),
			...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))
		].join('\n');

		// Download file
		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const link = document.createElement('a');
		const url = URL.createObjectURL(blob);
		link.setAttribute('href', url);
		link.setAttribute('download', `backtest_results_${new Date().toISOString()}.csv`);
		link.style.visibility = 'hidden';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	function exportMetricsJSON() {
		if (!backtestResult) return;

		const data = {
			config: backtestResult.strategyConfig,
			metrics: backtestResult.metrics,
			summary: {
				startingCapital: backtestResult.startingCapital,
				endingCapital: backtestResult.endingCapital,
				marketsAnalyzed: backtestResult.marketsAnalyzed,
				executionTime: backtestResult.executionTime
			}
		};

		const blob = new Blob([JSON.stringify(data, null, 2)], {
			type: 'application/json;charset=utf-8;'
		});
		const link = document.createElement('a');
		const url = URL.createObjectURL(blob);
		link.setAttribute('href', url);
		link.setAttribute('download', `backtest_metrics_${new Date().toISOString()}.json`);
		link.style.visibility = 'hidden';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}
</script>

<div class="backtest-page">
	<div class="page-header">
		<h1>Advanced Strategy Backtesting</h1>
		<p class="subtitle">Test your trading strategies on historical prediction market data</p>
	</div>

	<!-- Tab Navigation -->
	<div class="tabs">
		<button
			class="tab"
			class:active={activeTab === 'configure'}
			on:click={() => (activeTab = 'configure')}
		>
			⚙️ Configure Strategy
		</button>
		<button
			class="tab"
			class:active={activeTab === 'results'}
			on:click={() => (activeTab = 'results')}
			disabled={!backtestResult}
		>
			📊 Results
		</button>
	</div>

	<!-- Configuration Panel -->
	{#if activeTab === 'configure'}
		<div class="config-panel">
			<!-- Date Range -->
			<div class="config-section">
				<h2>📅 Date Range</h2>
				<div class="form-grid">
					<div class="form-group">
						<label>Start Date</label>
						<input
							type="date"
							bind:value={config.startDate}
							max={new Date().toISOString().split('T')[0]}
						/>
					</div>
					<div class="form-group">
						<label>End Date</label>
						<input
							type="date"
							bind:value={config.endDate}
							max={new Date().toISOString().split('T')[0]}
						/>
					</div>
				</div>
			</div>

			<!-- Capital -->
			<div class="config-section">
				<h2>💰 Initial Capital</h2>
				<div class="form-group">
					<label>Starting Bankroll (USDC)</label>
					<input type="number" bind:value={config.initialBankroll} min="100" step="100" />
				</div>
			</div>

			<!-- Market Filters -->
			<div class="config-section">
				<h2>🎯 Market Filters</h2>
				<div class="form-group">
					<label>Categories (leave empty for all)</label>
					<div class="checkbox-group">
						{#each availableCategories as category}
							<label class="checkbox-label">
								<input
									type="checkbox"
									value={category}
									bind:group={config.categories}
								/>
								{category}
							</label>
						{/each}
					</div>
				</div>

				<div class="form-grid">
					<div class="form-group">
						<label>Min Liquidity (USDC)</label>
						<input type="number" bind:value={config.minLiquidity} min="0" step="1000" />
					</div>
					<div class="form-group">
						<label>Max Liquidity (USDC)</label>
						<input type="number" bind:value={config.maxLiquidity} min="0" step="1000" />
					</div>
				</div>

				<div class="form-grid">
					<div class="form-group">
						<label>Min Time to Resolution (hours)</label>
						<input type="number" bind:value={config.minTimeToResolution} min="0" step="1" />
					</div>
					<div class="form-group">
						<label>Max Time to Resolution (hours)</label>
						<input type="number" bind:value={config.maxTimeToResolution} min="0" step="1" />
					</div>
				</div>
			</div>

			<!-- Entry Rules -->
			<div class="config-section">
				<h2>📈 Entry Rules</h2>
				<div class="form-group">
					<label>Entry Type</label>
					<select bind:value={config.entryType}>
						<option value="YES">YES positions only</option>
						<option value="NO">NO positions only</option>
						<option value="BOTH">Both YES and NO</option>
					</select>
				</div>

				{#if config.entryType === 'YES' || config.entryType === 'BOTH'}
					<div class="form-grid">
						<div class="form-group">
							<label>YES Min Price (0-1)</label>
							<input
								type="number"
								bind:value={config.entryPriceThreshold.yes.min}
								min="0"
								max="1"
								step="0.01"
								placeholder="No minimum"
							/>
						</div>
						<div class="form-group">
							<label>YES Max Price (0-1)</label>
							<input
								type="number"
								bind:value={config.entryPriceThreshold.yes.max}
								min="0"
								max="1"
								step="0.01"
								placeholder="No maximum"
							/>
						</div>
					</div>
				{/if}

				{#if config.entryType === 'NO' || config.entryType === 'BOTH'}
					<div class="form-grid">
						<div class="form-group">
							<label>NO Min Price (0-1)</label>
							<input
								type="number"
								bind:value={config.entryPriceThreshold.no.min}
								min="0"
								max="1"
								step="0.01"
								placeholder="No minimum"
							/>
						</div>
						<div class="form-group">
							<label>NO Max Price (0-1)</label>
							<input
								type="number"
								bind:value={config.entryPriceThreshold.no.max}
								min="0"
								max="1"
								step="0.01"
								placeholder="No maximum"
							/>
						</div>
					</div>
				{/if}
			</div>

			<!-- Exit Rules -->
			<div class="config-section">
				<h2>📉 Exit Rules</h2>
				<div class="form-grid">
					<div class="form-group">
						<label>Stop Loss (%)</label>
						<input
							type="number"
							bind:value={config.exitRules.stopLoss}
							min="0"
							max="100"
							step="1"
							placeholder="No stop loss"
						/>
					</div>
					<div class="form-group">
						<label>Take Profit (%)</label>
						<input
							type="number"
							bind:value={config.exitRules.takeProfit}
							min="0"
							max="1000"
							step="1"
							placeholder="No take profit"
						/>
					</div>
				</div>

				<div class="form-group">
					<label>Max Hold Time (hours)</label>
					<input
						type="number"
						bind:value={config.exitRules.maxHoldTime}
						min="0"
						step="1"
						placeholder="Hold until resolution"
					/>
				</div>

				<label class="checkbox-label">
					<input type="checkbox" bind:checked={config.exitRules.resolveOnExpiry} />
					Close positions at market resolution
				</label>
			</div>

			<!-- Position Sizing -->
			<div class="config-section">
				<h2>💵 Position Sizing</h2>
				<div class="form-group">
					<label>Position Sizing Method</label>
					<select bind:value={config.positionSizing.type}>
						<option value="FIXED">Fixed Amount</option>
						<option value="PERCENTAGE">Percentage of Bankroll</option>
					</select>
				</div>

				{#if config.positionSizing.type === 'FIXED'}
					<div class="form-group">
						<label>Fixed Amount (USDC)</label>
						<input
							type="number"
							bind:value={config.positionSizing.fixedAmount}
							min="1"
							step="10"
						/>
					</div>
				{:else}
					<div class="form-group">
						<label>Percentage of Bankroll (%)</label>
						<input
							type="number"
							bind:value={config.positionSizing.percentageOfBankroll}
							min="1"
							max="100"
							step="1"
						/>
					</div>
				{/if}
			</div>

			<!-- Run Button -->
			<div class="run-section">
				{#if error}
					<div class="error-message">⚠️ {error}</div>
				{/if}

				<button class="btn-run" on:click={runBacktest} disabled={isRunning}>
					{#if isRunning}
						<span class="spinner-small"></span>
						Running Backtest... {progress}%
					{:else}
						🚀 Run Backtest
					{/if}
				</button>

				{#if isRunning}
					<div class="progress-bar">
						<div class="progress-fill" style="width: {progress}%"></div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Results Panel -->
	{#if activeTab === 'results' && backtestResult}
		<div class="results-panel">
			<!-- Export Buttons -->
			<div class="export-section">
				<button class="btn-export" on:click={exportToCSV}>
					📥 Export Trades (CSV)
				</button>
				<button class="btn-export" on:click={exportMetricsJSON}>
					📊 Export Metrics (JSON)
				</button>
			</div>

			<!-- Summary Header -->
			<div class="results-header">
				<div class="result-card">
					<div class="result-label">Execution Time</div>
					<div class="result-value">{(backtestResult.executionTime / 1000).toFixed(2)}s</div>
				</div>
				<div class="result-card">
					<div class="result-label">Markets Analyzed</div>
					<div class="result-value">{backtestResult.marketsAnalyzed}</div>
				</div>
				<div class="result-card">
					<div class="result-label">Trades Executed</div>
					<div class="result-value">{backtestResult.metrics.totalTrades}</div>
				</div>
				<div class="result-card">
					<div class="result-label">Final Capital</div>
					<div
						class="result-value"
						class:positive={backtestResult.endingCapital >= backtestResult.startingCapital}
						class:negative={backtestResult.endingCapital < backtestResult.startingCapital}
					>
						{formatUSDC(backtestResult.endingCapital)}
					</div>
				</div>
			</div>

			<!-- Free Metrics -->
			<div class="section">
				<h2>📊 Performance Metrics</h2>
				<div class="metrics-grid">
					<div class="metric-card">
						<div class="metric-label">Total Trades</div>
						<div class="metric-value">{backtestResult.metrics.totalTrades}</div>
						<div class="metric-sublabel">
							{backtestResult.metrics.winningTrades}W / {backtestResult.metrics.losingTrades}L
						</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Win Rate</div>
						<div
							class="metric-value"
							class:positive={backtestResult.metrics.winRate >= 50}
							class:negative={backtestResult.metrics.winRate < 50}
						>
							{backtestResult.metrics.winRate.toFixed(1)}%
						</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Net P&L</div>
						<div
							class="metric-value"
							class:positive={backtestResult.metrics.netPnl >= 0}
							class:negative={backtestResult.metrics.netPnl < 0}
						>
							{formatUSDC(backtestResult.metrics.netPnl)}
						</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">ROI</div>
						<div
							class="metric-value"
							class:positive={backtestResult.metrics.roi >= 0}
							class:negative={backtestResult.metrics.roi < 0}
						>
							{formatPercentage(backtestResult.metrics.roi)}
						</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Avg Win</div>
						<div class="metric-value positive">
							{formatUSDC(backtestResult.metrics.avgWin)}
						</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Avg Loss</div>
						<div class="metric-value negative">
							{formatUSDC(backtestResult.metrics.avgLoss)}
						</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Best Trade</div>
						<div class="metric-value positive">
							{formatUSDC(backtestResult.metrics.bestTrade)}
						</div>
					</div>
					<div class="metric-card">
						<div class="metric-label">Worst Trade</div>
						<div class="metric-value negative">
							{formatUSDC(backtestResult.metrics.worstTrade)}
						</div>
					</div>
				</div>
			</div>

			<!-- YES vs NO Performance -->
			<div class="section">
				<h2>🎯 Strategy Performance</h2>
				<div class="strategy-grid">
					<div class="strategy-card yes-card">
						<div class="strategy-header">
							<span class="strategy-badge yes">YES</span>
							<span class="strategy-count">{backtestResult.metrics.yesPerformance.count} trades</span>
						</div>
						<div class="strategy-metrics">
							<div class="strategy-metric">
								<span>Win Rate</span>
								<span class="value positive">{backtestResult.metrics.yesPerformance.winRate.toFixed(1)}%</span>
							</div>
							<div class="strategy-metric">
								<span>Total P&L</span>
								<span
									class="value"
									class:positive={backtestResult.metrics.yesPerformance.pnl >= 0}
									class:negative={backtestResult.metrics.yesPerformance.pnl < 0}
								>
									{formatUSDC(backtestResult.metrics.yesPerformance.pnl)}
								</span>
							</div>
						</div>
					</div>

					<div class="strategy-card no-card">
						<div class="strategy-header">
							<span class="strategy-badge no">NO</span>
							<span class="strategy-count">{backtestResult.metrics.noPerformance.count} trades</span>
						</div>
						<div class="strategy-metrics">
							<div class="strategy-metric">
								<span>Win Rate</span>
								<span class="value positive">{backtestResult.metrics.noPerformance.winRate.toFixed(1)}%</span>
							</div>
							<div class="strategy-metric">
								<span>Total P&L</span>
								<span
									class="value"
									class:positive={backtestResult.metrics.noPerformance.pnl >= 0}
									class:negative={backtestResult.metrics.noPerformance.pnl < 0}
								>
									{formatUSDC(backtestResult.metrics.noPerformance.pnl)}
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Pro Metrics Section -->
			<div class="section pro-section">
				<div class="pro-header">
					<h2>⭐ Professional Metrics</h2>
					<button class="btn-unlock" on:click={() => (showProMetrics = !showProMetrics)}>
						{showProMetrics ? '🔓 Hide' : '🔒 Show All (Free for now)'}
					</button>
				</div>

				{#if showProMetrics}
					<!-- Equity Curve Chart -->
					<div class="chart-section">
						<EquityCurveChart
							equityCurve={backtestResult.metrics.equityCurve}
							initialCapital={backtestResult.startingCapital}
						/>
					</div>

					<!-- Pro Metrics Grid -->
					<div class="metrics-grid">
						<div class="metric-card pro">
							<div class="metric-label">Max Drawdown</div>
							<div class="metric-value negative">
								{formatUSDC(backtestResult.metrics.maxDrawdown)}
							</div>
							<div class="metric-sublabel">
								{backtestResult.metrics.maxDrawdownPercentage.toFixed(2)}%
							</div>
						</div>
						<div class="metric-card pro">
							<div class="metric-label">Sharpe Ratio</div>
							<div class="metric-value">{backtestResult.metrics.sharpeRatio.toFixed(2)}</div>
						</div>
						<div class="metric-card pro">
							<div class="metric-label">Volatility</div>
							<div class="metric-value">{backtestResult.metrics.volatility.toFixed(2)}%</div>
						</div>
						<div class="metric-card pro">
							<div class="metric-label">Expectancy</div>
							<div class="metric-value">{formatUSDC(backtestResult.metrics.expectancy)}</div>
						</div>
						<div class="metric-card pro">
							<div class="metric-label">Median Win</div>
							<div class="metric-value positive">{formatUSDC(backtestResult.metrics.medianWin)}</div>
						</div>
						<div class="metric-card pro">
							<div class="metric-label">Median Loss</div>
							<div class="metric-value negative">{formatUSDC(backtestResult.metrics.medianLoss)}</div>
						</div>
						<div class="metric-card pro">
							<div class="metric-label">Avg Hold Time</div>
							<div class="metric-value">{backtestResult.metrics.avgHoldTime.toFixed(1)}h</div>
						</div>
						<div class="metric-card pro">
							<div class="metric-label">Profit Factor</div>
							<div class="metric-value">{backtestResult.metrics.profitFactor.toFixed(2)}</div>
						</div>
						<div class="metric-card pro">
							<div class="metric-label">Consecutive Wins</div>
							<div class="metric-value positive">{backtestResult.metrics.consecutiveWins}</div>
						</div>
						<div class="metric-card pro">
							<div class="metric-label">Consecutive Losses</div>
							<div class="metric-value negative">{backtestResult.metrics.consecutiveLosses}</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Top/Worst Trades -->
			<div class="section">
				<h2>🏆 Best & Worst Trades</h2>
				<div class="trades-comparison">
					<div class="trades-panel">
						<h3>Top 5 Trades</h3>
						{#each topTrades as trade}
							<div class="trade-item">
								<div class="trade-info">
									<div class="trade-market">{trade.marketName.substring(0, 50)}...</div>
									<div class="trade-meta">
										<span class="trade-badge {trade.side.toLowerCase()}">{trade.side}</span>
										<span class="trade-date">{formatDateTime(trade.entryTime)}</span>
									</div>
								</div>
								<div class="trade-result positive">
									{formatUSDC(trade.pnl)} ({formatPercentage(trade.pnlPercentage)})
								</div>
							</div>
						{/each}
					</div>

					<div class="trades-panel">
						<h3>Worst 5 Trades</h3>
						{#each worstTrades as trade}
							<div class="trade-item">
								<div class="trade-info">
									<div class="trade-market">{trade.marketName.substring(0, 50)}...</div>
									<div class="trade-meta">
										<span class="trade-badge {trade.side.toLowerCase()}">{trade.side}</span>
										<span class="trade-date">{formatDateTime(trade.entryTime)}</span>
									</div>
								</div>
								<div class="trade-result negative">
									{formatUSDC(trade.pnl)} ({formatPercentage(trade.pnlPercentage)})
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- All Trades Table -->
			<div class="section">
				<h2>📋 All Trades ({sortedTrades.length})</h2>
				<div class="trades-table">
					<table>
						<thead>
							<tr>
								<th>Market</th>
								<th>Side</th>
								<th>Entry</th>
								<th>Exit</th>
								<th>Entry Price</th>
								<th>Exit Price</th>
								<th>Amount</th>
								<th>P&L</th>
								<th>%</th>
								<th>Exit Reason</th>
							</tr>
						</thead>
						<tbody>
							{#each sortedTrades as trade}
								<tr>
									<td class="market-cell">{trade.marketName.substring(0, 40)}...</td>
									<td>
										<span class="trade-badge {trade.side.toLowerCase()}">{trade.side}</span>
									</td>
									<td>{formatDateTime(trade.entryTime)}</td>
									<td>{trade.exitTime ? formatDateTime(trade.exitTime) : '-'}</td>
									<td>{trade.entryPrice.toFixed(3)}</td>
									<td>{trade.exitPrice.toFixed(3)}</td>
									<td>{formatUSDC(trade.amountInvested)}</td>
									<td class:positive={trade.pnl >= 0} class:negative={trade.pnl < 0}>
										{formatUSDC(trade.pnl)}
									</td>
									<td class:positive={trade.pnl >= 0} class:negative={trade.pnl < 0}>
										{formatPercentage(trade.pnlPercentage)}
									</td>
									<td><span class="exit-reason">{trade.exitReason || '-'}</span></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.backtest-page {
		min-height: 100vh;
		background: #0a0e1a;
		color: white;
		padding: 40px 20px;
		max-width: 1600px;
		margin: 0 auto;
	}

	.page-header {
		text-align: center;
		margin-bottom: 32px;
	}

	.page-header h1 {
		font-size: 36px;
		font-weight: 700;
		margin: 0 0 8px 0;
	}

	.subtitle {
		color: #8b92ab;
		font-size: 16px;
		margin: 0;
	}

	/* Tabs */
	.tabs {
		display: flex;
		gap: 8px;
		margin-bottom: 24px;
		border-bottom: 2px solid #2a2f45;
	}

	.tab {
		background: transparent;
		border: none;
		color: #8b92ab;
		padding: 12px 24px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
		transition: all 0.2s;
	}

	.tab:hover:not(:disabled) {
		color: #00b4ff;
	}

	.tab.active {
		color: white;
		border-bottom-color: #00b4ff;
	}

	.tab:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Configuration Panel */
	.config-panel {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.config-section {
		background: #151b2f;
		border: 1px solid #2a2f45;
		border-radius: 12px;
		padding: 24px;
	}

	.config-section h2 {
		font-size: 18px;
		font-weight: 600;
		margin: 0 0 20px 0;
		color: #e8e8e8;
	}

	.form-group {
		margin-bottom: 16px;
	}

	.form-group label {
		display: block;
		font-size: 13px;
		font-weight: 600;
		color: #8b92ab;
		margin-bottom: 8px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.form-group input,
	.form-group select {
		width: 100%;
		background: #0a0e1a;
		border: 1px solid #2a2f45;
		border-radius: 8px;
		padding: 12px;
		color: white;
		font-size: 14px;
	}

	.form-group input:focus,
	.form-group select:focus {
		outline: none;
		border-color: #00b4ff;
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
	}

	.checkbox-group {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 12px;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		color: #e8e8e8;
		cursor: pointer;
		text-transform: none;
		font-weight: normal;
		letter-spacing: normal;
	}

	.checkbox-label input[type='checkbox'] {
		width: auto;
		cursor: pointer;
	}

	/* Run Section */
	.run-section {
		background: #151b2f;
		border: 1px solid #2a2f45;
		border-radius: 12px;
		padding: 24px;
		text-align: center;
	}

	.btn-run {
		background: linear-gradient(90deg, #00b4ff 0%, #00d084 100%);
		border: none;
		color: white;
		padding: 16px 48px;
		font-size: 16px;
		font-weight: 700;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.3s;
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}

	.btn-run:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 16px rgba(0, 180, 255, 0.3);
	}

	.btn-run:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.spinner-small {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.progress-bar {
		margin-top: 16px;
		height: 8px;
		background: #2a2f45;
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #00b4ff 0%, #00d084 100%);
		transition: width 0.3s ease;
	}

	.error-message {
		background: rgba(255, 107, 107, 0.1);
		border: 1px solid #ff6b6b;
		border-radius: 8px;
		padding: 12px;
		color: #ff6b6b;
		margin-bottom: 16px;
		font-size: 14px;
	}

	/* Results Panel */
	.results-panel {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.export-section {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
	}

	.btn-export {
		background: #151b2f;
		border: 1px solid #2a2f45;
		color: white;
		padding: 10px 20px;
		font-size: 14px;
		font-weight: 600;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-export:hover {
		background: #1f2637;
		border-color: #00b4ff;
		transform: translateY(-1px);
	}

	.results-header {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
	}

	.result-card {
		background: #151b2f;
		border: 1px solid #2a2f45;
		border-radius: 12px;
		padding: 20px;
		text-align: center;
	}

	.result-label {
		font-size: 12px;
		color: #8b92ab;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 8px;
		font-weight: 600;
	}

	.result-value {
		font-size: 24px;
		font-weight: 700;
		color: white;
	}

	/* Section */
	.section {
		background: #151b2f;
		border: 1px solid #2a2f45;
		border-radius: 12px;
		padding: 24px;
	}

	.section h2 {
		font-size: 20px;
		font-weight: 600;
		margin: 0 0 20px 0;
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
	}

	.metric-card {
		background: #0a0e1a;
		border: 1px solid #2a2f45;
		border-radius: 8px;
		padding: 20px;
	}

	.metric-card.pro {
		border-color: #00b4ff;
		background: rgba(0, 180, 255, 0.05);
	}

	.metric-label {
		font-size: 12px;
		color: #8b92ab;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 8px;
		font-weight: 600;
	}

	.metric-value {
		font-size: 24px;
		font-weight: 700;
		color: white;
	}

	.metric-sublabel {
		font-size: 11px;
		color: #6b7280;
		margin-top: 4px;
	}

	.positive {
		color: #00d68f !important;
	}

	.negative {
		color: #ff6b6b !important;
	}

	/* Strategy Cards */
	.strategy-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 20px;
	}

	.strategy-card {
		background: #0a0e1a;
		border: 1px solid #2a2f45;
		border-radius: 12px;
		padding: 24px;
	}

	.strategy-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
	}

	.strategy-badge {
		padding: 6px 12px;
		border-radius: 6px;
		font-size: 14px;
		font-weight: 700;
	}

	.strategy-badge.yes {
		background: rgba(0, 214, 143, 0.15);
		color: #00d68f;
		border: 1px solid #00d68f;
	}

	.strategy-badge.no {
		background: rgba(255, 107, 107, 0.15);
		color: #ff6b6b;
		border: 1px solid #ff6b6b;
	}

	.strategy-count {
		font-size: 12px;
		color: #8b92ab;
	}

	.strategy-metrics {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.strategy-metric {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 14px;
	}

	.strategy-metric .value {
		font-weight: 600;
	}

	/* Pro Section */
	.pro-section {
		border: 2px solid #00b4ff;
	}

	.pro-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
	}

	.btn-unlock {
		background: linear-gradient(90deg, #00b4ff 0%, #00d084 100%);
		border: none;
		color: white;
		padding: 8px 16px;
		font-size: 14px;
		font-weight: 600;
		border-radius: 6px;
		cursor: pointer;
	}

	.chart-section {
		margin-bottom: 24px;
	}

	/* Trades */
	.trades-comparison {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
		gap: 20px;
	}

	.trades-panel {
		background: #0a0e1a;
		border: 1px solid #2a2f45;
		border-radius: 12px;
		padding: 20px;
	}

	.trades-panel h3 {
		font-size: 16px;
		margin: 0 0 16px 0;
	}

	.trade-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px;
		background: #151b2f;
		border: 1px solid #2a2f45;
		border-radius: 8px;
		margin-bottom: 12px;
	}

	.trade-info {
		flex: 1;
		min-width: 0;
	}

	.trade-market {
		font-size: 13px;
		color: #e8e8e8;
		margin-bottom: 4px;
	}

	.trade-meta {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}

	.trade-badge {
		font-size: 10px;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 4px;
	}

	.trade-badge.yes {
		background: rgba(0, 214, 143, 0.1);
		color: #00d68f;
	}

	.trade-badge.no {
		background: rgba(255, 107, 107, 0.1);
		color: #ff6b6b;
	}

	.trade-date {
		font-size: 10px;
		color: #6b7280;
	}

	.trade-result {
		font-size: 14px;
		font-weight: 600;
		white-space: nowrap;
		margin-left: 12px;
	}

	/* Table */
	.trades-table {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}

	thead {
		background: #0a0e1a;
	}

	th {
		padding: 12px;
		text-align: left;
		font-weight: 600;
		color: #8b92ab;
		text-transform: uppercase;
		font-size: 11px;
		letter-spacing: 0.5px;
	}

	td {
		padding: 12px;
		border-top: 1px solid #2a2f45;
		color: #e8e8e8;
	}

	.market-cell {
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.exit-reason {
		font-size: 11px;
		padding: 2px 6px;
		background: #2a2f45;
		border-radius: 4px;
		color: #8b92ab;
	}

	@media (max-width: 768px) {
		.backtest-page {
			padding: 20px 12px;
		}

		.page-header h1 {
			font-size: 24px;
		}

		.form-grid {
			grid-template-columns: 1fr;
		}

		.results-header {
			grid-template-columns: 1fr 1fr;
		}

		.metrics-grid {
			grid-template-columns: 1fr;
		}

		.strategy-grid,
		.trades-comparison {
			grid-template-columns: 1fr;
		}
	}
</style>
