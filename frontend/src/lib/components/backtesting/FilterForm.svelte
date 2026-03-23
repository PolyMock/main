<script lang="ts">
	import type { TradeFilters } from '$lib/backtesting/step3-types';

	interface Props {
		filters?: TradeFilters;
		isLoading?: boolean;
		onLoadFiltered?: (filters: TradeFilters) => void;
	}

	let {
		filters = {
			platform: ['polymarket'],
			strat_var: null,
			timestamp_start: null,
			timestamp_end: null,
			market_id: null,
			market_title: null,
			market_category: null,
			volume_inf: null,
			volume_sup: null,
			position: null,
			possible_outcomes: null,
			price_inf: 0.0,
			price_sup: 1.0,
			amount_inf: null,
			amount_sup: null,
			wallet_maker: null,
			wallet_taker: null,
		},
		isLoading = false,
		onLoadFiltered,
	}: Props = $props();

	// Form state: store arrays as comma-separated strings
	let formFiltersStr = $state({
		platform: filters.platform?.join(', ') || 'polymarket',
		timestamp_start: filters.timestamp_start || '',
		timestamp_end: filters.timestamp_end || '',
		market_id: filters.market_id?.join(', ') || '',
		market_title: filters.market_title?.join(', ') || '',
		market_category: filters.market_category?.join(', ') || '',
		volume_inf: filters.volume_inf || '',
		volume_sup: filters.volume_sup || '',
		position: filters.position?.join(', ') || '',
		possible_outcomes: filters.possible_outcomes?.join(', ') || '',
		price_inf: filters.price_inf?.toString() || '0.0',
		price_sup: filters.price_sup?.toString() || '1.0',
		amount_inf: filters.amount_inf || '',
		amount_sup: filters.amount_sup || '',
		wallet_maker: filters.wallet_maker?.join(', ') || '',
		wallet_taker: filters.wallet_taker?.join(', ') || '',
	});

	function handleLoadFiltered() {
		if (onLoadFiltered) {
			const processedFilters: TradeFilters = {
				platform: formFiltersStr.platform ? formFiltersStr.platform.split(',').map(s => s.trim()) : ['polymarket'],
				timestamp_start: formFiltersStr.timestamp_start || null,
				timestamp_end: formFiltersStr.timestamp_end || null,
				market_id: formFiltersStr.market_id ? formFiltersStr.market_id.split(',').map(s => s.trim()) : null,
				market_title: formFiltersStr.market_title ? formFiltersStr.market_title.split(',').map(s => s.trim()) : null,
				market_category: formFiltersStr.market_category ? formFiltersStr.market_category.split(',').map(s => s.trim()) : null,
				volume_inf: formFiltersStr.volume_inf ? parseFloat(formFiltersStr.volume_inf) : null,
				volume_sup: formFiltersStr.volume_sup ? parseFloat(formFiltersStr.volume_sup) : null,
				position: formFiltersStr.position ? formFiltersStr.position.split(',').map(s => s.trim()) : null,
				possible_outcomes: formFiltersStr.possible_outcomes ? formFiltersStr.possible_outcomes.split(',').map(s => s.trim()) : null,
				price_inf: parseFloat(formFiltersStr.price_inf) || 0.0,
				price_sup: parseFloat(formFiltersStr.price_sup) || 1.0,
				amount_inf: formFiltersStr.amount_inf ? parseFloat(formFiltersStr.amount_inf) : null,
				amount_sup: formFiltersStr.amount_sup ? parseFloat(formFiltersStr.amount_sup) : null,
				wallet_maker: formFiltersStr.wallet_maker ? formFiltersStr.wallet_maker.split(',').map(s => s.trim()) : null,
				wallet_taker: formFiltersStr.wallet_taker ? formFiltersStr.wallet_taker.split(',').map(s => s.trim()) : null,
			};
			onLoadFiltered(processedFilters);
		}
	}

	function resetFilters() {
		formFiltersStr = {
			platform: 'polymarket',
			timestamp_start: '',
			timestamp_end: '',
			market_id: '',
			market_title: '',
			market_category: '',
			volume_inf: '',
			volume_sup: '',
			position: '',
			possible_outcomes: '',
			price_inf: '0.0',
			price_sup: '1.0',
			amount_inf: '',
			amount_sup: '',
			wallet_maker: '',
			wallet_taker: '',
		};
	}
</script>

