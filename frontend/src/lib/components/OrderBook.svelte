<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	export let tokenIds: string[] = []; // [yesTokenId, noTokenId]
	export let yesLabel = 'Yes';
	export let noLabel = 'No';

	interface Level {
		price: number;
		size: number;
		total: number;
		depth: number; // 0-100 for bar width
	}

	interface Book {
		bids: Level[];
		asks: Level[];
		bestBid: number;
		bestAsk: number;
		spread: number;
	}

	let books: Record<string, Book> = {}; // keyed by token_id
	let loading = true;
	let error = '';
	let ws: WebSocket | null = null;
	let selectedToken: string = tokenIds[0] ?? '';
	let connected = false;
	let reconnectTimer: ReturnType<typeof setTimeout>;

	const MAX_LEVELS = 12;
	const WSS_URL = 'wss://synthesis.trade/api/v1/orderbook/ws';

	// Parse the Synthesis bids/asks object { "0.65": "1500", ... } → sorted Level[]
	function parseLevels(raw: Record<string, string>, side: 'bids' | 'asks'): Omit<Level, 'depth'>[] {
		const entries = Object.entries(raw).map(([p, s]) => ({
			price: parseFloat(p),
			size: parseFloat(s),
			total: 0,
		}));
		// bids: highest first, asks: lowest first
		entries.sort((a, b) => side === 'bids' ? b.price - a.price : a.price - b.price);
		// cumulative total
		let cum = 0;
		for (const e of entries) {
			cum += e.size;
			e.total = cum;
		}
		return entries.slice(0, MAX_LEVELS);
	}

	function addDepth(levels: Omit<Level, 'depth'>[]): Level[] {
		const maxTotal = levels[levels.length - 1]?.total ?? 1;
		return levels.map(l => ({ ...l, depth: (l.total / maxTotal) * 100 }));
	}

	function buildBook(orderbook: any): Book {
		const bidsRaw = addDepth(parseLevels(orderbook.bids ?? {}, 'bids'));
		const asksRaw = addDepth(parseLevels(orderbook.asks ?? {}, 'asks'));
		const bestBid = parseFloat(orderbook.best_bid ?? '0');
		const bestAsk = parseFloat(orderbook.best_ask ?? '0');
		return {
			bids: bidsRaw,
			asks: asksRaw,
			bestBid,
			bestAsk,
			spread: bestAsk > 0 && bestBid > 0 ? parseFloat((bestAsk - bestBid).toFixed(3)) : 0,
		};
	}

	// Apply a delta update to an existing book
	function applyDelta(book: Book, delta: any): Book {
		// delta: { price, amount, side, best_bid, best_ask }
		const price = parseFloat(delta.price);
		const amount = parseFloat(delta.amount ?? '0');
		const side = (delta.side ?? '').toUpperCase(); // BUY = bids, SELL = asks

		const updated = { ...book, bids: [...book.bids], asks: [...book.asks] };

		const levels = side === 'BUY' ? updated.bids : updated.asks;
		const idx = levels.findIndex(l => l.price === price);

		if (amount === 0) {
			if (idx !== -1) levels.splice(idx, 1);
		} else {
			if (idx !== -1) {
				levels[idx] = { ...levels[idx], size: amount };
			} else {
				levels.push({ price, size: amount, total: 0, depth: 0 });
				levels.sort((a, b) => side === 'BUY' ? b.price - a.price : a.price - b.price);
			}
		}

		// Recalculate totals and depth
		let cum = 0;
		for (const l of levels) { cum += l.size; l.total = cum; }
		const maxTotal = levels[levels.length - 1]?.total ?? 1;
		for (const l of levels) l.depth = (l.total / maxTotal) * 100;

		updated.bestBid = parseFloat(delta.best_bid ?? String(book.bestBid));
		updated.bestAsk = parseFloat(delta.best_ask ?? String(book.bestAsk));
		updated.spread = updated.bestAsk > 0 && updated.bestBid > 0
			? parseFloat((updated.bestAsk - updated.bestBid).toFixed(3))
			: 0;

		return updated;
	}

	// ── Initial REST snapshot ──────────────────────────────────────────────────
	async function fetchSnapshot() {
		if (!tokenIds.length) return;
		loading = true;
		error = '';
		try {
			const res = await fetch('/api/orderbook', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tokenIds }),
			});
			const data = await res.json();
			if (!data.success) throw new Error(data.error ?? 'Failed');
			for (const entry of data.response ?? []) {
				const ob = entry.orderbook;
				if (ob?.token_id) {
					books[ob.token_id] = buildBook(ob);
				}
			}
			books = { ...books };
		} catch (e: any) {
			error = e.message;
		} finally {
			loading = false;
		}
	}

	// ── WebSocket live updates ────────────────────────────────────────────────
	function connect() {
		if (typeof WebSocket === 'undefined') return;
		ws = new WebSocket(WSS_URL);

		ws.onopen = () => {
			connected = true;
			ws!.send(JSON.stringify({
				type: 'subscribe',
				venue: 'polymarket',
				markets: tokenIds,
			}));
		};

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data);
				if (!msg.success) return;
				const resp = msg.response;

				// Snapshot batch (initial or re-sync)
				if (resp?.orderbooks) {
					for (const entry of resp.orderbooks) {
						const ob = entry.orderbook;
						if (ob?.token_id) books[ob.token_id] = buildBook(ob);
					}
					books = { ...books };
				}
				// Delta update
				else if (resp?.delta) {
					const tokenId = resp.delta.token_id;
					if (tokenId && books[tokenId]) {
						books[tokenId] = applyDelta(books[tokenId], resp.delta);
						books = { ...books };
					}
				}
			} catch {}
		};

		ws.onclose = () => {
			connected = false;
			reconnectTimer = setTimeout(connect, 3000);
		};

		ws.onerror = () => {
			ws?.close();
		};
	}

	function disconnect() {
		clearTimeout(reconnectTimer);
		ws?.close();
		ws = null;
		connected = false;
	}

	onMount(async () => {
		await fetchSnapshot();
		connect();
	});

	onDestroy(disconnect);

	$: currentBook = books[selectedToken] ?? null;
	$: selectedLabel = selectedToken === tokenIds[0] ? yesLabel : noLabel;

	function pct(price: number) { return (price * 100).toFixed(1) + '¢'; }
	function fmtSize(s: number) {
		if (s >= 1_000_000) return (s / 1_000_000).toFixed(1) + 'M';
		if (s >= 1_000) return (s / 1_000).toFixed(1) + 'K';
		return s.toFixed(0);
	}
