<script lang="ts">
	import type { Trade } from '$lib/backtesting/step3-types';

	interface Props {
		trades?: Trade[];
		isLoading?: boolean;
		error?: string | null;
		currentPage?: number;
		totalPages?: number;
		totalTrades?: number;
		onPageChange?: (page: number) => void;
	}

	let {
		trades = [],
		isLoading = false,
		error = null,
		currentPage = 1,
		totalPages = 1,
		totalTrades = 0,
		onPageChange,
	}: Props = $props();

	function handlePrevPage() {
		if (currentPage > 1 && onPageChange) {
			onPageChange(currentPage - 1);
		}
	}

	function handleNextPage() {
		if (currentPage < totalPages && onPageChange) {
			onPageChange(currentPage + 1);
		}
	}

	function formatPrice(price: number): string {
		return (price * 100).toFixed(1) + '%';
	}

	function formatTimestamp(ts: string): string {
		try {
			const date = new Date(ts);
			return date.toLocaleString('en-US', {
				month: '2-digit',
				day: '2-digit',
				year: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
			});
		} catch {
			return ts;
		}
	}
</script>

<div class="trade-display">
	<div class="trade-header">
		<h3>Trade Data</h3>
		<div class="pagination-info">
			Page {currentPage} of {totalPages} • {totalTrades} total trades
		</div>
	</div>

	{#if error}
		<div class="error-message">
			<p>⚠️ {error}</p>
		</div>
	{/if}

	{#if isLoading}
		<div class="loading-skeleton">
			{#each Array(5) as _}
				<div class="skeleton-row">
					<div class="skeleton-cell"></div>
					<div class="skeleton-cell"></div>
					<div class="skeleton-cell"></div>
					<div class="skeleton-cell"></div>
					<div class="skeleton-cell"></div>
					<div class="skeleton-cell"></div>
					<div class="skeleton-cell"></div>
				</div>
			{/each}
		</div>
	{:else if trades.length === 0}
		<div class="no-data">
			<p>No trades found. Try adjusting your filters.</p>
		</div>
	{:else}
		<div class="table-wrapper">
			<table class="trades-table">
				<thead>
					<tr>
						<th>Platform</th>
						<th>Timestamp</th>
						<th>Title</th>
						<th>Market ID</th>
						<th>Position</th>
						<th>Price</th>
						<th>Amount</th>
					</tr>
				</thead>
				<tbody>
					{#each trades as trade}
						<tr>
							<td>{trade.platform}</td>
							<td>{formatTimestamp(trade.timestamp)}</td>
							<td title={trade.title}>{trade.title.substring(0, 40)}...</td>
							<td title={trade.market_id}>{trade.market_id.substring(0, 20)}...</td>
							<td>{trade.position}</td>
							<td>{formatPrice(trade.price)}</td>
							<td>{trade.amount.toFixed(2)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="pagination-controls">
			<button
				class="btn btn-nav"
				onclick={handlePrevPage}
				disabled={currentPage === 1}
			>
				← Previous
			</button>
			<button
				class="btn btn-nav"
				onclick={handleNextPage}
				disabled={currentPage === totalPages}
			>
				Next →
			</button>
		</div>
	{/if}
</div>

<style>
	.trade-display {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #000;
		color: #fff;
		overflow: hidden;
	}

	.trade-header {
		padding: 16px;
		border-bottom: 1px solid #333;
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-shrink: 0;
	}

	.trade-header h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #f97316;
	}

	.pagination-info {
		font-size: 12px;
		color: #666;
		font-family: 'Share Tech Mono', monospace;
	}

	.error-message {
		padding: 12px 16px;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid #ef4444;
		border-radius: 4px;
		margin: 12px;
	}

	.error-message p {
		margin: 0;
		color: #ef4444;
		font-size: 13px;
	}

	.no-data {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #666;
		font-size: 14px;
	}

	.loading-skeleton {
		flex: 1;
		padding: 12px;
		overflow: auto;
	}

	.skeleton-row {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 8px;
		margin-bottom: 8px;
	}

	.skeleton-cell {
		height: 16px;
		background: linear-gradient(90deg, #1a1a1a 20%, #2a2a2a 50%, #1a1a1a 80%);
		background-size: 200% 100%;
		border-radius: 4px;
		animation: shimmer 2s infinite;
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	.table-wrapper {
		flex: 1;
		overflow-y: auto;
		overflow-x: auto;
	}

	.trades-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
		font-family: 'Share Tech Mono', monospace;
	}

	.trades-table thead {
		position: sticky;
		top: 0;
		background: #0a0a0a;
		border-bottom: 1px solid #333;
	}

	.trades-table th {
		padding: 12px 8px;
		text-align: left;
		font-weight: 600;
		color: #999;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.trades-table tbody tr {
		border-bottom: 1px solid #1a1a1a;
		transition: background-color 0.2s ease;
	}

	.trades-table tbody tr:hover {
		background: #0f0f0f;
	}

	.trades-table td {
		padding: 10px 8px;
		color: #ccc;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.pagination-controls {
		padding: 12px 16px;
		border-top: 1px solid #333;
		display: flex;
		gap: 8px;
		justify-content: flex-end;
		flex-shrink: 0;
	}

	.btn {
		padding: 6px 12px;
		border-radius: 4px;
		border: 1px solid #333;
		background: transparent;
		color: #999;
		font-size: 11px;
		font-weight: 600;
		font-family: 'Share Tech Mono', monospace;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn:hover:not(:disabled) {
		border-color: #f97316;
		color: #f97316;
	}

	.btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