<div class="filter-form">
	<div class="form-grid">
		<!-- Platform -->
		<div class="form-group">
			<label for="platform">Platform</label>
			<input
				id="platform"
				type="text"
				bind:value={formFiltersStr.platform}
				placeholder="polymarket, kalshi"
			/>
		</div>

		<!-- Timestamp Start -->
		<div class="form-group">
			<label for="timestamp_start">Start Date</label>
			<input
				id="timestamp_start"
				type="datetime-local"
				bind:value={formFiltersStr.timestamp_start}
				placeholder="e.g., 2025-01-25T00:00:00"
			/>
		</div>

		<!-- Timestamp End -->
		<div class="form-group">
			<label for="timestamp_end">End Date</label>
			<input
				id="timestamp_end"
				type="datetime-local"
				bind:value={formFiltersStr.timestamp_end}
				placeholder="e.g., 2025-01-26T23:59:59"
			/>
		</div>

		<!-- Market ID -->
		<div class="form-group">
			<label for="market_id">Market ID (comma-separated)</label>
			<input
				id="market_id"
				type="text"
				bind:value={formFiltersStr.market_id}
				placeholder="0xABC123, 0xDEF456"
			/>
		</div>

		<!-- Market Title -->
		<div class="form-group">
			<label for="market_title">Market Title (comma-separated)</label>
			<input
				id="market_title"
				type="text"
				bind:value={formFiltersStr.market_title}
				placeholder="Will BTC reach..., Will USD..."
			/>
		</div>

		<!-- Market Category -->
		<div class="form-group">
			<label for="market_category">Category (comma-separated)</label>
			<input
				id="market_category"
				type="text"
				bind:value={formFiltersStr.market_category}
				placeholder="sports, politics, crypto"
			/>
		</div>

		<!-- Volume Range -->
		<div class="form-group">
			<label for="volume_inf">Min Volume</label>
			<input
				id="volume_inf"
				type="text"
				bind:value={formFiltersStr.volume_inf}
				placeholder="null"
			/>
		</div>

		<div class="form-group">
			<label for="volume_sup">Max Volume</label>
			<input
				id="volume_sup"
				type="text"
				bind:value={formFiltersStr.volume_sup}
				placeholder="null"
			/>
		</div>

		<!-- Position -->
		<div class="form-group">
			<label for="position">Position</label>
			<input
				id="position"
				type="text"
				bind:value={formFiltersStr.position}
				placeholder="Yes, No"
			/>
		</div>

		<!-- Possible Outcomes -->
		<div class="form-group">
			<label for="possible_outcomes">Possible Outcomes (comma-separated)</label>
			<input
				id="possible_outcomes"
				type="text"
				bind:value={formFiltersStr.possible_outcomes}
				placeholder="Yes, No"
			/>
		</div>

		<!-- Price Range -->
		<div class="form-group">
			<label for="price_inf">Min Price (0.0-1.0)</label>
			<input
				id="price_inf"
				type="text"
				bind:value={formFiltersStr.price_inf}
				placeholder="0.0"
			/>
		</div>

		<div class="form-group">
			<label for="price_sup">Max Price (0.0-1.0)</label>
			<input
				id="price_sup"
				type="text"
				bind:value={formFiltersStr.price_sup}
				placeholder="1.0"
			/>
		</div>

		<!-- Amount Range -->
		<div class="form-group">
			<label for="amount_inf">Min Trade Amount</label>
			<input
				id="amount_inf"
				type="text"
				bind:value={formFiltersStr.amount_inf}
				placeholder="null"
			/>
		</div>

		<div class="form-group">
			<label for="amount_sup">Max Trade Amount</label>
			<input
				id="amount_sup"
				type="text"
				bind:value={formFiltersStr.amount_sup}
				placeholder="null"
			/>
		</div>

		<!-- Wallet Addresses -->
		<div class="form-group">
			<label for="wallet_maker">Maker Wallet (comma-separated)</label>
			<input
				id="wallet_maker"
				type="text"
				bind:value={formFiltersStr.wallet_maker}
				placeholder="0x1234..., 0x5678..."
			/>
		</div>

		<div class="form-group">
			<label for="wallet_taker">Taker Wallet (comma-separated)</label>
			<input
				id="wallet_taker"
				type="text"
				bind:value={formFiltersStr.wallet_taker}
				placeholder="0x1234..., 0x5678..."
			/>
		</div>
	</div>

	<div class="form-actions">
		<button class="btn btn-primary" onclick={handleLoadFiltered} disabled={isLoading}>
			{isLoading ? 'Loading...' : 'Load Data Filtered'}
		</button>
		<button class="btn btn-secondary" onclick={resetFilters} disabled={isLoading}>
			Reset Filters
		</button>
	</div>
</div>

<style>
	.filter-form {
		padding: 20px;
		background: #0a0a0a;
		border-right: 1px solid #333;
		color: #fff;
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		margin-bottom: 24px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.form-group label {
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #999;
	}

	.form-group input {
		padding: 8px 12px;
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 4px;
		color: #fff;
		font-family: 'Share Tech Mono', monospace;
		font-size: 13px;
	}

	.form-group input:focus {
		outline: none;
		border-color: #f97316;
		box-shadow: 0 0 8px rgba(249, 115, 22, 0.3);
	}

	.form-actions {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
	}

	.btn {
		padding: 8px 16px;
		border-radius: 4px;
		border: none;
		cursor: pointer;
		font-size: 12px;
		font-weight: 600;
		font-family: 'Share Tech Mono', monospace;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		transition: all 0.2s ease;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background: #f97316;
		color: #000;
	}

	.btn-primary:hover:not(:disabled) {
		background: #ea580c;
		box-shadow: 0 0 12px rgba(249, 115, 22, 0.4);
	}

	.btn-secondary {
		background: transparent;
		border: 1px solid #333;
		color: #999;
	}

	.btn-secondary:hover:not(:disabled) {
		border-color: #f97316;
		color: #f97316;
	}
</style>
