<script lang="ts">
	import { onMount } from 'svelte';
	import { magicBlockClient } from '$lib/magicblock';
	import { walletStore } from '$lib/wallet/stores';
	import WalletButton from '$lib/wallet/WalletButton.svelte';

	let currentTime = new Date().toLocaleTimeString();
	let competitionEndTime = new Date(Date.now() + 60 * 60 * 1000);
	let timeRemaining = '01:00:00';

	let leaderboard: any[] = [];

	let recentActivity: any[] = [];

	let competitionStats = {
		totalVolume: 0,
		totalTrades: 0,
		avgTradeSize: 0,
		topGainer: '+$0.00',
		topLoser: '$0.00',
		mostActive: '0 trades'
	};

	let prices: Record<string, { price: number; change: number }> = {
		'SOL': { price: 0, change: 0 },
		'BTC': { price: 0, change: 0 },
		'ETH': { price: 0, change: 0 },
		'AVAX': { price: 0, change: 0 },
		'LINK': { price: 0, change: 0 }
	};

	let connectedWallet: any = null;
	let walletAddress = '';
	let isJoined = false;
	let isJoining = false;
	let competitionStatus = 'Loading...';

	// Subscribe to wallet changes
	walletStore.subscribe(wallet => {
		connectedWallet = wallet;
		if (wallet.connected && wallet.publicKey) {
			walletAddress = wallet.publicKey.toBase58();
			magicBlockClient.setConnectedWallet(wallet.adapter);
			checkCompetitionStatus();
		} else {
			walletAddress = '';
			isJoined = false;
			competitionStatus = 'Connect wallet to join competition';
		}
	});

	async function checkCompetitionStatus() {
		try {
			const compData = await magicBlockClient.fetchCompetitionData();
			if (compData) {
				competitionEndTime = compData.endTime;
				competitionStats.totalTrades = compData.totalParticipants;
				competitionStatus = compData.isActive ? 'Ready to join competition' : 'Competition not active';
			} else {
				competitionStatus = 'Ready to join competition';
			}
		} catch (error) {
			console.error('[COMPETITION] Failed to check status:', error);
			competitionStatus = 'Status check failed';
		}
	}

	async function joinCompetition() {
		if (!connectedWallet?.connected) {
			alert('Please connect your wallet first');
			return;
		}

		if (isJoining) return;

		try {
			isJoining = true;
			competitionStatus = 'Joining competition...';
			
			// Call the join-competition system through MagicBlock
			const signature = await magicBlockClient.joinCompetition();
			
			isJoined = true;
			competitionStatus = `Competition joined! ${signature.substring(0, 8)}...`;
			
			// Refresh leaderboard data
			await fetchLeaderboard();
		} catch (error: any) {
			console.error('[COMPETITION] Failed to join:', error);
			competitionStatus = `Join failed: ${error.message}`;
		} finally {
			isJoining = false;
		}
	}

	async function fetchPrices() {
		try {
			const priceIds = {
				'SOL': 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
				'BTC': 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
				'ETH': 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
				'AVAX': '93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
				'LINK': '8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221'
			};

			for (const [symbol, priceId] of Object.entries(priceIds)) {
				const response = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${priceId}`);
				const data = await response.json();
				if (data.parsed && data.parsed[0]) {
					const priceData = data.parsed[0].price;
					const newPrice = parseFloat(priceData.price) * Math.pow(10, priceData.expo);
					prices[symbol].price = newPrice;
				}
			}
		} catch (error) {
			console.error('[COMPETITION] Failed to fetch prices:', error);
		}
	}

	async function fetchLeaderboard() {
		try {
			const currentPrices: Record<string, number> = {};
			for (const [symbol, priceData] of Object.entries(prices)) {
				currentPrices[symbol] = priceData.price;
			}

			const data = await magicBlockClient.fetchLeaderboard(currentPrices);
			leaderboard = data;

			if (data.length > 0) {
				competitionStats.topGainer = `+$${Math.max(...data.map(p => p.pnl)).toFixed(2)}`;
				competitionStats.mostActive = `${Math.max(...data.map(p => p.trades))} trades`;
			}
		} catch (error) {
			console.error('[COMPETITION] Failed to fetch leaderboard:', error);
		}
	}

	async function fetchRecentActivity() {
		try {
			const allPositions = await magicBlockClient.fetchPositions();
			recentActivity = allPositions
				.sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())
				.slice(0, 10)
				.map(p => ({
					trader: p.pubkey?.substring(0, 8) || 'Unknown',
					action: `${p.direction} ${p.pairSymbol}`,
					size: `$${(p.amountTokenOut * p.entryPrice).toFixed(2)}`,
					price: `$${p.entryPrice.toFixed(2)}`,
					time: p.openedAt.toLocaleTimeString()
				}));
		} catch (error) {
			console.error('[COMPETITION] Failed to fetch activity:', error);
		}
	}

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


	onMount(async () => {
		console.log('[COMPETITION] Initializing competition page...');

		try {
			await magicBlockClient.initializeSessionWallet();
		} catch (error) {
			console.error('[COMPETITION] Failed to initialize MagicBlock:', error);
		}

		try {
			const compData = await magicBlockClient.fetchCompetitionData();
			if (compData) {
				competitionEndTime = compData.endTime;
				console.log('[COMPETITION] Competition data:', {
					startTime: compData.startTime,
					endTime: compData.endTime,
					name: compData.name,
					participants: compData.totalParticipants
				});
			} else {
				console.log('[COMPETITION] No competition data found, using default 60min timer');
			}
		} catch (error) {
			console.error('[COMPETITION] Failed to fetch competition data:', error);
		}

		updateTime();
		const timeInterval = setInterval(updateTime, 1000);

		await fetchPrices();
		await fetchLeaderboard();
		await fetchRecentActivity();

		const priceInterval = setInterval(async () => {
			await fetchPrices();
		}, 2000);

		const dataInterval = setInterval(async () => {
			await fetchLeaderboard();
			await fetchRecentActivity();
		}, 60000);

		return () => {
			clearInterval(timeInterval);
			clearInterval(priceInterval);
			clearInterval(dataInterval);
		};
	});
</script>

<div class="bloomberg">
	<div class="command-bar">
		<a href="/" class="logo">BLOCKBERG</a>
		<div class="nav-links">
			<a href="/" class="nav-link">TERMINAL</a>
			<a href="/competition" class="nav-link active">COMPETITION</a>
		</div>
		<div class="status-bar">
			<span class="status-item">COMP #42</span>
			<span class="status-item">TIME: {timeRemaining}</span>
			<span class="status-item">VOL: ${(competitionStats.totalVolume / 1000).toFixed(0)}K</span>
			<span class="status-item">TRADES: {competitionStats.totalTrades}</span>
			{#if connectedWallet?.connected}
				<span class="status-item">
					{walletAddress.substring(0, 4)}...{walletAddress.substring(walletAddress.length - 4)}
				</span>
				<span class="status-item {isJoined ? 'joined' : 'not-joined'}">
					{competitionStatus}
				</span>
			{/if}
		</div>
		<div class="wallet-section">
			<WalletButton />
		</div>
	</div>

	<div class="main-grid">
		<div class="ticker-panel">
			<div class="panel-header">COMPETITION STATS • LIVE</div>
			<div class="ticker-stats">
				<div class="ticker-item">
					<span class="ticker-label">ENTRY</span>
					<span class="ticker-value">0.1 SOL</span>
				</div>
				<div class="ticker-item">
					<span class="ticker-label">PRIZE</span>
					<span class="ticker-value green">15.5 SOL</span>
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
					<span class="ticker-value">127</span>
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
				{#each leaderboard as entry}
					<div class="table-row" class:flash={entry.rank === 1}>
						<div class="col-rank rank-{entry.rank}">{entry.rank}</div>
						<div class="col-player">{entry.player}</div>
						<div class="col-pnl" class:green={entry.pnl > 0} class:red={entry.pnl < 0}>
							{entry.pnl > 0 ? '+' : ''}{entry.pnl.toFixed(2)}
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
			<div class="panel-header">TRADE ACTIVITY • LIVE FEED</div>
			<div class="activity-feed">
				{#each recentActivity as activity}
					<div class="activity-row" class:entry={activity.type === 'ENTRY'} class:exit={activity.type === 'EXIT'}>
						<span class="activity-time">{activity.time}</span>
						<span class="activity-player">{activity.player}</span>
						<span class="activity-action {activity.action.toLowerCase()}">{activity.action}</span>
						<span class="activity-direction {activity.direction.toLowerCase()}">{activity.direction}</span>
						<span class="activity-symbol">{activity.symbol}</span>
						<span class="activity-price">@{activity.price.toFixed(2)}</span>
						<span class="activity-size">{activity.size}</span>
						{#if activity.pnl !== undefined}
							<span class="activity-pnl" class:green={activity.pnl > 0} class:red={activity.pnl < 0}>
								{activity.pnl > 0 ? '+' : ''}{activity.pnl}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<div class="join-panel">
			<div class="nft-info">
				<div class="nft-header">
					NFT TROPHY REWARDS
					{#if connectedWallet?.connected && !isJoined}
						<button 
							class="join-button" 
							disabled={isJoining}
							on:click={joinCompetition}
						>
							{isJoining ? 'JOINING...' : 'JOIN COMPETITION'}
						</button>
					{:else if !connectedWallet?.connected}
						<span class="join-hint">Connect wallet to join competition</span>
					{:else if isJoined}
						<span class="joined-indicator">✓ JOINED</span>
					{/if}
				</div>
				<div class="nft-tiers">
					<div class="nft-tier">
						<div class="tier-rank gold">1ST PLACE</div>
						<div class="tier-prize">GOLD TROPHY NFT + 50% PRIZE POOL</div>
						<div class="tier-details">Legendary • Animated • Transferable • On-Chain Verified</div>
					</div>
					<div class="nft-tier">
						<div class="tier-rank silver">2ND PLACE</div>
						<div class="tier-prize">SILVER TROPHY NFT + 30% PRIZE POOL</div>
						<div class="tier-details">Epic • Animated • Transferable • On-Chain Verified</div>
					</div>
					<div class="nft-tier">
						<div class="tier-rank bronze">3RD PLACE</div>
						<div class="tier-prize">BRONZE TROPHY NFT + 20% PRIZE POOL</div>
						<div class="tier-details">Rare • Animated • Transferable • On-Chain Verified</div>
					</div>
				</div>
				<div class="nft-footer">
					All NFT trophies are minted on-chain and stored permanently in your wallet. Each trophy includes competition stats, timestamp, and leaderboard placement verification.
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.bloomberg {
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
		color: #ff9500;
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
		color: #ff9500;
		border-color: #ff9500;
	}

	.status-bar {
		display: flex;
		gap: 20px;
		margin-left: auto;
		font-size: 12px;
	}

	.status-item {
		color: #ff9500;
		padding: 3px 8px;
		background: #000;
		border: 1px solid #333;
	}

	.main-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: auto 1fr auto;
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
		border-bottom: 1px solid #ff9500;
		font-size: 11px;
		font-weight: bold;
		letter-spacing: 1px;
		color: #ff9500;
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
		border-bottom: 1px solid #ff9500;
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
		color: #ff9500;
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

	.activity-panel {
		background: #000;
		overflow-y: auto;
	}

	.activity-feed {
		font-size: 10px;
	}

	.activity-row {
		display: grid;
		grid-template-columns: 80px 120px 80px 60px 60px 90px 60px 80px;
		gap: 8px;
		padding: 6px 12px;
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

	.join-panel {
		grid-column: 1 / -1;
		background: #000;
		padding: 15px;
		border-top: 2px solid #ff9500;
	}

	.nft-info {
		background: #0a0a0a;
		border: 1px solid #333;
		padding: 15px;
	}

	.nft-header {
		color: #ff9500;
		font-size: 13px;
		margin-bottom: 12px;
		letter-spacing: 1px;
		border-bottom: 1px solid #333;
		padding-bottom: 8px;
	}

	.nft-tiers {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
		margin-bottom: 12px;
	}

	.nft-tier {
		background: #000;
		border: 1px solid #222;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.tier-rank {
		font-size: 11px;
		padding: 4px 6px;
		text-align: center;
	}

	.tier-rank.gold {
		background: linear-gradient(180deg, #ffaa00 0%, #ff8800 100%);
		color: #000;
	}

	.tier-rank.silver {
		background: linear-gradient(180deg, #cccccc 0%, #888888 100%);
		color: #000;
	}

	.tier-rank.bronze {
		background: linear-gradient(180deg, #cd7f32 0%, #8b5a2b 100%);
		color: #000;
	}

	.tier-prize {
		font-size: 10px;
		color: #fff;
	}

	.tier-details {
		font-size: 8px;
		color: #666;
		line-height: 1.4;
	}

	.nft-footer {
		font-size: 9px;
		color: #999;
		line-height: 1.5;
		padding-top: 10px;
		border-top: 1px solid #222;
	}

	.wallet-section {
		margin-left: auto;
		display: flex;
		align-items: center;
	}

	.status-item.joined {
		background: #00ff00;
		color: #000;
	}

	.status-item.not-joined {
		background: #ff9500;
		color: #000;
	}

	.nft-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 15px;
	}

	.join-button {
		background: #00ff00;
		color: #000;
		border: none;
		padding: 8px 16px;
		font-family: 'Courier New', monospace;
		font-size: 11px;
		font-weight: bold;
		cursor: pointer;
		letter-spacing: 1px;
		transition: all 0.2s ease;
	}

	.join-button:hover:not(:disabled) {
		background: #33ff33;
		transform: scale(1.05);
	}

	.join-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.join-hint {
		color: #666;
		font-size: 10px;
		font-style: italic;
	}

	.joined-indicator {
		background: #00ff00;
		color: #000;
		padding: 4px 8px;
		font-size: 10px;
		font-weight: bold;
		letter-spacing: 1px;
	}
</style>
