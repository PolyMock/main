<script lang="ts">
	import { walletStore } from '$lib/wallet/stores';
	import { get } from 'svelte/store';

	export let trade: {
		marketId: string;
		marketName: string;
		positionType: string;
		entryPrice: number;
		exitPrice?: number;
		pnl?: number;
		amount: number;
		status: string;
	};
	export let onClose: () => void;
	export let onPosted: () => void;

	let analysis = '';
	let posting = false;
	let error = '';
	let posted = false;

	$: pnlPercent = trade.pnl != null && trade.amount > 0
		? ((trade.pnl / trade.amount) * 100)
		: 0;

	$: isWin = (trade.pnl ?? 0) >= 0;

	async function postTrade() {
		error = '';
		const wallet = get(walletStore).publicKey?.toString();
		if (!wallet) {
			error = 'Connect your wallet first';
			return;
		}

		posting = true;

		const res = await fetch('/api/trades', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				positionType: trade.positionType,
				entryPrice: trade.entryPrice,
				exitPrice: trade.exitPrice,
				amount: trade.amount,
				pnl: trade.pnl,
				marketId: trade.marketId,
				marketName: trade.marketName,
				status: trade.status,
				analysis: analysis.trim() || null,
			}),
		});

		const result = await res.json();

		if (!res.ok) {
			error = result.error || 'Failed to post trade.';
			posting = false;
			return;
		}

		posting = false;
		posted = true;
		setTimeout(() => onPosted(), 1500);
	}
</script>

