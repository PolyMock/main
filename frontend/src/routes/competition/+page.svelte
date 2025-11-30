<script lang="ts">
	import { onMount } from 'svelte';
	import { polymarketClient, type PolyMarket } from '$lib/polymarket';

	let currentTime = new Date().toLocaleTimeString();
	let competitionEndTime = new Date(Date.now() + 60 * 60 * 1000);
	let timeRemaining = '01:00:00';

	let leaderboard: any[] = [];
	let polymarkets: PolyMarket[] = [];
	let recentActivity: any[] = [];

	let competitionStats = {
		totalVolume: 0,
		totalTrades: 0,
		avgTradeSize: 0,
		topGainer: '+$0.00',
		topLoser: '$0.00',
		mostActive: '0 trades'
	};

	let polymarketsLoading = true;

	function updateTime() {
		currentTime = new Date().toLocaleTimeString();
		const now = Date.now();
		const diff = competitionEndTime.getTime() - now;
		if (diff > 0) {
			const hours = Math.floor(diff / 3600000);
			const minutes = Math.floor((diff % 3600000) / 60000);
			const seconds = Math.floor((diff % 60000) / 1000);
			timeRemaining = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
		} else {
			timeRemaining = 'ENDED';
		}
	}

	async function fetchPolymarkets() {
		polymarketsLoading = true;
		try {
			polymarkets = await polymarketClient.fetchMarkets(5);
		} catch (error) {
			console.error('Error fetching Polymarket markets:', error);
		} finally {
			polymarketsLoading = false;
		}
	}

	async function generateMockLeaderboard() {
		const mockPlayers = [
			'TraderPro', 'CryptoWiz', 'Diamond88', 'BullRun23', 'AlphaGain', 
			'MarketMate', 'PumpMaster', 'GreenCandles', 'HODLQueen', 'DegenKing'
		];

		leaderboard = mockPlayers.map((player, index) => ({
			rank: index + 1,
			player,
			pnl: Math.random() * 2000 - 500,
			balance: 10000 + Math.random() * 2000 - 500,
			trades: Math.floor(Math.random() * 50) + 1,
			volume: Math.random() * 50000,
			lastTrade: `${Math.floor(Math.random() * 60)}m ago`
		})).sort((a, b) => b.pnl - a.pnl);

		// Update stats based on leaderboard
		if (leaderboard.length > 0) {
			competitionStats.topGainer = `+$${Math.max(...leaderboard.map(p => p.pnl)).toFixed(2)}`;
			competitionStats.mostActive = `${Math.max(...leaderboard.map(p => p.trades))} trades`;
			competitionStats.totalTrades = leaderboard.reduce((sum, p) => sum + p.trades, 0);
			competitionStats.totalVolume = leaderboard.reduce((sum, p) => sum + p.volume, 0);
		}
	}

	async function generateMockActivity() {
		const actions = ['OPENED', 'CLOSED'];
		const directions = ['LONG', 'SHORT'];
		const symbols = ['BTC', 'ETH', 'SOL', 'AVAX', 'LINK'];
		const mockPlayers = ['TraderPro', 'CryptoWiz', 'Diamond88', 'BullRun23', 'AlphaGain'];

		recentActivity = Array.from({ length: 10 }, (_, index) => ({
			time: `${Math.floor(Math.random() * 60)}s ago`,
			player: mockPlayers[Math.floor(Math.random() * mockPlayers.length)],
			action: actions[Math.floor(Math.random() * actions.length)],
			direction: directions[Math.floor(Math.random() * directions.length)],
			symbol: symbols[Math.floor(Math.random() * symbols.length)],
			price: Math.random() * 100 + 20,
			size: `$${(Math.random() * 5000 + 100).toFixed(0)}`,
			pnl: Math.random() > 0.5 ? Math.random() * 500 : -(Math.random() * 300),
			type: Math.random() > 0.5 ? 'ENTRY' : 'EXIT'
		}));
	}

	onMount(async () => {
		console.log('[POLYMOCK] Initializing competition page...');

		updateTime();
		const timeInterval = setInterval(updateTime, 1000);

		await fetchPolymarkets();
		await generateMockLeaderboard();
		await generateMockActivity();

		const dataInterval = setInterval(async () => {
			await fetchPolymarkets();
			await generateMockLeaderboard();
			await generateMockActivity();
		}, 30000); // Update every 30 seconds

		return () => {
			clearInterval(timeInterval);
			clearInterval(dataInterval);
		};
	});
