<script lang="ts">
	import { onMount } from 'svelte';

	interface LeaderboardEntry {
		rank: number;
		name: string;
		walletAddress: string;
		profitLoss: number;
		volume: number;
		picture?: string;
	}

	let timeframe: 'today' | 'weekly' | 'monthly' | 'all' = 'monthly';
	let leaderboard: LeaderboardEntry[] = [];
	let loading = true;
	let searchQuery = '';

	async function fetchLeaderboard() {
		loading = true;
		try {
			const response = await fetch(`/api/leaderboard?timeframe=${timeframe}`);
			const data = await response.json();

			if (data.success) {
				leaderboard = data.leaderboard;
			} else {
				console.error('Failed to fetch leaderboard:', data.error);
			}
		} catch (error) {
			console.error('Error fetching leaderboard:', error);
		} finally {
			loading = false;
		}
	}

	function selectTimeframe(newTimeframe: typeof timeframe) {
		timeframe = newTimeframe;
		fetchLeaderboard();
	}

	function formatUSDC(amount: number): string {
		if (amount >= 1000000) {
			return `$${(amount / 1000000).toFixed(3)}M`;
		} else if (amount >= 1000) {
			return `$${(amount / 1000).toFixed(0)}K`;
		}
		return `$${amount.toFixed(0)}`;
	}

	function formatProfitLoss(amount: number): string {
		const sign = amount >= 0 ? '+' : '';
		return `${sign}${formatUSDC(amount)}`;
	}

	$: filteredLeaderboard = searchQuery
		? leaderboard.filter(entry =>
				entry.name.toLowerCase().includes(searchQuery.toLowerCase())
		  )
		: leaderboard;

	$: topWinsThisMonth = leaderboard.slice(0, 6);

	onMount(() => {
		fetchLeaderboard();
	});
</script>