<div class="modal-overlay" on:click|self={onClose}>
	<div class="modal-box">
		<!-- Success State -->
		{#if posted}
			<div class="success-state">
				<div class="success-icon">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
						<circle cx="12" cy="12" r="10"/>
						<path d="M8 12l3 3 5-5"/>
					</svg>
				</div>
				<h3>Trade Published!</h3>
				<p>Your trade is now visible in the community feed.</p>
			</div>
		{:else}
			<!-- Header -->
			<div class="modal-header">
				<div class="header-left">
					<div class="header-icon">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M22 2L11 13"/>
							<path d="M22 2L15 22L11 13L2 9L22 2Z"/>
						</svg>
					</div>
					<div>
						<h3>Share Trade</h3>
						<p class="header-subtitle">Publish to the community feed</p>
					</div>
				</div>
				<button class="close-btn" on:click={onClose}>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"/>
						<line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>

			<!-- Info Banner -->
			<div class="info-banner">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10"/>
					<line x1="12" y1="16" x2="12" y2="12"/>
					<line x1="12" y1="8" x2="12.01" y2="8"/>
				</svg>
				<span>This will share your trade publicly. Other traders can see your position, PnL, and analysis.</span>
			</div>

			<!-- Trade Card Preview -->
			<div class="trade-card">
				<div class="card-top">
					<span class="position-badge" class:badge-yes={trade.positionType === 'Yes'} class:badge-no={trade.positionType === 'No'}>
						{trade.positionType}
					</span>
					<span class="platform-tag">Polymarket</span>
				</div>

				<h4 class="market-name">{trade.marketName}</h4>

				<!-- PnL Highlight -->
				{#if trade.pnl != null}
					<div class="pnl-highlight" class:win={isWin} class:loss={!isWin}>
						<div class="pnl-main">
							<span class="pnl-sign">{isWin ? '+' : ''}</span>
							<span class="pnl-amount">${Math.abs(trade.pnl).toFixed(2)}</span>
						</div>
						<div class="pnl-percent">
							{isWin ? '+' : ''}{pnlPercent.toFixed(1)}%
						</div>
					</div>
				{/if}

				<!-- Trade Details Grid -->
				<div class="details-grid">
					<div class="detail">
						<span class="detail-label">Invested</span>
						<span class="detail-value">${trade.amount.toFixed(2)}</span>
					</div>
					<div class="detail">
						<span class="detail-label">Entry Price</span>
						<span class="detail-value">${trade.entryPrice.toFixed(4)}</span>
					</div>
					{#if trade.exitPrice != null}
						<div class="detail">
							<span class="detail-label">Exit Price</span>
							<span class="detail-value">${trade.exitPrice.toFixed(4)}</span>
						</div>
					{/if}
					<div class="detail">
						<span class="detail-label">Status</span>
						<span class="detail-value status-closed">Closed</span>
					</div>
				</div>
			</div>

			<!-- Analysis Input -->
			<div class="analysis-section">
				<label for="analysis">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
						<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
					</svg>
					Add your analysis
					<span class="optional-tag">optional</span>
				</label>
				<textarea
					id="analysis"
					bind:value={analysis}
					placeholder="What was your thesis? Why did you enter this trade? What did you learn?"
					rows="4"
					maxlength="500"
				></textarea>
				<div class="textarea-footer">
					<span class="hint">Markdown not supported</span>
					<span class="char-count" class:near-limit={analysis.length > 400}>{analysis.length}/500</span>
				</div>
			</div>

			<!-- Error -->
			{#if error}
				<div class="error-box">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10"/>
						<line x1="15" y1="9" x2="9" y2="15"/>
						<line x1="9" y1="9" x2="15" y2="15"/>
					</svg>
					<span>{error}</span>
				</div>
			{/if}

			<!-- Actions -->
			<div class="modal-actions">
				<button class="cancel-btn" on:click={onClose} disabled={posting}>
					Cancel
				</button>
				<button class="publish-btn" on:click={postTrade} disabled={posting}>
					{#if posting}
						<div class="btn-spinner"></div>
						Publishing...
					{:else}
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M22 2L11 13"/>
							<path d="M22 2L15 22L11 13L2 9L22 2Z"/>
						</svg>
						Publish Trade
					{/if}
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9000;
		backdrop-filter: blur(6px);
		animation: fadeIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal-box {
		background: #0a0a0a;
		border: 1px solid #222;
		border-radius: 16px;
		width: 480px;
		max-width: 92vw;
		max-height: 90vh;
		overflow-y: auto;
		animation: slideUp 0.2s ease-out;
	}

	@keyframes slideUp {
		from { transform: translateY(12px); opacity: 0; }
		to { transform: translateY(0); opacity: 1; }
	}

	/* Success State */
	.success-state {
		padding: 48px 24px;
		text-align: center;
		animation: scaleIn 0.3s ease-out;
	}

	@keyframes scaleIn {
		from { transform: scale(0.9); opacity: 0; }
		to { transform: scale(1); opacity: 1; }
	}

	.success-icon {
		margin-bottom: 16px;
	}

	.success-state h3 {
		margin: 0 0 8px 0;
		font-size: 20px;
		color: #10b981;
		font-weight: 700;
	}

	.success-state p {
		margin: 0;
		color: #888;
		font-size: 14px;
	}

	/* Header */
	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px 24px;
		border-bottom: 1px solid #1a1a1a;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.header-icon {
		width: 36px;
		height: 36px;
		border-radius: 10px;
		background: rgba(249, 115, 22, 0.1);
		border: 1px solid rgba(249, 115, 22, 0.2);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #F97316;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 16px;
		color: #fff;
		font-weight: 700;
	}

	.header-subtitle {
		margin: 2px 0 0 0;
		font-size: 12px;
		color: #666;
	}

	.close-btn {
		background: transparent;
		border: 1px solid #222;
		color: #666;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}

	.close-btn:hover {
		color: #fff;
		border-color: #444;
		background: #1a1a1a;
	}

	/* Info Banner */
	.info-banner {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		margin: 16px 20px 0 20px;
		padding: 12px 14px;
		background: rgba(249, 115, 22, 0.05);
		border: 1px solid rgba(249, 115, 22, 0.15);
		border-radius: 10px;
		font-size: 12px;
		color: #999;
		line-height: 1.5;
	}

	.info-banner svg {
		flex-shrink: 0;
		margin-top: 1px;
		color: #F97316;
	}

	/* Trade Card */
	.trade-card {
		margin: 16px 20px;
		padding: 20px;
		background: #111;
		border: 1px solid #1e1e1e;
		border-radius: 12px;
	}

	.card-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.position-badge {
		padding: 4px 10px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.badge-yes {
		background: rgba(16, 185, 129, 0.12);
		color: #10b981;
		border: 1px solid rgba(16, 185, 129, 0.25);
	}

	.badge-no {
		background: rgba(239, 68, 68, 0.12);
		color: #ef4444;
		border: 1px solid rgba(239, 68, 68, 0.25);
	}

	.platform-tag {
		font-size: 11px;
		color: #555;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.market-name {
		margin: 0 0 16px 0;
		font-size: 15px;
		color: #e0e0e0;
		font-weight: 600;
		line-height: 1.5;
	}

	/* PnL Highlight */
	.pnl-highlight {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 16px;
		border-radius: 10px;
		margin-bottom: 16px;
	}

	.pnl-highlight.win {
		background: rgba(16, 185, 129, 0.08);
		border: 1px solid rgba(16, 185, 129, 0.2);
	}

	.pnl-highlight.loss {
		background: rgba(239, 68, 68, 0.08);
		border: 1px solid rgba(239, 68, 68, 0.2);
	}

	.pnl-main {
		display: flex;
		align-items: baseline;
	}

	.pnl-sign {
		font-size: 20px;
		font-weight: 700;
	}

	.pnl-amount {
		font-size: 28px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}

	.pnl-percent {
		font-size: 16px;
		font-weight: 700;
	}

	.pnl-highlight.win .pnl-sign,
	.pnl-highlight.win .pnl-amount,
	.pnl-highlight.win .pnl-percent {
		color: #10b981;
	}

	.pnl-highlight.loss .pnl-sign,
	.pnl-highlight.loss .pnl-amount,
	.pnl-highlight.loss .pnl-percent {
		color: #ef4444;
	}

	/* Details Grid */
	.details-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}

	.detail {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.detail-label {
		font-size: 11px;
		color: #555;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.detail-value {
		font-size: 14px;
		color: #ccc;
		font-weight: 600;
		font-family: 'SF Mono', Consolas, monospace;
	}

	.status-closed {
		color: #F97316;
	}

	/* Analysis */
	.analysis-section {
		padding: 0 20px;
		margin-bottom: 16px;
	}

	.analysis-section label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: #888;
		font-weight: 600;
		margin-bottom: 8px;
	}

	.analysis-section label svg {
		color: #666;
	}

	.optional-tag {
		font-size: 10px;
		color: #444;
		font-weight: 500;
		background: #1a1a1a;
		padding: 2px 6px;
		border-radius: 4px;
		margin-left: 4px;
	}

	textarea {
		width: 100%;
		background: #111;
		border: 1px solid #222;
		color: #ddd;
		padding: 12px;
		font-size: 13px;
		font-family: inherit;
		border-radius: 10px;
		resize: none;
		outline: none;
		box-sizing: border-box;
		line-height: 1.5;
		transition: border-color 0.15s;
	}

	textarea::placeholder {
		color: #444;
	}

	textarea:focus {
		border-color: #F97316;
	}

	.textarea-footer {
		display: flex;
		justify-content: space-between;
		margin-top: 6px;
	}

	.hint {
		font-size: 11px;
		color: #333;
	}

	.char-count {
		font-size: 11px;
		color: #444;
		transition: color 0.15s;
	}

	.char-count.near-limit {
		color: #F97316;
	}

	/* Error */
	.error-box {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 20px 16px 20px;
		padding: 10px 14px;
		background: rgba(239, 68, 68, 0.08);
		border: 1px solid rgba(239, 68, 68, 0.2);
		border-radius: 8px;
		font-size: 13px;
		color: #ef4444;
	}

	.error-box svg {
		flex-shrink: 0;
	}

	/* Actions */
	.modal-actions {
		display: flex;
		gap: 10px;
		padding: 16px 20px 20px 20px;
		border-top: 1px solid #1a1a1a;
	}

	.cancel-btn {
		flex: 1;
		padding: 12px;
		background: transparent;
		border: 1px solid #222;
		color: #888;
		border-radius: 10px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}

	.cancel-btn:hover:not(:disabled) {
		border-color: #444;
		color: #ccc;
		background: #111;
	}

	.publish-btn {
		flex: 2;
		padding: 12px;
		background: #F97316;
		border: none;
		color: #fff;
		border-radius: 10px;
		font-size: 14px;
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		transition: all 0.15s;
	}

	.publish-btn:hover:not(:disabled) {
		background: #ea580c;
	}

	.publish-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Scrollbar */
	.modal-box::-webkit-scrollbar {
		width: 4px;
	}

	.modal-box::-webkit-scrollbar-track {
		background: transparent;
	}

	.modal-box::-webkit-scrollbar-thumb {
		background: #333;
		border-radius: 2px;
	}
</style>
