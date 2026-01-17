<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import PnLDistributionChart from '$lib/components/PnLDistributionChart.svelte';
	import EquityCurveChart from '$lib/components/EquityCurveChart.svelte';

	let strategy: any = null;
	let loading = true;
	let error = '';

	// Pagination for trades
	let currentPage = 1;
	let tradesPerPage = 25;

	$: totalPages = strategy?.tradesData ? Math.ceil(strategy.tradesData.length / tradesPerPage) : 1;
	$: paginatedTrades = strategy?.tradesData
		? strategy.tradesData.slice((currentPage - 1) * tradesPerPage, currentPage * tradesPerPage)
		: [];
	$: startIndex = (currentPage - 1) * tradesPerPage;

	function nextPage() {
		if (currentPage < totalPages) currentPage++;
	}

	function prevPage() {
		if (currentPage > 1) currentPage--;
	}

	function goToPage(pageNum: number) {
		currentPage = pageNum;
	}

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
					<a href="/strategies" class="back-button">
						<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
							<path d="M12 4L6 10L12 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Back to Strategies
					</a>
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
					{#if strategy.largestWin && strategy.largestWin !== 0}
					<div class="metric-card">
						<span class="label">Largest Win</span>
						<span class="value positive">+{strategy.largestWin.toFixed(2)}%</span>
					</div>
					{/if}
					{#if strategy.largestLoss && strategy.largestLoss !== 0}
					<div class="metric-card">
						<span class="label">Largest Loss</span>
						<span class="value negative">{strategy.largestLoss.toFixed(2)}%</span>
					</div>
					{/if}
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

			<!-- Equity Curve -->
			{#if strategy.equityCurve && strategy.equityCurve.length > 0}
			<div class="section">
				<h2>Equity Curve</h2>
				<EquityCurveChart
					equityCurve={strategy.equityCurve}
					initialCapital={strategy.initialCapital}
				/>
			</div>
			{/if}

			<!-- P&L Distribution -->
			{#if strategy.pnlDistribution && Object.keys(strategy.pnlDistribution).length > 0}
				<PnLDistributionChart distribution={strategy.pnlDistribution} />
			{/if}

			<!-- Configuration -->
			<div class="section">
				<h2>Strategy Configuration</h2>
				<div class="config-grid">
					<div class="config-card">
						<div class="config-header">
							<h3>Time Period</h3>
						</div>
						<div class="config-item">
							<span class="config-label">Start Date</span>
							<span class="config-value">{formatDate(strategy.startDate)}</span>
						</div>
						<div class="config-item">
							<span class="config-label">End Date</span>
							<span class="config-value">{formatDate(strategy.endDate)}</span>
						</div>
					</div>

					<div class="config-card">
						<div class="config-header">
							<h3>Entry Rules</h3>
						</div>
						<div class="config-item">
							<span class="config-label">Entry Type</span>
							<span class="config-value">{strategy.entryType}</span>
						</div>
						{#if strategy.buyThreshold}
						<div class="config-item">
							<span class="config-label">Buy Threshold</span>
							<span class="config-value">{strategy.buyThreshold}%</span>
						</div>
						{/if}
						{#if strategy.sellThreshold}
						<div class="config-item">
							<span class="config-label">Sell Threshold</span>
							<span class="config-value">{strategy.sellThreshold}%</span>
						</div>
						{/if}
						{#if strategy.entryTimeConstraints}
						<div class="config-item">
							<span class="config-label">Time Constraints</span>
							<span class="config-value">{strategy.entryTimeConstraints}</span>
						</div>
						{/if}
					</div>

					<div class="config-card">
						<div class="config-header">
							<h3>Position Sizing</h3>
						</div>
						<div class="config-item">
							<span class="config-label">Sizing Type</span>
							<span class="config-value">{strategy.positionSizingType}</span>
						</div>
						<div class="config-item">
							<span class="config-label">Position Size</span>
							<span class="config-value">{strategy.positionSizingValue}%</span>
						</div>
						{#if strategy.maxPositionSize}
						<div class="config-item">
							<span class="config-label">Max Position</span>
							<span class="config-value">{strategy.maxPositionSize}%</span>
						</div>
						{/if}
					</div>

					<div class="config-card">
						<div class="config-header">
							<h3>Exit Rules</h3>
						</div>
						{#if strategy.stopLoss}
						<div class="config-item">
							<span class="config-label">Stop Loss</span>
							<span class="config-value negative">{strategy.stopLoss}%</span>
						</div>
						{/if}
						{#if strategy.takeProfit}
						<div class="config-item">
							<span class="config-label">Take Profit</span>
							<span class="config-value positive">{strategy.takeProfit}%</span>
						</div>
						{/if}
						{#if strategy.timeBasedExit}
						<div class="config-item">
							<span class="config-label">Time Exit</span>
							<span class="config-value">{strategy.timeBasedExit}h</span>
						</div>
						{/if}
						{#if strategy.useTrailingStop}
						<div class="config-item">
							<span class="config-label">Trailing Stop</span>
							<span class="config-value positive">Enabled</span>
						</div>
						{/if}
						{#if strategy.usePartialExits}
						<div class="config-item">
							<span class="config-label">Partial Exits</span>
							<span class="config-value positive">Enabled</span>
						</div>
						{/if}
						{#if !strategy.stopLoss && !strategy.takeProfit && !strategy.timeBasedExit && !strategy.useTrailingStop && !strategy.usePartialExits}
						<div class="config-item">
							<span class="config-value-muted">No exit rules configured</span>
						</div>
						{/if}
					</div>

					{#if strategy.maxTradesPerDay || strategy.tradeTimeStart || strategy.tradeTimeEnd}
					<div class="config-card">
						<div class="config-header">
							<h3>Trading Constraints</h3>
						</div>
						{#if strategy.maxTradesPerDay}
						<div class="config-item">
							<span class="config-label">Max Trades/Day</span>
							<span class="config-value">{strategy.maxTradesPerDay}</span>
						</div>
						{/if}
						{#if strategy.tradeTimeStart}
						<div class="config-item">
							<span class="config-label">Trading Start</span>
							<span class="config-value">{strategy.tradeTimeStart}</span>
						</div>
						{/if}
						{#if strategy.tradeTimeEnd}
						<div class="config-item">
							<span class="config-label">Trading End</span>
							<span class="config-value">{strategy.tradeTimeEnd}</span>
						</div>
						{/if}
					</div>
					{/if}
				</div>
			</div>

			<!-- Trades Table -->
			{#if strategy.tradesData && strategy.tradesData.length > 0}
			<div class="section">
				<div class="trades-header">
					<h2>All Trades ({strategy.tradesData.length})</h2>
					{#if totalPages > 1}
						<div class="pagination-info">
							Showing {startIndex + 1}-{Math.min(startIndex + tradesPerPage, strategy.tradesData.length)} of {strategy.tradesData.length}
						</div>
					{/if}
				</div>
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
							{#each paginatedTrades as trade, i}
								<tr>
									<td>{startIndex + i + 1}</td>
									<td>{new Date(trade.entryTime).toLocaleString()}</td>
									<td>{new Date(trade.exitTime).toLocaleString()}</td>
									<td>{trade.entryPrice.toFixed(4)}</td>
									<td>{trade.exitPrice.toFixed(4)}</td>
									<td>{formatCurrency(trade.amountInvested || 0)}</td>
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

				<!-- Pagination Controls -->
				{#if totalPages > 1}
					<div class="pagination">
						<button class="pagination-btn" on:click={prevPage} disabled={currentPage === 1}>
							<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
								<path d="M10 12L6 8l4-4"/>
							</svg>
							Previous
						</button>

						<div class="pagination-pages">
							{#each Array(totalPages) as _, i}
								{#if totalPages <= 7 || i < 3 || i > totalPages - 4 || (i >= currentPage - 2 && i <= currentPage)}
									<button
										class="pagination-page"
										class:active={currentPage === i + 1}
										on:click={() => goToPage(i + 1)}
									>
										{i + 1}
									</button>
								{:else if i === 3 || i === totalPages - 4}
									<span class="pagination-dots">...</span>
								{/if}
							{/each}
						</div>

						<button class="pagination-btn" on:click={nextPage} disabled={currentPage === totalPages}>
							Next
							<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
								<path d="M6 4l4 4-4 4"/>
							</svg>
						</button>
					</div>
				{/if}
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

	.back-button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		color: #8b92ab;
		text-decoration: none;
		font-size: 14px;
		margin-bottom: 16px;
		padding: 8px 12px;
		border-radius: 8px;
		background: transparent;
		border: 1px solid transparent;
		transition: all 0.2s ease;
		font-weight: 500;
	}

	.back-button:hover {
		color: #3b82f6;
		background: rgba(59, 130, 246, 0.1);
		border-color: rgba(59, 130, 246, 0.3);
	}

	.back-button svg {
		transition: transform 0.2s ease;
	}

	.back-button:hover svg {
		transform: translateX(-2px);
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
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 20px;
	}

	.config-card {
		background: #1a1f2e;
		border: 1px solid #252d42;
		border-radius: 12px;
		padding: 20px;
		transition: border-color 0.2s ease;
	}

	.config-card:hover {
		border-color: #3b4b6b;
	}

	.config-header {
		margin-bottom: 16px;
		padding-bottom: 12px;
		border-bottom: 1px solid #252d42;
	}

	.config-header h3 {
		color: white;
		font-size: 16px;
		font-weight: 600;
		margin: 0;
	}

	.config-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 0;
		border-bottom: 1px solid rgba(37, 45, 66, 0.3);
	}

	.config-item:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	.config-label {
		color: #8b92ab;
		font-size: 13px;
		font-weight: 500;
	}

	.config-value {
		color: white;
		font-size: 14px;
		font-weight: 600;
	}

	.config-value-muted {
		color: #6b7280;
		font-size: 13px;
		font-style: italic;
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

	.trades-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 24px;
	}

	.trades-header h2 {
		margin: 0;
	}

	.pagination-info {
		color: #8b92ab;
		font-size: 14px;
	}

	.pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 8px;
		margin-top: 24px;
		padding-top: 24px;
		border-top: 1px solid #1e2537;
	}

	.pagination-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		background: transparent;
		border: 1px solid #2a2f45;
		color: #8b92ab;
		border-radius: 6px;
		cursor: pointer;
		font-size: 14px;
		font-weight: 500;
		transition: all 0.2s;
	}

	.pagination-btn:hover:not(:disabled) {
		border-color: #3b82f6;
		color: #3b82f6;
		background: rgba(59, 130, 246, 0.05);
	}

	.pagination-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.pagination-pages {
		display: flex;
		gap: 4px;
	}

	.pagination-page {
		min-width: 36px;
		height: 36px;
		padding: 0 8px;
		background: transparent;
		border: 1px solid #2a2f45;
		color: #8b92ab;
		border-radius: 6px;
		cursor: pointer;
		font-size: 14px;
		font-weight: 500;
		transition: all 0.2s;
	}

	.pagination-page:hover {
		border-color: #3b82f6;
		color: #3b82f6;
		background: rgba(59, 130, 246, 0.05);
	}

	.pagination-page.active {
		background: #3b82f6;
		border-color: #3b82f6;
		color: white;
	}

	.pagination-dots {
		display: flex;
		align-items: center;
		padding: 0 8px;
		color: #6b7280;
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