</script>

<div class="polyMock">
	<div class="command-bar">
		<a href="/" class="logo">POLYMOCK</a>
		<div class="nav-links">
			<a href="/" class="nav-link">TERMINAL</a>
			<a href="/competition" class="nav-link active">COMPETITION</a>
		</div>
		<div class="status-bar">
			<span class="status-item">DEMO MODE</span>
			<span class="status-item">TIME: {timeRemaining}</span>
			<span class="status-item">VOL: ${(competitionStats.totalVolume / 1000).toFixed(0)}K</span>
			<span class="status-item">TRADES: {competitionStats.totalTrades}</span>
		</div>
	</div>

	<div class="main-grid">
		<div class="ticker-panel">
			<div class="panel-header">POLYMOCK COMPETITION • DEMO MODE</div>
			<div class="ticker-stats">
				<div class="ticker-item">
					<span class="ticker-label">MODE</span>
					<span class="ticker-value green">DEMO</span>
				</div>
				<div class="ticker-item">
					<span class="ticker-label">MARKETS</span>
					<span class="ticker-value">{polymarkets.length}</span>
				</div>
				<div class="ticker-item">
					<span class="ticker-label">BALANCE</span>
					<span class="ticker-value">$10,000</span>
				</div>
				<div class="ticker-item">
					<span class="ticker-label">DURATION</span>
					<span class="ticker-value">60 MIN</span>
				</div>
				<div class="ticker-item">
					<span class="ticker-label">PLAYERS</span>
					<span class="ticker-value">{leaderboard.length}</span>
				</div>
				<div class="ticker-item">
					<span class="ticker-label">TOP</span>
					<span class="ticker-value green">{competitionStats.topGainer}</span>
				</div>
			</div>
		</div>

		<div class="leaderboard-panel">
			<div class="panel-header">LIVE LEADERBOARD • TOP 10</div>
			<div class="data-table">
				<div class="table-row header">
					<div class="col-rank">RNK</div>
					<div class="col-player">PLAYER</div>
					<div class="col-pnl">P&L</div>
					<div class="col-balance">BALANCE</div>
					<div class="col-trades">TRD</div>
					<div class="col-volume">VOLUME</div>
					<div class="col-last">LAST TRADE</div>
				</div>
				{#each leaderboard.slice(0, 10) as entry}
					<div class="table-row" class:flash={entry.rank === 1}>
						<div class="col-rank rank-{entry.rank}">{entry.rank}</div>
						<div class="col-player">{entry.player}</div>
						<div class="col-pnl" class:green={entry.pnl > 0} class:red={entry.pnl < 0}>
							{entry.pnl > 0 ? '+' : ''}${entry.pnl.toFixed(2)}
						</div>
						<div class="col-balance">${entry.balance.toLocaleString()}</div>
						<div class="col-trades">{entry.trades}</div>
						<div class="col-volume">${(entry.volume / 1000).toFixed(0)}K</div>
						<div class="col-last">{entry.lastTrade}</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="activity-panel">
			<div class="panel-header">PREDICTION MARKET ACTIVITY • DEMO</div>
			<div class="activity-feed">
				{#each recentActivity as activity}
					<div class="activity-row" class:entry={activity.type === 'ENTRY'} class:exit={activity.type === 'EXIT'}>
						<span class="activity-time">{activity.time}</span>
						<span class="activity-player">{activity.player}</span>
						<span class="activity-action {activity.action.toLowerCase()}">{activity.action}</span>
						<span class="activity-direction {activity.direction.toLowerCase()}">{activity.direction}</span>
						<span class="activity-symbol">{activity.symbol}</span>
						<span class="activity-price">${activity.price.toFixed(2)}</span>
						<span class="activity-size">{activity.size}</span>
						{#if activity.pnl !== undefined}
							<span class="activity-pnl" class:green={activity.pnl > 0} class:red={activity.pnl < 0}>
								{activity.pnl > 0 ? '+' : ''}${activity.pnl.toFixed(0)}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<div class="markets-panel">
			<div class="panel-header">POLYMARKET PREDICTION MARKETS</div>
			<div class="markets-list">
				{#if polymarketsLoading}
					<div class="loading-state">Loading Polymarket markets...</div>
				{:else if polymarkets.length === 0}
					<div class="error-state">Failed to load markets from Polymarket API.</div>
				{:else}
					{#each polymarkets as market}
						<div class="market-item">
							<div class="market-question">{market.question || 'Unknown Question'}</div>
							<div class="market-details">
								<div class="market-stat">
									<span class="stat-label">Price:</span>
									<span class="stat-value">{market.last_trade_price ? `$${market.last_trade_price.toFixed(4)}` : 'N/A'}</span>
								</div>
								<div class="market-stat">
									<span class="stat-label">Volume:</span>
									<span class="stat-value">{market.volume_24hr ? `$${(market.volume_24hr / 1000).toFixed(0)}K` : 'N/A'}</span>
								</div>
								<div class="market-stat">
									<span class="stat-label">End:</span>
									<span class="stat-value">{market.end_date_iso ? new Date(market.end_date_iso).toLocaleDateString() : 'N/A'}</span>
								</div>
							</div>
							{#if market.tags && market.tags.length > 0}
								<div class="market-tags">
									{#each market.tags.slice(0, 2) as tag}
										<span class="market-tag">{tag}</span>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.polyMock {
		min-height: 100vh;
		background: #000;
		color: #fff;
		font-family: 'Courier New', monospace;
	}

	.command-bar {
		background: #1a1a1a;
		padding: 8px 15px;
		display: flex;
		align-items: center;
		gap: 15px;
		border-bottom: 1px solid #333;
	}

	.logo {
		font-size: 18px;
		font-weight: bold;
		color: #4785ff;
		letter-spacing: 2px;
		text-decoration: none;
	}

	.nav-links {
		display: flex;
		gap: 15px;
	}

	.nav-link {
		color: #666;
		text-decoration: none;
		font-size: 13px;
		padding: 4px 10px;
		border: 1px solid transparent;
		transition: all 0.2s;
	}

	.nav-link:hover {
		color: #fff;
		border-color: #333;
	}

	.nav-link.active {
		color: #4785ff;
		border-color: #4785ff;
	}

	.status-bar {
		display: flex;
		gap: 20px;
		margin-left: auto;
		font-size: 12px;
	}

	.status-item {
		color: #4785ff;
		padding: 3px 8px;
		background: #000;
		border: 1px solid #333;
	}

	.main-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: auto 1fr;
		gap: 1px;
		background: #333;
		height: calc(100vh - 40px);
	}

	.ticker-panel {
		grid-column: 1 / -1;
		background: #000;
		border-bottom: 1px solid #333;
	}

	.panel-header {
		background: #1a1a1a;
		padding: 6px 12px;
		border-bottom: 1px solid #4785ff;
		font-size: 11px;
		font-weight: bold;
		letter-spacing: 1px;
		color: #4785ff;
	}

	.ticker-stats {
		display: flex;
		gap: 1px;
		background: #111;
	}

	.ticker-item {
		flex: 1;
		padding: 12px;
		background: #000;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.ticker-label {
		font-size: 10px;
		color: #666;
	}

	.ticker-value {
		font-size: 16px;
		color: #fff;
	}

	.ticker-value.green {
		color: #00ff00;
	}

	.leaderboard-panel {
		background: #000;
		overflow-y: auto;
	}

	.activity-panel {
		background: #000;
		overflow-y: auto;
	}

	.markets-panel {
		grid-column: 1 / -1;
		background: #000;
		overflow-y: auto;
		max-height: 300px;
	}

	.data-table {
		font-size: 11px;
	}

	.table-row {
		display: grid;
		grid-template-columns: 40px 120px 100px 120px 50px 80px 1fr;
		gap: 8px;
		padding: 8px 12px;
		border-bottom: 1px solid #111;
	}

	.table-row.header {
		background: #1a1a1a;
		color: #666;
		font-weight: bold;
		position: sticky;
		top: 0;
		z-index: 10;
		border-bottom: 1px solid #4785ff;
	}

	.table-row:not(.header):hover {
		background: #0a0a0a;
	}

	.table-row.flash {
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% { background: #000; }
		50% { background: #1a1a00; }
	}

	.col-rank {
		color: #4785ff;
		font-weight: bold;
	}

	.col-rank.rank-1 { color: #ffaa00; }
	.col-rank.rank-2 { color: #aaaaaa; }
	.col-rank.rank-3 { color: #cd7f32; }

	.col-player {
		color: #00ccff;
	}

	.green {
		color: #00ff00;
	}

	.red {
		color: #ff0000;
	}

	.activity-feed {
		font-size: 10px;
		padding: 10px;
	}

	.activity-row {
		display: grid;
		grid-template-columns: 80px 120px 80px 60px 60px 90px 60px 80px;
		gap: 8px;
		padding: 6px 0;
		border-bottom: 1px solid #0a0a0a;
		transition: background 0.3s;
	}

	.activity-row:nth-child(1) {
		background: #0a0a00;
	}

	.activity-row:hover {
		background: #1a1a1a;
	}

	.activity-time {
		color: #666;
	}

	.activity-player {
		color: #00ccff;
	}

	.activity-action.opened {
		color: #00ff00;
	}

	.activity-action.closed {
		color: #ff9500;
	}

	.activity-direction.long {
		color: #00ff00;
	}

	.activity-direction.short {
		color: #ff0000;
	}

	.activity-symbol {
		color: #fff;
		font-weight: bold;
	}

	.activity-price {
		color: #ffaa00;
	}

	.activity-size {
		color: #999;
	}

	.activity-pnl {
		font-weight: bold;
	}

	.markets-list {
		padding: 15px;
	}

	.loading-state,
	.error-state {
		padding: 20px;
		text-align: center;
		color: #666;
		font-size: 12px;
	}

	.error-state {
		color: #ff0000;
	}

	.market-item {
		background: #0a0a0a;
		border: 1px solid #333;
		border-radius: 4px;
		padding: 12px;
		margin-bottom: 10px;
		transition: all 0.2s ease;
	}

	.market-item:hover {
		border-color: #4785ff;
		transform: translateX(4px);
	}

	.market-question {
		color: #fff;
		font-size: 12px;
		font-weight: bold;
		margin-bottom: 8px;
		line-height: 1.3;
	}

	.market-details {
		display: flex;
		gap: 15px;
		margin-bottom: 8px;
	}

	.market-stat {
		display: flex;
		gap: 4px;
		align-items: center;
	}

	.stat-label {
		color: #666;
		font-size: 10px;
	}

	.stat-value {
		color: #4785ff;
		font-size: 10px;
		font-weight: bold;
	}

	.market-tags {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.market-tag {
		background: #333;
		color: #fff;
		padding: 2px 6px;
		border-radius: 8px;
		font-size: 9px;
		font-weight: bold;
	}
</style>