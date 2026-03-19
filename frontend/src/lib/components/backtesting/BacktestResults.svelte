<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet" />
</svelte:head>

<script lang="ts">
	import { walletStore } from '$lib/wallet/stores';
	import type { BacktestResult } from '$lib/backtesting/types';
	import BacktestChart from './BacktestChart.svelte';
	import BacktestTerminalResults from './BacktestTerminalResults.svelte';

	let {
		backtestResult,
		selectedMarkets,
		config,
		walletConnected,
		onSaveStrategy = undefined
	}: {
		backtestResult: BacktestResult;
		selectedMarkets: any[];
		config: any;
		walletConnected: boolean;
		onSaveStrategy?: () => void;
	} = $props();

	// Save modal state
	let showSaveModal = $state(false);
	let showAuthModal = $state(false);
	let strategyName = $state('');
	let savingStrategy = $state(false);
	let saveError = $state('');
	let currentUser: any = $state(null);
	let isAuthenticating = $state(false);
	let showSuccessNotification = $state(false);

	// ---- Auth / Save functions ----
	async function checkAuth() {
		try {
			const response = await fetch('/api/auth/user');
			const data = await response.json();
			currentUser = data.user;
		} catch (error) {
			console.error('Auth check failed:', error);
			currentUser = null;
		}
	}

	function canSave(): boolean {
		return currentUser !== null || $walletStore.connected;
	}

	async function authenticateWallet() {
		isAuthenticating = true;
		saveError = '';

		try {
			const wallet = $walletStore;

			if (!wallet.adapter || !wallet.publicKey) {
				throw new Error('Wallet not connected');
			}

			if (typeof (wallet.adapter as any).signMessage !== 'function') {
				throw new Error('Wallet does not support message signing');
			}

			const publicKey = wallet.publicKey.toBase58();
			const message = `Sign this message to authenticate with Polymock.\n\nWallet: ${publicKey}\nTimestamp: ${Date.now()}`;
			const messageBytes = new TextEncoder().encode(message);
			const signature = await (wallet.adapter as any).signMessage(messageBytes);

			const response = await fetch('/api/auth/wallet', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					walletAddress: publicKey,
					signature: Array.from(signature),
					message: message
				})
			});

			const data = await response.json();

			if (response.ok && data.success) {
				currentUser = data.user;
				showAuthModal = false;
				showSaveModal = true;
				strategyName = '';
				saveError = '';
			} else {
				throw new Error(data.error || 'Authentication failed');
			}
		} catch (error: any) {
			console.error('Wallet authentication error:', error);
			saveError = error.message || 'Wallet authentication failed';
		} finally {
			isAuthenticating = false;
		}
	}

	async function showSaveStrategyModal() {
		if (!canSave()) {
			showAuthModal = true;
			saveError = '';
			return;
		}

		if ($walletStore.connected) {
			await authenticateWallet();
			return;
		}

		showSaveModal = true;
		strategyName = '';
		saveError = '';
	}

	async function saveStrategy() {
		if (!strategyName.trim()) {
			saveError = 'Please enter a strategy name';
			return;
		}

		if (!backtestResult) {
			saveError = 'Missing backtest data';
			return;
		}

		savingStrategy = true;
		saveError = '';

		try {
			const strategyData = {
				strategyName: strategyName,
				marketIds: selectedMarkets.map((m: any) => m.condition_id || m.conditionId || m.id),
				marketQuestion: selectedMarkets.length === 1
					? selectedMarkets[0].question
					: `Multi-market backtest (${selectedMarkets.length} markets)`,
				initialCapital: config.initialBankroll || backtestResult.startingCapital,
				startDate: config.startDate?.toISOString?.() || '',
				endDate: config.endDate?.toISOString?.() || '',

				entryType: config.entryType || 'BOTH',
				entryConfig: {
					entryTimeConstraints: config.entryTimeConstraints
				},

				positionSizingType: config.positionSizing?.type || 'FIXED',
				positionSizingValue: config.positionSizing?.type === 'PERCENTAGE'
					? config.positionSizing?.percentageOfBankroll
					: config.positionSizing?.fixedAmount,
				maxPositionSize: config.positionSizing?.maxExposurePercent,

				stopLoss: config.exitRules?.stopLoss,
				takeProfit: config.exitRules?.takeProfit,
				timeBasedExit: config.exitRules?.maxHoldTime,

				backtestResult: {
					finalCapital: backtestResult.endingCapital,
					totalReturnPercent: backtestResult.metrics.roi,
					totalTrades: backtestResult.metrics.totalTrades,
					winningTrades: backtestResult.metrics.winningTrades,
					losingTrades: backtestResult.metrics.losingTrades,
					breakEvenTrades: 0,
					winRate: backtestResult.metrics.winRate,
					avgWin: backtestResult.metrics.avgWin,
					avgLoss: backtestResult.metrics.avgLoss,
					largestWin: backtestResult.metrics.bestTrade || 0,
					largestLoss: backtestResult.metrics.worstTrade || 0,
					profitFactor: backtestResult.metrics.profitFactor,
					sharpeRatio: backtestResult.metrics.sharpeRatio,
					maxDrawdown: backtestResult.metrics.maxDrawdown,
					avgTradeDuration: backtestResult.metrics.avgHoldTime || 0,
					trades: backtestResult.trades || [],
					equityCurve: backtestResult.metrics.equityCurve || [],
				}
			};

			const response = await fetch('/api/strategies', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(strategyData)
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to save strategy');
			}

			showSaveModal = false;
			showSuccessNotification = true;

			setTimeout(() => {
				showSuccessNotification = false;
				window.location.href = '/strategies';
			}, 3000);
		} catch (error: any) {
			saveError = error.message || 'Failed to save strategy';
		} finally {
			savingStrategy = false;
		}
	}

	function exportJSON() {
		const data = {
			config: backtestResult.strategyConfig,
			metrics: backtestResult.metrics,
			trades: backtestResult.trades,
			summary: {
				startingCapital: backtestResult.startingCapital,
				endingCapital: backtestResult.endingCapital,
				marketsAnalyzed: backtestResult.marketsAnalyzed,
				executionTime: backtestResult.executionTime,
			}
		};
		downloadFile(
			JSON.stringify(data, null, 2),
			`backtest_${new Date().toISOString().slice(0, 10)}.json`,
			'application/json'
		);
	}

	function downloadFile(content: string, filename: string, type: string) {
		const blob = new Blob([content], { type: `${type};charset=utf-8;` });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = filename;
		link.style.visibility = 'hidden';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	// Check auth on init
	checkAuth();
</script>

<div class="results-page">
	<!-- Action bar -->
	<div class="action-bar">
		<div class="action-left">
			<span class="result-badge" class:positive={backtestResult.metrics.roi >= 0} class:negative={backtestResult.metrics.roi < 0}>
				{backtestResult.metrics.roi >= 0 ? '+' : ''}{backtestResult.metrics.roi.toFixed(2)}% ROI
			</span>
			<span class="result-info">{backtestResult.metrics.totalTrades} trades | {(backtestResult.executionTime / 1000).toFixed(2)}s</span>
		</div>
		<div class="action-right">
			<button class="action-btn" onclick={showSaveStrategyModal}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
					<polyline points="17 21 17 13 7 13 7 21"/>
					<polyline points="7 3 7 8 15 8"/>
				</svg>
				Save
			</button>
			<button class="action-btn" onclick={exportJSON}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
				</svg>
				JSON
			</button>
		</div>
	</div>

	<!-- Charts row (3 side-by-side) -->
	{#if backtestResult.metrics.totalTrades > 0}
		<BacktestChart {backtestResult} />
	{:else}
		<div class="no-trades-banner">
			<span class="no-trades-icon">!</span>
			<span>No trades executed. Try wider price thresholds, different date ranges, or more markets.</span>
		</div>
	{/if}

	<!-- Terminal results (fills remaining space) -->
	<div class="terminal-section">
		<BacktestTerminalResults {backtestResult} />
	</div>
</div>

<!-- Success Notification -->
{#if showSuccessNotification}
	<div class="success-notification">
		<div class="success-content">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
				<circle cx="12" cy="12" r="10" fill="#10b981"/>
				<path d="M8 12l3 3 5-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			<div>
				<h3>Strategy Saved!</h3>
				<p>Redirecting to strategies page...</p>
			</div>
			<button onclick={() => showSuccessNotification = false} class="close-notification">X</button>
		</div>
	</div>
{/if}

<!-- Auth Modal -->
{#if showAuthModal}
	<div class="modal-overlay" onclick={() => (showAuthModal = false)}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>Authentication Required</h2>
				<button class="modal-close" onclick={() => (showAuthModal = false)}>X</button>
			</div>
			<div class="modal-body">
				<p>To save your strategy, please authenticate:</p>
				<div class="auth-options">
					{#if $walletStore.connected}
						<button class="auth-btn" onclick={authenticateWallet} disabled={isAuthenticating}>
							{isAuthenticating ? 'Signing...' : 'Sign with Wallet'}
							<span class="auth-sub">{$walletStore.publicKey?.toBase58().slice(0, 8)}...{$walletStore.publicKey?.toBase58().slice(-8)}</span>
						</button>
					{:else}
						<div class="auth-btn disabled">Connect Wallet First</div>
					{/if}
					<a href="/api/auth/login" class="auth-btn">Sign in with Google</a>
				</div>
				{#if saveError}
					<div class="error-msg">{saveError}</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Save Modal -->
{#if showSaveModal}
	<div class="modal-overlay" onclick={() => (showSaveModal = false)}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>Save Strategy</h2>
				<button class="modal-close" onclick={() => (showSaveModal = false)}>X</button>
			</div>
			<div class="modal-body">
				<div class="form-group">
					<label for="strategy-name">Strategy Name</label>
					<input
						id="strategy-name"
						type="text"
						bind:value={strategyName}
						placeholder="Enter a name for your strategy"
						maxlength="100"
						disabled={savingStrategy}
					/>
				</div>
				{#if saveError}
					<div class="error-msg">{saveError}</div>
				{/if}
				<div class="modal-actions">
					<button class="btn-cancel" onclick={() => (showSaveModal = false)} disabled={savingStrategy}>Cancel</button>
					<button class="btn-confirm" onclick={saveStrategy} disabled={savingStrategy || !strategyName.trim()}>
						{savingStrategy ? 'Saving...' : 'Save Strategy'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.results-page {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: #000;
	}

	/* Action Bar */
	.action-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 16px;
		background: #000;
		border-bottom: 1px solid #1a1a1a;
		flex-shrink: 0;
	}

	.action-left {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.result-badge {
		font-family: 'Share Tech Mono', monospace;
		font-size: 13px;
		font-weight: 700;
		padding: 4px 10px;
		border-radius: 3px;
		letter-spacing: 0.5px;
	}

	.result-badge.positive {
		color: #26a65b;
		background: rgba(38, 166, 91, 0.1);
		border: 1px solid rgba(38, 166, 91, 0.3);
	}

	.result-badge.negative {
		color: #ef5350;
		background: rgba(239, 83, 80, 0.1);
		border: 1px solid rgba(239, 83, 80, 0.3);
	}

	.result-info {
		font-family: 'Share Tech Mono', monospace;
		font-size: 12px;
		color: #555;
	}

	.action-right {
		display: flex;
		gap: 8px;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		background: transparent;
		border: 1px solid #333;
		color: #aaa;
		padding: 6px 14px;
		font-family: 'Share Tech Mono', monospace;
		font-size: 12px;
		cursor: pointer;
		border-radius: 3px;
		transition: all 0.15s;
	}

	.action-btn:hover {
		color: #f97316;
		border-color: #f97316;
		background: rgba(249, 115, 22, 0.05);
	}

	/* Terminal section */
	.terminal-section {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* No trades */
	.no-trades-banner {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 20px;
		background: rgba(239, 83, 80, 0.05);
		border: 1px solid rgba(239, 83, 80, 0.2);
		color: #ef5350;
		font-family: 'Share Tech Mono', monospace;
		font-size: 13px;
		flex-shrink: 0;
	}

	.no-trades-icon {
		font-size: 18px;
		font-weight: 700;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid #ef5350;
		border-radius: 50%;
	}

	/* Success Notification */
	.success-notification {
		position: fixed;
		top: 20px;
		right: 20px;
		z-index: 1000;
		animation: slideIn 0.3s ease;
	}

	@keyframes slideIn {
		from { transform: translateX(100%); opacity: 0; }
		to { transform: translateX(0); opacity: 1; }
	}

	.success-content {
		display: flex;
		align-items: center;
		gap: 12px;
		background: #000;
		border: 1px solid #10b981;
		padding: 16px 20px;
		border-radius: 6px;
		color: #fff;
		font-family: 'Share Tech Mono', monospace;
		font-size: 13px;
	}

	.success-content h3 {
		margin: 0;
		color: #10b981;
		font-size: 14px;
	}

	.success-content p {
		margin: 4px 0 0;
		color: #888;
		font-size: 12px;
	}

	.close-notification {
		background: none;
		border: none;
		color: #888;
		cursor: pointer;
		font-size: 16px;
	}

	/* Modals */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.modal-content {
		background: #0a0a0a;
		border: 1px solid #333;
		border-radius: 8px;
		width: 90%;
		max-width: 420px;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 20px;
		border-bottom: 1px solid #222;
	}

	.modal-header h2 {
		margin: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 16px;
		color: #f97316;
	}

	.modal-close {
		background: none;
		border: none;
		color: #666;
		cursor: pointer;
		font-size: 18px;
		font-family: monospace;
	}

	.modal-close:hover {
		color: #fff;
	}

	.modal-body {
		padding: 20px;
	}

	.modal-body p {
		color: #888;
		font-size: 14px;
		margin: 0 0 16px;
	}

	.form-group {
		margin-bottom: 16px;
	}

	.form-group label {
		display: block;
		margin-bottom: 6px;
		color: #aaa;
		font-size: 13px;
		font-family: 'Share Tech Mono', monospace;
	}

	.form-group input {
		width: 100%;
		padding: 10px 12px;
		background: #111;
		border: 1px solid #333;
		border-radius: 4px;
		color: #fff;
		font-size: 14px;
		font-family: 'Share Tech Mono', monospace;
		box-sizing: border-box;
	}

	.form-group input:focus {
		outline: none;
		border-color: #f97316;
	}

	.modal-actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}

	.btn-cancel {
		padding: 8px 16px;
		background: transparent;
		border: 1px solid #444;
		color: #aaa;
		border-radius: 4px;
		cursor: pointer;
		font-family: 'Share Tech Mono', monospace;
		font-size: 13px;
	}

	.btn-confirm {
		padding: 8px 16px;
		background: #f97316;
		border: none;
		color: #000;
		border-radius: 4px;
		cursor: pointer;
		font-weight: 700;
		font-family: 'Share Tech Mono', monospace;
		font-size: 13px;
	}

	.btn-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.auth-options {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.auth-btn {
		display: block;
		padding: 12px 16px;
		background: #111;
		border: 1px solid #333;
		color: #ccc;
		border-radius: 4px;
		cursor: pointer;
		font-family: 'Share Tech Mono', monospace;
		font-size: 14px;
		text-align: center;
		text-decoration: none;
		transition: all 0.15s;
	}

	.auth-btn:hover {
		border-color: #f97316;
		color: #f97316;
	}

	.auth-btn.disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.auth-sub {
		display: block;
		font-size: 11px;
		color: #666;
		margin-top: 4px;
	}

	.error-msg {
		color: #ef5350;
		font-size: 13px;
		margin-top: 12px;
		padding: 8px 12px;
		background: rgba(239, 83, 80, 0.1);
		border-radius: 4px;
	}

	@media (max-width: 768px) {
		.action-bar {
			flex-direction: column;
			gap: 8px;
			align-items: stretch;
		}

		.action-right {
			justify-content: flex-end;
		}
	}
</style>
