<script lang="ts">
	import { onMount } from 'svelte';
	import { walletStore } from '$lib/wallet/stores';
	import { polymarketService } from '$lib/solana/polymarket-service';
	import { PublicKey } from '@solana/web3.js';

	interface Position {
		id: string;
		marketId: string;
		marketName: string;
		predictionType: 'Yes' | 'No';
		amountUsdc: number;
		shares: number;
		pricePerShare: number;
		currentPrice: number;
		pnl: number;
		pnlPercentage: number;
		status: 'Active' | 'Closed';
		openedAt: Date;
	}

	interface PerformanceMetrics {
		totalTrades: number;
		winningTrades: number;
		losingTrades: number;
		winRate: number;
		totalPnl: number;
		totalInvested: number;
		roi: number;
		avgWin: number;
		avgLoss: number;
		profitFactor: number;
		largestWin: number;
		largestLoss: number;
		avgHoldTime: number;
	}

	interface StrategyMetrics {
		yesWinRate: number;
		noWinRate: number;
		yesPnl: number;
		noPnl: number;
		yesCount: number;
		noCount: number;
		yesAvgReturn: number;
		noAvgReturn: number;
	}

	let positions: Position[] = [];
	let loading = true;
	let walletState = $walletStore;
	let performanceMetrics: PerformanceMetrics = {
		totalTrades: 0,
		winningTrades: 0,
		losingTrades: 0,
		winRate: 0,
		totalPnl: 0,
		totalInvested: 0,
		roi: 0,
		avgWin: 0,
		avgLoss: 0,
		profitFactor: 0,
		largestWin: 0,
		largestLoss: 0,
		avgHoldTime: 0
	};
	let strategyMetrics: StrategyMetrics = {
		yesWinRate: 0,
		noWinRate: 0,
		yesPnl: 0,
		noPnl: 0,
		yesCount: 0,
		noCount: 0,
		yesAvgReturn: 0,
		noAvgReturn: 0
	};

	// Subscribe to wallet state
	walletStore.subscribe(value => {
		walletState = value;
		if (value.connected && value.publicKey) {
			loadBacktestingData();
		}
	});

	onMount(async () => {
		if (walletState.connected && walletState.publicKey) {
			await loadBacktestingData();
		} else {
			loading = false;
		}
	});

	async function loadBacktestingData() {
		if (!walletState.publicKey) {
			loading = false;
			return;
		}

		loading = true;
		try {
			const userPublicKey = new PublicKey(walletState.publicKey.toString());
			const blockchainPositions = await polymarketService.getUserPositions(userPublicKey);

			// Convert blockchain positions to display format
			positions = blockchainPositions.map((pos, index) => {
				const isYes = 'yes' in pos.predictionType;
				const amountUsdc = pos.amountUsdc.toNumber() / 1_000_000;
				const shares = pos.shares.toNumber() / 1_000_000;
				const pricePerShare = pos.pricePerShare.toNumber() / 1_000_000;

				// For now, use entry price as current price
				const currentPrice = pricePerShare;
				const currentValue = shares * currentPrice;
				const pnl = currentValue - amountUsdc;
				const pnlPercentage = (pnl / amountUsdc) * 100;

				return {
					id: pos.positionId.toString(),
					marketId: pos.marketId,
					marketName: `Market ${pos.marketId.slice(0, 10)}...`,
					predictionType: isYes ? 'Yes' : 'No',
					amountUsdc,
					shares,
					pricePerShare,
					currentPrice,
					pnl,
					pnlPercentage,
					status: 'active' in pos.status ? 'Active' : 'Closed',
					openedAt: new Date(pos.openedAt.toNumber() * 1000)
				};
			});

			calculateMetrics();
		} catch (error) {
			console.error('Error loading backtesting data:', error);
			positions = [];
		} finally {
			loading = false;
		}
	}

	function calculateMetrics() {
		if (positions.length === 0) return;

		// Performance Metrics
		const closedPositions = positions.filter(p => p.status === 'Closed');
		const winningPositions = closedPositions.filter(p => p.pnl > 0);
		const losingPositions = closedPositions.filter(p => p.pnl < 0);

		const totalPnl = closedPositions.reduce((sum, p) => sum + p.pnl, 0);
		const totalInvested = closedPositions.reduce((sum, p) => sum + p.amountUsdc, 0);

		const totalWinAmount = winningPositions.reduce((sum, p) => sum + p.pnl, 0);
		const totalLossAmount = Math.abs(losingPositions.reduce((sum, p) => sum + p.pnl, 0));

		performanceMetrics = {
			totalTrades: closedPositions.length,
			winningTrades: winningPositions.length,
			losingTrades: losingPositions.length,
			winRate: closedPositions.length > 0 ? (winningPositions.length / closedPositions.length) * 100 : 0,
			totalPnl,
			totalInvested,
			roi: totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0,
			avgWin: winningPositions.length > 0 ? totalWinAmount / winningPositions.length : 0,
			avgLoss: losingPositions.length > 0 ? totalLossAmount / losingPositions.length : 0,
			profitFactor: totalLossAmount > 0 ? totalWinAmount / totalLossAmount : totalWinAmount > 0 ? 999 : 0,
			largestWin: winningPositions.length > 0 ? Math.max(...winningPositions.map(p => p.pnl)) : 0,
			largestLoss: losingPositions.length > 0 ? Math.min(...losingPositions.map(p => p.pnl)) : 0,
			avgHoldTime: 0 // Would need closed time to calculate
		};

		// Strategy Metrics
		const yesPositions = closedPositions.filter(p => p.predictionType === 'Yes');
		const noPositions = closedPositions.filter(p => p.predictionType === 'No');

		const yesWins = yesPositions.filter(p => p.pnl > 0);
		const noWins = noPositions.filter(p => p.pnl > 0);

		const yesPnl = yesPositions.reduce((sum, p) => sum + p.pnl, 0);
		const noPnl = noPositions.reduce((sum, p) => sum + p.pnl, 0);

		strategyMetrics = {
			yesWinRate: yesPositions.length > 0 ? (yesWins.length / yesPositions.length) * 100 : 0,
			noWinRate: noPositions.length > 0 ? (noWins.length / noPositions.length) * 100 : 0,
			yesPnl,
			noPnl,
			yesCount: yesPositions.length,
			noCount: noPositions.length,
			yesAvgReturn: yesPositions.length > 0 ? yesPnl / yesPositions.length : 0,
			noAvgReturn: noPositions.length > 0 ? noPnl / noPositions.length : 0
		};
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

	$: bestTrades = [...positions]
		.filter(p => p.status === 'Closed')
		.sort((a, b) => b.pnlPercentage - a.pnlPercentage)
		.slice(0, 5);

	$: worstTrades = [...positions]
		.filter(p => p.status === 'Closed')
		.sort((a, b) => a.pnlPercentage - b.pnlPercentage)
		.slice(0, 5);

	$: insights = generateInsights();

	function generateInsights(): string[] {
		const insights: string[] = [];

		if (performanceMetrics.totalTrades === 0) {
			return ['No closed positions yet. Start trading to see analytics!'];
		}

		// Win rate insights
		if (performanceMetrics.winRate > 60) {
			insights.push(` Excellent win rate of ${performanceMetrics.winRate.toFixed(1)}% - You're performing above average!`);
		} else if (performanceMetrics.winRate < 40) {
			insights.push(` Win rate is ${performanceMetrics.winRate.toFixed(1)}% - Consider reviewing your strategy selection.`);
		}

		// Strategy insights
		if (strategyMetrics.yesCount > 0 && strategyMetrics.noCount > 0) {
			if (strategyMetrics.yesWinRate > strategyMetrics.noWinRate + 10) {
				insights.push(` YES positions perform ${(strategyMetrics.yesWinRate - strategyMetrics.noWinRate).toFixed(1)}% better - Focus on YES strategies.`);
			} else if (strategyMetrics.noWinRate > strategyMetrics.yesWinRate + 10) {
				insights.push(` NO positions perform ${(strategyMetrics.noWinRate - strategyMetrics.yesWinRate).toFixed(1)}% better - Focus on NO strategies.`);
			}
		}

		// ROI insights
		if (performanceMetrics.roi > 20) {
			insights.push(` Strong ROI of ${performanceMetrics.roi.toFixed(1)}% - Your strategy is highly profitable!`);
		} else if (performanceMetrics.roi < 0) {
			insights.push(` Negative ROI of ${performanceMetrics.roi.toFixed(1)}% - Review position sizing and market selection.`);
		}

		// Profit factor insights
		if (performanceMetrics.profitFactor > 2) {
			insights.push(` Profit factor of ${performanceMetrics.profitFactor.toFixed(2)} indicates strong risk management.`);
		} else if (performanceMetrics.profitFactor < 1) {
			insights.push(` Profit factor below 1.0 means losses exceed wins - Adjust your strategy.`);
		}

		// Risk management insights
		if (Math.abs(performanceMetrics.largestLoss) > performanceMetrics.avgWin * 3) {
			insights.push(` Largest loss is ${Math.abs(performanceMetrics.largestLoss / performanceMetrics.avgWin).toFixed(1)}x your average win - Consider stop losses.`);
		}

		if (insights.length === 0) {
			insights.push(' Keep trading to generate more insights!');
		}

		return insights;
	}
</script>

<div class="backtesting-container">
	<div class="page-header">
		<h1>Strategy Backtesting</h1>
		<p class="subtitle">Analyze your performance and optimize your trading strategy</p>
	</div>

	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>Loading analytics...</p>
		</div>
	{:else if !walletState.connected}
		<div class="empty-state">
			<div class="empty-icon"></div>
			<h3>Wallet Not Connected</h3>
			<p>Please connect your wallet to view backtesting analytics</p>
		</div>
	{:else if positions.length === 0}
		<div class="empty-state">
			<div class="empty-icon"></div>
			<h3>No Trading History</h3>
			<p>Start trading to build your performance history and analytics</p>
		</div>
	{:else}
		<!-- Performance Overview -->
		<div class="section">
			<h2>Performance Overview</h2>
			<div class="metrics-grid">
				<div class="metric-card">
					<div class="metric-label">Total Trades</div>
					<div class="metric-value">{performanceMetrics.totalTrades}</div>
					<div class="metric-sublabel">
						{performanceMetrics.winningTrades}W / {performanceMetrics.losingTrades}L
					</div>
				</div>
				<div class="metric-card">
					<div class="metric-label">Win Rate</div>
					<div class="metric-value" class:positive={performanceMetrics.winRate >= 50} class:negative={performanceMetrics.winRate < 50}>
						{performanceMetrics.winRate.toFixed(1)}%
					</div>
					<div class="metric-progress">
						<div class="progress-bar" style="width: {performanceMetrics.winRate}%"></div>
					</div>
				</div>
				<div class="metric-card">
					<div class="metric-label">Total P&L</div>
					<div class="metric-value" class:positive={performanceMetrics.totalPnl >= 0} class:negative={performanceMetrics.totalPnl < 0}>
						{formatUSDC(performanceMetrics.totalPnl)}
					</div>
					<div class="metric-sublabel">
						on {formatUSDC(performanceMetrics.totalInvested)} invested
					</div>
				</div>
				<div class="metric-card">
					<div class="metric-label">ROI</div>
					<div class="metric-value" class:positive={performanceMetrics.roi >= 0} class:negative={performanceMetrics.roi < 0}>
						{formatPercentage(performanceMetrics.roi)}
					</div>
					<div class="metric-sublabel">Return on Investment</div>
				</div>
				<div class="metric-card">
					<div class="metric-label">Avg Win</div>
					<div class="metric-value positive">
						{formatUSDC(performanceMetrics.avgWin)}
					</div>
					<div class="metric-sublabel">per winning trade</div>
				</div>
				<div class="metric-card">
					<div class="metric-label">Avg Loss</div>
					<div class="metric-value negative">
						{formatUSDC(performanceMetrics.avgLoss)}
					</div>
					<div class="metric-sublabel">per losing trade</div>
				</div>
				<div class="metric-card">
					<div class="metric-label">Profit Factor</div>
					<div class="metric-value" class:positive={performanceMetrics.profitFactor >= 1} class:negative={performanceMetrics.profitFactor < 1}>
						{performanceMetrics.profitFactor.toFixed(2)}
					</div>
					<div class="metric-sublabel">wins / losses ratio</div>
				</div>
				<div class="metric-card">
					<div class="metric-label">Best Trade</div>
					<div class="metric-value positive">
						{formatUSDC(performanceMetrics.largestWin)}
					</div>
					<div class="metric-sublabel">largest winner</div>
				</div>
			</div>
		</div>

		<!-- Strategy Analysis -->
		<div class="section">
			<h2>Strategy Performance</h2>
			<div class="strategy-grid">
				<div class="strategy-card yes-card">
					<div class="strategy-header">
						<span class="strategy-badge yes">YES</span>
						<span class="strategy-count">{strategyMetrics.yesCount} trades</span>
					</div>
					<div class="strategy-metrics">
						<div class="strategy-metric">
							<span class="strategy-metric-label">Win Rate</span>
							<span class="strategy-metric-value" class:positive={strategyMetrics.yesWinRate >= 50}>
								{strategyMetrics.yesWinRate.toFixed(1)}%
							</span>
						</div>
						<div class="strategy-metric">
							<span class="strategy-metric-label">Total P&L</span>
							<span class="strategy-metric-value" class:positive={strategyMetrics.yesPnl >= 0} class:negative={strategyMetrics.yesPnl < 0}>
								{formatUSDC(strategyMetrics.yesPnl)}
							</span>
						</div>
						<div class="strategy-metric">
							<span class="strategy-metric-label">Avg Return</span>
							<span class="strategy-metric-value" class:positive={strategyMetrics.yesAvgReturn >= 0} class:negative={strategyMetrics.yesAvgReturn < 0}>
								{formatUSDC(strategyMetrics.yesAvgReturn)}
							</span>
						</div>
					</div>
					<div class="strategy-bar">
						<div class="bar-fill yes-bar" style="width: {Math.min(strategyMetrics.yesWinRate, 100)}%"></div>
					</div>
				</div>

				<div class="strategy-card no-card">
					<div class="strategy-header">
						<span class="strategy-badge no">NO</span>
						<span class="strategy-count">{strategyMetrics.noCount} trades</span>
					</div>
					<div class="strategy-metrics">
						<div class="strategy-metric">
							<span class="strategy-metric-label">Win Rate</span>
							<span class="strategy-metric-value" class:positive={strategyMetrics.noWinRate >= 50}>
								{strategyMetrics.noWinRate.toFixed(1)}%
							</span>
						</div>
						<div class="strategy-metric">
							<span class="strategy-metric-label">Total P&L</span>
							<span class="strategy-metric-value" class:positive={strategyMetrics.noPnl >= 0} class:negative={strategyMetrics.noPnl < 0}>
								{formatUSDC(strategyMetrics.noPnl)}
							</span>
						</div>
						<div class="strategy-metric">
							<span class="strategy-metric-label">Avg Return</span>
							<span class="strategy-metric-value" class:positive={strategyMetrics.noAvgReturn >= 0} class:negative={strategyMetrics.noAvgReturn < 0}>
								{formatUSDC(strategyMetrics.noAvgReturn)}
							</span>
						</div>
					</div>
					<div class="strategy-bar">
						<div class="bar-fill no-bar" style="width: {Math.min(strategyMetrics.noWinRate, 100)}%"></div>
					</div>
				</div>
			</div>
		</div>

		<!-- Best/Worst Trades -->
		<div class="section">
			<div class="trades-comparison">
				<div class="trades-panel">
					<h2> Best Trades</h2>
					<div class="trades-list">
						{#each bestTrades as trade (trade.id)}
							<div class="trade-item">
								<div class="trade-info">
									<span class="trade-market">{trade.marketName}</span>
									<span class="trade-type" class:yes={trade.predictionType === 'Yes'} class:no={trade.predictionType === 'No'}>
										{trade.predictionType}
									</span>
								</div>
								<div class="trade-result positive">
									{formatUSDC(trade.pnl)} ({formatPercentage(trade.pnlPercentage)})
								</div>
							</div>
						{/each}
						{#if bestTrades.length === 0}
							<div class="no-trades">No closed trades yet</div>
						{/if}
					</div>
				</div>

				<div class="trades-panel">
					<h2> Worst Trades</h2>
					<div class="trades-list">
						{#each worstTrades as trade (trade.id)}
							<div class="trade-item">
								<div class="trade-info">
									<span class="trade-market">{trade.marketName}</span>
									<span class="trade-type" class:yes={trade.predictionType === 'Yes'} class:no={trade.predictionType === 'No'}>
										{trade.predictionType}
									</span>
								</div>
								<div class="trade-result negative">
									{formatUSDC(trade.pnl)} ({formatPercentage(trade.pnlPercentage)})
								</div>
							</div>
						{/each}
						{#if worstTrades.length === 0}
							<div class="no-trades">No closed trades yet</div>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Insights & Recommendations -->
		<div class="section">
			<h2> Insights & Recommendations</h2>
			<div class="insights-grid">
				{#each insights as insight}
					<div class="insight-card">
						<p>{insight}</p>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.backtesting-container {
		min-height: 100vh;
		background: #0A0E1A;
		color: white;
		padding: 40px 20px;
		max-width: 1400px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: 40px;
		text-align: center;
	}

	.page-header h1 {
		font-size: 36px;
		font-weight: 700;
		margin: 0 0 8px 0;
		background: linear-gradient(135deg, #00B4FF 0%, #00D084 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.subtitle {
		color: #8B92AB;
		font-size: 16px;
		margin: 0;
	}

	.section {
		margin-bottom: 40px;
		background: #151B2F;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		padding: 24px;
	}

	.section h2 {
		font-size: 20px;
		font-weight: 600;
		margin: 0 0 20px 0;
		color: #E8E8E8;
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
	}

	.metric-card {
		background: #0A0E1A;
		border: 1px solid #2A2F45;
		border-radius: 8px;
		padding: 20px;
	}

	.metric-label {
		font-size: 12px;
		color: #8B92AB;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 8px;
		font-weight: 600;
	}

	.metric-value {
		font-size: 28px;
		font-weight: 700;
		color: white;
		margin-bottom: 4px;
	}

	.metric-value.positive {
		color: #00D68F;
	}

	.metric-value.negative {
		color: #FF6B6B;
	}

	.metric-sublabel {
		font-size: 11px;
		color: #6B7280;
	}

	.metric-progress {
		margin-top: 8px;
		height: 4px;
		background: #2A2F45;
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-bar {
		height: 100%;
		background: linear-gradient(90deg, #00B4FF 0%, #00D084 100%);
		transition: width 0.5s ease;
	}

	.strategy-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 20px;
	}

	.strategy-card {
		background: #0A0E1A;
		border: 1px solid #2A2F45;
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
		letter-spacing: 0.5px;
	}

	.strategy-badge.yes {
		background: rgba(0, 214, 143, 0.15);
		color: #00D68F;
		border: 1px solid #00D68F;
	}

	.strategy-badge.no {
		background: rgba(255, 107, 107, 0.15);
		color: #FF6B6B;
		border: 1px solid #FF6B6B;
	}

	.strategy-count {
		font-size: 12px;
		color: #8B92AB;
	}

	.strategy-metrics {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin-bottom: 20px;
	}

	.strategy-metric {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.strategy-metric-label {
		font-size: 13px;
		color: #8B92AB;
	}

	.strategy-metric-value {
		font-size: 16px;
		font-weight: 600;
		color: white;
	}

	.strategy-metric-value.positive {
		color: #00D68F;
	}

	.strategy-metric-value.negative {
		color: #FF6B6B;
	}

	.strategy-bar {
		height: 8px;
		background: #2A2F45;
		border-radius: 4px;
		overflow: hidden;
	}

	.bar-fill {
		height: 100%;
		transition: width 0.5s ease;
	}

	.yes-bar {
		background: linear-gradient(90deg, #00D68F 0%, #00F5A0 100%);
	}

	.no-bar {
		background: linear-gradient(90deg, #FF6B6B 0%, #FF8E8E 100%);
	}

	.trades-comparison {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
		gap: 20px;
	}

	.trades-panel {
		background: #0A0E1A;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		padding: 24px;
	}

	.trades-panel h2 {
		font-size: 18px;
		margin: 0 0 16px 0;
	}

	.trades-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.trade-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px;
		background: #151B2F;
		border: 1px solid #2A2F45;
		border-radius: 8px;
	}

	.trade-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.trade-market {
		font-size: 13px;
		color: #E8E8E8;
	}

	.trade-type {
		font-size: 11px;
		font-weight: 600;
		width: fit-content;
		padding: 2px 6px;
		border-radius: 4px;
	}

	.trade-type.yes {
		background: rgba(0, 214, 143, 0.1);
		color: #00D68F;
	}

	.trade-type.no {
		background: rgba(255, 107, 107, 0.1);
		color: #FF6B6B;
	}

	.trade-result {
		font-size: 14px;
		font-weight: 600;
		text-align: right;
	}

	.trade-result.positive {
		color: #00D68F;
	}

	.trade-result.negative {
		color: #FF6B6B;
	}

	.no-trades {
		text-align: center;
		padding: 20px;
		color: #6B7280;
		font-size: 14px;
	}

	.insights-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 16px;
	}

	.insight-card {
		background: #0A0E1A;
		border: 1px solid #2A2F45;
		border-left: 3px solid #00B4FF;
		border-radius: 8px;
		padding: 16px 20px;
	}

	.insight-card p {
		margin: 0;
		font-size: 14px;
		line-height: 1.6;
		color: #E8E8E8;
	}

	.loading-state, .empty-state {
		text-align: center;
		padding: 80px 20px;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #2A2F45;
		border-top-color: #00B4FF;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 16px;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.empty-icon {
		font-size: 64px;
		margin-bottom: 16px;
	}

	.empty-state h3 {
		font-size: 24px;
		font-weight: 600;
		margin: 0 0 8px 0;
	}

	.empty-state p {
		color: #8B92AB;
		font-size: 16px;
		margin: 0;
	}

	@media (max-width: 768px) {
		.backtesting-container {
			padding: 20px 16px;
		}

		.page-header h1 {
			font-size: 28px;
		}

		.metrics-grid {
			grid-template-columns: 1fr;
		}

		.strategy-grid {
			grid-template-columns: 1fr;
		}

		.trades-comparison {
			grid-template-columns: 1fr;
		}
	}
</style>
