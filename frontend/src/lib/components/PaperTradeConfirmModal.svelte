<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { PolyMarket } from '$lib/polymarket';

	export let show = false;
	export let strategy: any;
	export let matchedMarkets: any[] = [];
	export let signaturesNeeded: number = 0;
	export let totalPositions: number = 0;

	const dispatch = createEventDispatcher();

	function close() {
		show = false;
		dispatch('close');
	}

	function confirm() {
		dispatch('confirm');
	}
</script>

{#if show}
	<div class="modal-backdrop" on:click={close}>
		<div class="modal-content" on:click|stopPropagation>
			<div class="modal-header">
				<h2>Confirm Paper Trading</h2>
				<button class="close-btn" on:click={close}>×</button>
			</div>

			<div class="modal-body">
				<div class="strategy-info">
					<h3>{strategy.strategyName}</h3>
					<p class="strategy-description">
						Strategy will be deployed across {totalPositions} matching markets
					</p>
				</div>

				<div class="warning-box">
					<div class="warning-icon">⚠️</div>
					<div class="warning-content">
						<h4>Transaction Signatures Required</h4>
						<p>
							You will need to sign <strong>{signaturesNeeded} transaction{signaturesNeeded > 1 ? 's' : ''}</strong>
							to create all positions.
						</p>
						<p class="warning-detail">
							Due to Solana transaction size limits, positions are created in batches of 3.
							Each batch requires one signature.
						</p>
					</div>
				</div>

				<div class="markets-section">
					<h4>Matched Markets ({matchedMarkets.length})</h4>
					<div class="markets-list">
						{#each matchedMarkets.slice(0, 5) as market}
							<div class="market-item">
								<div class="market-info">
									<span class="market-question">{market.question}</span>
									<div class="market-stats">
										{#if market.matchReasons && market.matchReasons.length > 0}
											<span class="match-reason">{market.matchReasons[0]}</span>
										{/if}
										{#if market.liquidity}
											<span class="stat">Liquidity: ${market.liquidity.toLocaleString()}</span>
										{/if}
									</div>
								</div>
								<span class="match-score">Match: {market.matchScore}%</span>
							</div>
						{/each}
						{#if matchedMarkets.length > 5}
							<div class="more-markets">
								+ {matchedMarkets.length - 5} more markets
							</div>
						{/if}
					</div>
				</div>

				<div class="strategy-params">
					<h4>Strategy Parameters</h4>
					<div class="params-grid">
						{#if strategy.stopLoss}
							<div class="param">
								<span class="param-label">Stop Loss:</span>
								<span class="param-value">{strategy.stopLoss}¢</span>
							</div>
						{/if}
						{#if strategy.takeProfit}
							<div class="param">
								<span class="param-label">Take Profit:</span>
								<span class="param-value">{strategy.takeProfit}¢</span>
							</div>
						{/if}
						<div class="param">
							<span class="param-label">Position Size:</span>
							<span class="param-value">{strategy.positionSizingValue}% of balance</span>
						</div>
					</div>
				</div>
			</div>

			<div class="modal-footer">
				<button class="btn btn-secondary" on:click={close}>Cancel</button>
				<button class="btn btn-primary" on:click={confirm}>
					Confirm & Start Trading
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(4px);
	}

	.modal-content {
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 16px;
		max-width: 600px;
		width: 90%;
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		padding: 24px;
		border-bottom: 1px solid #333;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 24px;
		font-weight: 700;
		color: #fff;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 32px;
		color: #888;
		cursor: pointer;
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.2s;
	}

	.close-btn:hover {
		color: #fff;
	}

	.modal-body {
		padding: 24px;
		overflow-y: auto;
		flex: 1;
	}

	.strategy-info {
		margin-bottom: 24px;
	}

	.strategy-info h3 {
		margin: 0 0 8px 0;
		font-size: 20px;
		font-weight: 600;
		color: #fff;
	}

	.strategy-description {
		color: #888;
		margin: 0;
	}

	.warning-box {
		background: rgba(255, 171, 0, 0.1);
		border: 1px solid rgba(255, 171, 0, 0.3);
		border-radius: 12px;
		padding: 16px;
		display: flex;
		gap: 16px;
		margin-bottom: 24px;
	}

	.warning-icon {
		font-size: 24px;
		flex-shrink: 0;
	}

	.warning-content h4 {
		margin: 0 0 8px 0;
		font-size: 16px;
		font-weight: 600;
		color: #ffab00;
	}

	.warning-content p {
		margin: 0 0 8px 0;
		color: #fff;
		font-size: 14px;
		line-height: 1.5;
	}

	.warning-content p:last-child {
		margin-bottom: 0;
	}

	.warning-detail {
		color: #888 !important;
		font-size: 13px !important;
	}

	.markets-section {
		margin-bottom: 24px;
	}

	.markets-section h4 {
		margin: 0 0 12px 0;
		font-size: 16px;
		font-weight: 600;
		color: #fff;
	}

	.markets-list {
		background: #0a0a0a;
		border: 1px solid #333;
		border-radius: 8px;
		overflow: hidden;
	}

	.market-item {
		padding: 12px;
		border-bottom: 1px solid #333;
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
	}

	.market-item:last-child {
		border-bottom: none;
	}

	.market-info {
		flex: 1;
		min-width: 0;
	}

	.market-question {
		display: block;
		font-size: 14px;
		color: #fff;
		margin-bottom: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.market-stats {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}

	.match-reason,
	.stat {
		font-size: 12px;
		color: #888;
	}

	.match-score {
		font-size: 14px;
		font-weight: 600;
		color: #00d084;
		flex-shrink: 0;
	}

	.more-markets {
		padding: 12px;
		text-align: center;
		color: #888;
		font-size: 14px;
	}

	.strategy-params {
		margin-bottom: 16px;
	}

	.strategy-params h4 {
		margin: 0 0 12px 0;
		font-size: 16px;
		font-weight: 600;
		color: #fff;
	}

	.params-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 12px;
	}

	.param {
		background: #0a0a0a;
		border: 1px solid #333;
		border-radius: 8px;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.param-label {
		font-size: 12px;
		color: #888;
	}

	.param-value {
		font-size: 16px;
		font-weight: 600;
		color: #fff;
	}

	.modal-footer {
		padding: 24px;
		border-top: 1px solid #333;
		display: flex;
		gap: 12px;
		justify-content: flex-end;
	}

	.btn {
		padding: 12px 24px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: all 0.2s;
	}

	.btn-secondary {
		background: #2a2a2a;
		color: #fff;
	}

	.btn-secondary:hover {
		background: #333;
	}

	.btn-primary {
		background: #00d084;
		color: #000;
	}

	.btn-primary:hover {
		background: #00e094;
		transform: translateY(-1px);
	}
</style>