<div class="leaderboard-page">
	<div class="page-header">
		<h1>Leaderboard</h1>
	</div>

	<div class="content-grid">
		<!-- Main Leaderboard -->
		<div class="main-section">
			<!-- Timeframe Tabs -->
			<div class="timeframe-tabs">
				<button
					class="tab"
					class:active={timeframe === 'today'}
					on:click={() => selectTimeframe('today')}
				>
					Today
				</button>
				<button
					class="tab"
					class:active={timeframe === 'weekly'}
					on:click={() => selectTimeframe('weekly')}
				>
					Weekly
				</button>
				<button
					class="tab"
					class:active={timeframe === 'monthly'}
					on:click={() => selectTimeframe('monthly')}
				>
					Monthly
				</button>
				<button
					class="tab"
					class:active={timeframe === 'all'}
					on:click={() => selectTimeframe('all')}
				>
					All
				</button>
			</div>

			<!-- Search Bar -->
			<div class="search-container">
				<svg width="20" height="20" viewBox="0 0 20 20" fill="none" class="search-icon">
					<path d="M9 17C13.4183 17 17 13.4183 17 9C17 4.58172 13.4183 1 9 1C4.58172 1 1 4.58172 1 9C1 13.4183 4.58172 17 9 17Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					<path d="M19 19L14.65 14.65" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search by name"
					class="search-input"
				/>
			</div>

			<!-- Leaderboard Table Header -->
			<div class="table-header">
				<div class="header-cell rank-col"></div>
				<div class="header-cell name-col"></div>
				<div class="header-cell profit-col">Profit/Loss</div>
				<div class="header-cell volume-col">Volume</div>
			</div>

			<!-- Leaderboard Entries -->
			{#if loading}
				<div class="loading-state">
					<div class="spinner"></div>
					<p>Loading leaderboard...</p>
				</div>
			{:else if filteredLeaderboard.length === 0}
				<div class="empty-state">
					<p>No traders found</p>
				</div>
			{:else}
				<div class="leaderboard-list">
					{#each filteredLeaderboard as entry (entry.walletAddress)}
						<div class="leaderboard-entry">
							<div class="rank-badge">
								{#if entry.rank === 1}
									<span class="trophy">🏆</span>
								{/if}
								<span class="rank-number">{entry.rank}</span>
							</div>
							<div class="user-info">
								<img src={entry.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${entry.walletAddress}`} alt={entry.name} class="avatar" />
								<span class="user-name">{entry.name}</span>
							</div>
							<div class="profit-value" class:positive={entry.profitLoss >= 0} class:negative={entry.profitLoss < 0}>
								{formatProfitLoss(entry.profitLoss)}
							</div>
							<div class="volume-value">
								{formatUSDC(entry.volume)}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Sidebar - Biggest Wins -->
		<div class="sidebar-section">
			<div class="sidebar-card">
				<h2>Biggest wins this month</h2>
				<div class="wins-list">
					{#each topWinsThisMonth as entry, i (entry.walletAddress)}
						<div class="win-item">
							<span class="win-rank">{i + 1}</span>
							<img src={entry.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${entry.walletAddress}`} alt={entry.name} class="win-avatar" />
							<div class="win-details">
								<span class="win-name">{entry.name}</span>
								<div class="win-profit">
									<span class="win-amount">{formatUSDC(entry.profitLoss)}</span>
									<span class="win-change positive">+ {formatUSDC(entry.profitLoss)}</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.leaderboard-page {
		min-height: 100vh;
		background: #0A0E27;
		color: #E8E8E8;
		padding: 24px;
	}

	.page-header {
		margin-bottom: 32px;
	}

	.page-header h1 {
		font-size: 36px;
		font-weight: 700;
		color: #E8E8E8;
		margin: 0;
	}

	.content-grid {
		display: grid;
		grid-template-columns: 1fr 400px;
		gap: 24px;
		max-width: 1600px;
		margin: 0 auto;
	}

	.main-section {
		background: #000000;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		padding: 24px;
	}

	.timeframe-tabs {
		display: flex;
		gap: 12px;
		margin-bottom: 24px;
		border-bottom: 1px solid #2A2F45;
		padding-bottom: 16px;
	}

	.tab {
		padding: 8px 20px;
		background: transparent;
		border: 1px solid #2A2F45;
		border-radius: 8px;
		color: #8B92AB;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 200ms ease-out;
		font-family: Inter, sans-serif;
	}

	.tab:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: #3A4055;
		color: #E8E8E8;
	}

	.tab.active {
		background: rgba(249, 115, 22, 0.1);
		border-color: #F97316;
		color: #F97316;
	}

	.search-container {
		position: relative;
		margin-bottom: 24px;
	}

	.search-icon {
		position: absolute;
		left: 16px;
		top: 50%;
		transform: translateY(-50%);
		color: #666;
		pointer-events: none;
	}

	.search-input {
		width: 100%;
		padding: 12px 12px 12px 48px;
		background: #0A0E27;
		border: 1px solid #2A2F45;
		border-radius: 8px;
		color: #E8E8E8;
		font-size: 14px;
		font-family: Inter, sans-serif;
		transition: border-color 200ms ease-out;
	}

	.search-input:focus {
		outline: none;
		border-color: #F97316;
	}

	.search-input::placeholder {
		color: #666;
	}

	.table-header {
		display: grid;
		grid-template-columns: 80px 1fr 200px 150px;
		gap: 16px;
		padding: 12px 16px;
		border-bottom: 1px solid #2A2F45;
		margin-bottom: 8px;
	}

	.header-cell {
		font-size: 12px;
		font-weight: 600;
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.profit-col, .volume-col {
		text-align: right;
	}

	.leaderboard-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.leaderboard-entry {
		display: grid;
		grid-template-columns: 80px 1fr 200px 150px;
		gap: 16px;
		padding: 16px;
		background: #1E2139;
		border: 1px solid #2A2F45;
		border-radius: 8px;
		transition: all 200ms ease-out;
		align-items: center;
	}

	.leaderboard-entry:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: #3A4055;
		transform: translateX(4px);
	}

	.rank-badge {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.trophy {
		font-size: 20px;
	}

	.rank-number {
		font-size: 18px;
		font-weight: 700;
		color: #E8E8E8;
	}

	.user-info {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: 2px solid #2A2F45;
	}

	.user-name {
		font-size: 15px;
		font-weight: 600;
		color: #E8E8E8;
	}

	.profit-value {
		font-size: 16px;
		font-weight: 700;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		text-align: right;
	}

	.profit-value.positive {
		color: #00D68F;
	}

	.profit-value.negative {
		color: #FF6B6B;
	}

	.volume-value {
		font-size: 14px;
		font-weight: 600;
		color: #8B92AB;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		text-align: right;
	}

	.sidebar-section {
		background: #000000;
		border: 1px solid #2A2F45;
		border-radius: 12px;
		padding: 24px;
		height: fit-content;
	}

	.sidebar-card h2 {
		font-size: 18px;
		font-weight: 600;
		color: #E8E8E8;
		margin: 0 0 20px 0;
	}

	.wins-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.win-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		background: #1E2139;
		border: 1px solid #2A2F45;
		border-radius: 8px;
		transition: all 200ms ease-out;
	}

	.win-item:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: #3A4055;
	}

	.win-rank {
		font-size: 14px;
		font-weight: 700;
		color: #666;
		min-width: 20px;
	}

	.win-avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 2px solid #2A2F45;
	}

	.win-details {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.win-name {
		font-size: 14px;
		font-weight: 600;
		color: #E8E8E8;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.win-profit {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
	}

	.win-amount {
		font-weight: 700;
		color: #E8E8E8;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
	}

	.win-change {
		font-weight: 600;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
	}

	.win-change.positive {
		color: #00D68F;
	}

	.loading-state, .empty-state {
		padding: 60px 20px;
		text-align: center;
		color: #666;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #2A2F45;
		border-top-color: #F97316;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto 16px;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Light Mode */
	:global(.light-mode) .leaderboard-page {
		background: #FFFFFF;
		color: #1A1A1A;
	}

	:global(.light-mode) .page-header h1 {
		color: #1A1A1A;
	}

	:global(.light-mode) .main-section,
	:global(.light-mode) .sidebar-section {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .timeframe-tabs {
		border-bottom-color: #E0E0E0;
	}

	:global(.light-mode) .tab {
		border-color: #E0E0E0;
		color: #666;
	}

	:global(.light-mode) .tab:hover {
		background: rgba(0, 0, 0, 0.03);
		border-color: #CCC;
		color: #1A1A1A;
	}

	:global(.light-mode) .tab.active {
		background: rgba(0, 181, 112, 0.1);
		border-color: #00B570;
		color: #00B570;
	}

	:global(.light-mode) .search-input {
		background: #FFFFFF;
		border-color: #E0E0E0;
		color: #1A1A1A;
	}

	:global(.light-mode) .search-input::placeholder {
		color: #999;
	}

	:global(.light-mode) .table-header {
		border-bottom-color: #E0E0E0;
	}

	:global(.light-mode) .header-cell {
		color: #999;
	}

	:global(.light-mode) .leaderboard-entry,
	:global(.light-mode) .win-item {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .leaderboard-entry:hover,
	:global(.light-mode) .win-item:hover {
		background: #FAFAFA;
		border-color: #CCC;
	}

	:global(.light-mode) .rank-number,
	:global(.light-mode) .user-name,
	:global(.light-mode) .win-name,
	:global(.light-mode) .win-amount {
		color: #1A1A1A;
	}

	:global(.light-mode) .avatar,
	:global(.light-mode) .win-avatar {
		border-color: #E0E0E0;
	}

	:global(.light-mode) .volume-value,
	:global(.light-mode) .win-rank {
		color: #666;
	}

	:global(.light-mode) .sidebar-card h2 {
		color: #1A1A1A;
	}

	:global(.light-mode) .spinner {
		border-color: #E0E0E0;
		border-top-color: #00B570;
	}

	@media (max-width: 1200px) {
		.content-grid {
			grid-template-columns: 1fr;
		}

		.sidebar-section {
			order: -1;
		}
	}

	@media (max-width: 768px) {
		.leaderboard-page {
			padding: 16px;
		}

		.table-header {
			display: none;
		}

		.leaderboard-entry {
			grid-template-columns: 60px 1fr;
			grid-template-rows: auto auto;
			gap: 12px;
		}

		.user-info {
			grid-column: 2;
			grid-row: 1;
		}

		.profit-value {
			grid-column: 1 / -1;
			grid-row: 2;
			text-align: left;
		}

		.volume-value {
			grid-column: 1 / -1;
			grid-row: 3;
			text-align: left;
		}
	}
</style>