</script>

<div class="orderbook">
	<!-- Token selector (Yes / No) -->
	{#if tokenIds.length > 1}
		<div class="token-tabs">
			{#each tokenIds as tid, i}
				<button
					class="token-tab"
					class:active={selectedToken === tid}
					on:click={() => selectedToken = tid}
				>
					{i === 0 ? yesLabel : noLabel}
				</button>
			{/each}
			<span class="ws-dot" class:live={connected} title={connected ? 'Live' : 'Connecting…'}></span>
		</div>
	{/if}

	{#if loading}
		<div class="ob-loading">
			<div class="spinner-sm"></div>
			<span>Loading orderbook…</span>
		</div>
	{:else if error}
		<div class="ob-error">{error}</div>
	{:else if !currentBook}
		<div class="ob-empty">No orderbook data</div>
	{:else}
		<!-- Spread bar -->
		<div class="spread-row">
			<span class="spread-label">Spread</span>
			<span class="spread-val">{(currentBook.spread * 100).toFixed(1)}¢</span>
			<span class="spread-mid">Mid {pct((currentBook.bestBid + currentBook.bestAsk) / 2)}</span>
		</div>

		<div class="book-grid">
			<!-- Asks (sells) — reversed so lowest ask is at bottom, nearest spread -->
			<div class="asks-col">
				<div class="col-header">
					<span>Price</span>
					<span>Size</span>
					<span>Total</span>
				</div>
				{#each [...currentBook.asks].reverse() as level}
					<div class="level ask-level">
						<div class="depth-bar ask-bar" style="width:{level.depth}%"></div>
						<span class="price ask-price">{pct(level.price)}</span>
						<span class="size">{fmtSize(level.size)}</span>
						<span class="total">{fmtSize(level.total)}</span>
					</div>
				{/each}
			</div>

			<!-- Best bid/ask divider -->
			<div class="mid-row">
				<span class="mid-bid">{pct(currentBook.bestBid)}</span>
				<span class="mid-label">— spread —</span>
				<span class="mid-ask">{pct(currentBook.bestAsk)}</span>
			</div>

			<!-- Bids (buys) -->
			<div class="bids-col">
				{#each currentBook.bids as level}
					<div class="level bid-level">
						<div class="depth-bar bid-bar" style="width:{level.depth}%"></div>
						<span class="price bid-price">{pct(level.price)}</span>
						<span class="size">{fmtSize(level.size)}</span>
						<span class="total">{fmtSize(level.total)}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.orderbook {
		background: #0d0d0d;
		border: 1px solid #1e1e1e;
		border-radius: 10px;
		padding: 14px 16px;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 12px;
		color: #c8c8c8;
		min-width: 280px;
	}

	.token-tabs {
		display: flex;
		gap: 6px;
		margin-bottom: 12px;
		align-items: center;
	}
	.token-tab {
		background: #1a1a1a;
		border: 1px solid #2a2a2a;
		border-radius: 6px;
		color: #888;
		padding: 4px 14px;
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s;
	}
	.token-tab.active {
		background: #222;
		border-color: #444;
		color: #e8e8e8;
	}
	.ws-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #444;
		margin-left: auto;
		transition: background 0.3s;
	}
	.ws-dot.live { background: #10b981; }

	.ob-loading {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 20px 0;
		color: #555;
		justify-content: center;
	}
	.spinner-sm {
		width: 14px;
		height: 14px;
		border: 2px solid #333;
		border-top-color: #10b981;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	.ob-error, .ob-empty {
		padding: 20px 0;
		text-align: center;
		color: #555;
	}

	.spread-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
		font-size: 11px;
		color: #555;
		padding-bottom: 8px;
		border-bottom: 1px solid #1a1a1a;
	}
	.spread-val { color: #aaa; font-weight: 600; }
	.spread-mid { margin-left: auto; color: #666; }

	.book-grid {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.col-header {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		padding: 2px 4px 6px;
		color: #444;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.asks-col, .bids-col {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.level {
		position: relative;
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		padding: 3px 4px;
		border-radius: 3px;
		overflow: hidden;
	}
	.level:hover { background: rgba(255,255,255,0.03); }

	.depth-bar {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		opacity: 0.12;
		border-radius: 3px;
		transition: width 0.2s;
		pointer-events: none;
	}
	.ask-bar { background: #ef4444; }
	.bid-bar { background: #10b981; }

	.price { font-weight: 600; }
	.ask-price { color: #ef4444; }
	.bid-price { color: #10b981; }
	.size { color: #999; text-align: right; }
	.total { color: #555; text-align: right; }

	.mid-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 4px;
		font-size: 11px;
		border-top: 1px solid #1a1a1a;
		border-bottom: 1px solid #1a1a1a;
		margin: 4px 0;
	}
	.mid-bid { color: #10b981; font-weight: 600; }
	.mid-ask { color: #ef4444; font-weight: 600; }
	.mid-label { color: #333; font-size: 10px; }
</style>
