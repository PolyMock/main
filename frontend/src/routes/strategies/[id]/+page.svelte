<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import PnLDistributionChart from '$lib/components/PnLDistributionChart.svelte';

	let strategy: any = null;
	let loading = true;
	let error = '';

	onMount(async () => {
		const strategyId = $page.params.id;

		try {
			const res = await fetch(`/api/strategies/${strategyId}`);
			if (!res.ok) {
				if (res.status === 401) {
					goto('/strategies');
					return;
				}
				throw new Error('Failed to load strategy');
			}

			const data = await res.json();
			strategy = data.strategy;
		} catch (err: any) {
			error = err.message;
		} finally {
			loading = false;
		}
	});

	function formatCurrency(value: number) {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(value);
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="strategy-detail-page">
	{#if loading}
		<div class="loading">Loading strategy...</div>
	{:else if error}
		<div class="error">
			<h2>Error</h2>
			<p>{error}</p>
			<a href="/strategies" class="btn-back">Back to Strategies</a>
		</div>
	{:else if strategy}
		<div class="container">
			<!-- Header -->
			<div class="header">
				<div>
					<a href="/strategies" class="back-link">← Back to Strategies</a>
					<h1>{strategy.strategyName}</h1>
					<p class="market-question">{strategy.marketQuestion}</p>
				</div>
				<div class="header-stats">
					<div class="stat-box">
						<span class="stat-label">Total Return</span>
						<span class="stat-value" class:positive={strategy.totalReturnPercent > 0} class:negative={strategy.totalReturnPercent < 0}>
							{strategy.totalReturnPercent > 0 ? '+' : ''}{strategy.totalReturnPercent.toFixed(2)}%
						</span>
					</div>
					<div class="stat-box">
						<span class="stat-label">Final Capital</span>
						<span class="stat-value">{formatCurrency(strategy.finalCapital)}</span>
					</div>
				</div>
			</div>

			<!-- Performance Metrics -->
			<div class="section">
				<h2>Performance Metrics</h2>
				<div class="metrics-grid">
					<div class="metric-card">
						<span class="label">Initial Capital</span>
						<span class="value">{formatCurrency(strategy.initialCapital)}</span>
					</div>
					<div class="metric-card">
						<span class="label">Final Capital</span>
						<span class="value">{formatCurrency(strategy.finalCapital)}</span>
					</div>
					<div class="metric-card">
						<span class="label">Total Trades</span>
						<span class="value">{strategy.totalTrades}</span>
					</div>
					<div class="metric-card">
						<span class="label">Win Rate</span>
						<span class="value">{strategy.winRate.toFixed(1)}%</span>
					</div>
					<div class="metric-card">
						<span class="label">Winning Trades</span>
						<span class="value positive">{strategy.winningTrades}</span>
					</div>
					<div class="metric-card">
						<span class="label">Losing Trades</span>
						<span class="value negative">{strategy.losingTrades}</span>
					</div>
					<div class="metric-card">
						<span class="label">Avg Win</span>
						<span class="value positive">+{strategy.avgWin.toFixed(2)}%</span>
					</div>
					<div class="metric-card">
						<span class="label">Avg Loss</span>
						<span class="value negative">{strategy.avgLoss.toFixed(2)}%</span>
					</div>
					<div class="metric-card">
						<span class="label">Largest Win</span>
						<span class="value positive">+{strategy.largestWin.toFixed(2)}%</span>
					</div>
					<div class="metric-card">
						<span class="label">Largest Loss</span>
						<span class="value negative">{strategy.largestLoss.toFixed(2)}%</span>
					</div>
					<div class="metric-card">
						<span class="label">Profit Factor</span>
						<span class="value">{strategy.profitFactor ? strategy.profitFactor.toFixed(2) : 'N/A'}</span>
					</div>
					<div class="metric-card">
						<span class="label">Max Drawdown</span>
						<span class="value">{strategy.maxDrawdown ? strategy.maxDrawdown.toFixed(2) + '%' : 'N/A'}</span>
					</div>
				</div>
			</div>

			<!-- P&L Distribution -->
			{#if strategy.pnlDistribution && Object.keys(strategy.pnlDistribution).length > 0}
				<PnLDistributionChart distribution={strategy.pnlDistribution} />
			{/if}

			<!-- Configuration -->
			<div class="section">
				<h2>Strategy Configuration</h2>
				<div class="config-grid">
					<div class="config-section">
						<h3>Time Period</h3>
						<p><strong>Start:</strong> {formatDate(strategy.startDate)}</p>
						<p><strong>End:</strong> {formatDate(strategy.endDate)}</p>
					</div>

					<div class="config-section">
						<h3>Entry Rules</h3>
						<p><strong>Type:</strong> {strategy.entryType}</p>
					</div>

					<div class="config-section">
						<h3>Position Sizing</h3>
						<p><strong>Type:</strong> {strategy.positionSizingType}</p>
						<p><strong>Value:</strong> {strategy.positionSizingValue}%</p>
						{#if strategy.maxPositionSize}
							<p><strong>Max Position:</strong> {strategy.maxPositionSize}%</p>
						{/if}
					</div>

					<div class="config-section">
						<h3>Exit Rules</h3>
						{#if strategy.stopLoss}
							<p><strong>Stop Loss:</strong> {strategy.stopLoss}%</p>
						{/if}
						{#if strategy.takeProfit}
							<p><strong>Take Profit:</strong> {strategy.takeProfit}%</p>
						{/if}
						{#if strategy.timeBasedExit}
							<p><strong>Time Exit:</strong> {strategy.timeBasedExit}h</p>
						{/if}
						{#if !strategy.stopLoss && !strategy.takeProfit && !strategy.timeBasedExit}
							<p>No exit rules configured</p>
						{/if}
					</div>
				</div>
			</div>

			<!-- Trades Table -->
			{#if strategy.tradesData && strategy.tradesData.length > 0}
			<div class="section">
				<h2>All Trades ({strategy.tradesData.length})</h2>
				<div class="table-container">
					<table class="trades-table">
						<thead>
							<tr>
								<th>#</th>
								<th>Entry Time</th>
								<th>Exit Time</th>
								<th>Entry Price</th>
								<th>Exit Price</th>
								<th>Position Size</th>
								<th>P&L</th>
								<th>P&L %</th>
							</tr>
						</thead>
						<tbody>
							{#each strategy.tradesData as trade, i}
								<tr>
									<td>{i + 1}</td>
									<td>{new Date(trade.entryTime).toLocaleString()}</td>
									<td>{new Date(trade.exitTime).toLocaleString()}</td>
									<td>{trade.entryPrice.toFixed(4)}</td>
									<td>{trade.exitPrice.toFixed(4)}</td>
									<td>{formatCurrency(trade.positionSize)}</td>
									<td class:positive={trade.pnl > 0} class:negative={trade.pnl < 0}>
										{formatCurrency(trade.pnl)}
									</td>
									<td class:positive={trade.pnlPercentage > 0} class:negative={trade.pnlPercentage < 0}>
										{trade.pnlPercentage > 0 ? '+' : ''}{trade.pnlPercentage.toFixed(2)}%
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
			{/if}

			<div class="footer">
				<p>Strategy saved on {formatDate(strategy.createdAt)}</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.strategy-detail-page {
		min-height: 100vh;
		background: #0a0e1a;
		padding: 40px 20px;
	}

	.container {
		max-width: 1400px;
		margin: 0 auto;
	}

	.loading,
	.error {
		text-align: center;
		padding: 80px 20px;
		color: #8b92ab;
	}

	.error h2 {
		color: white;
		margin-bottom: 12px;
	}

	.btn-back {
		display: inline-block;
		padding: 10px 20px;
		background: #3b82f6;
		color: white;
		text-decoration: none;
		border-radius: 6px;
		margin-top: 20px;
	}

	.header {
		margin-bottom: 40px;
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 40px;
	}

	.back-link {
		color: #8b92ab;
		text-decoration: none;
		font-size: 14px;
		margin-bottom: 12px;
		display: inline-block;
	}

	.back-link:hover {
		color: #3b82f6;
	}

	h1 {
		color: white;
		font-size: 32px;
		font-weight: 700;
		margin: 8px 0;
	}

	.market-question {
		color: #8b92ab;
		font-size: 16px;
		margin: 8px 0 0 0;
	}

	.header-stats {
		display: flex;
		gap: 20px;
	}

	.stat-box {
		background: #141824;
		border: 1px solid #1e2537;
		border-radius: 12px;
		padding: 20px;
		min-width: 200px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.stat-label {
		font-size: 12px;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: 600;
	}

	.stat-value {
		font-size: 28px;
		color: white;
		font-weight: 700;
	}

	.section {
		background: #141824;
		border: 1px solid #1e2537;
		border-radius: 12px;
		padding: 32px;
		margin-bottom: 24px;
	}

	.section h2 {
		color: white;
		font-size: 20px;
		font-weight: 700;
		margin: 0 0 24px 0;
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
	}

	.metric-card {
		background: #1a1f2e;
		border: 1px solid #252d42;
		border-radius: 8px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.metric-card .label {
		font-size: 12px;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: 600;
	}

	.metric-card .value {
		font-size: 20px;
		color: white;
		font-weight: 700;
	}

	.config-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 24px;
	}

	.config-section h3 {
		color: white;
		font-size: 16px;
		font-weight: 600;
		margin: 0 0 12px 0;
	}

	.config-section p {
		color: #8b92ab;
		font-size: 14px;
		margin: 6px 0;
	}

	.table-container {
		overflow-x: auto;
	}

	.trades-table {
		width: 100%;
		border-collapse: collapse;
	}

	.trades-table th {
		background: #1a1f2e;
		color: #8b92ab;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		padding: 12px;
		text-align: left;
		border-bottom: 1px solid #252d42;
	}

	.trades-table td {
		padding: 12px;
		color: #d1d5db;
		font-size: 14px;
		border-bottom: 1px solid #1e2537;
	}

	.trades-table tr:hover {
		background: #1a1f2e;
	}

	.positive {
		color: #10b981 !important;
	}

	.negative {
		color: #ef4444 !important;
	}

	.footer {
		text-align: center;
		padding: 40px 20px;
		color: #6b7280;
		font-size: 14px;
	}

	@media (max-width: 768px) {
		.header {
			flex-direction: column;
		}

		.header-stats {
			width: 100%;
			flex-direction: column;
		}

		.stat-box {
			width: 100%;
		}

		.metrics-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.config-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
