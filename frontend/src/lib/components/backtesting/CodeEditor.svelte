<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet" />
</svelte:head>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	// Props
	let {
		dataSource,
		useTimePeriod,
		timestampStartStr,
		timestampEndStr,
		filterTitleSearch,
		filterCategories,
		filterVolumeInf,
		filterVolumeSup,
		onEditConfig,
		onRunBacktest,
	}: {
		dataSource: 'synthesis' | 'parquet';
		useTimePeriod: boolean;
		timestampStartStr: string;
		timestampEndStr: string;
		filterTitleSearch: string;
		filterCategories: Set<string>;
		filterVolumeInf: number | null;
		filterVolumeSup: number | null;
		onEditConfig: () => void;
		onRunBacktest: (strategyCode: string) => void;
	} = $props();

	// Terminal color constants
	const O = '\x1b[38;5;208m'; // orange
	const G = '\x1b[32m'; // green
	const R = '\x1b[0m'; // reset
	const DIM = '\x1b[90m'; // dim/gray

	// Strategy editor state
	let strategyCode = $state(`def strategy(trade, trade_log, portfolio, params):
    """
    Args:
        trade: Current trade dict (price, amount, position, market_id, etc.)
        trade_log: List of past executed trades
        portfolio: { cash: float, positions: { (market_id, position): amount } }
        params: Custom dict to persist data across trades

    Returns:
        { market_id, position ("hold" or outcome), amount, user_perso_parameters }
    """
    # Your strategy logic here
    return {
        "market_id": trade["market_id"],
        "position": "hold",
        "amount": 0,
        "user_perso_parameters": params
    }`);

	let selectedExample: number | null = $state(null);
	let dataCollapsed = $state(false);

	const mockTrades = [
		{ timestamp: '2025-03-15 14:32', title: 'Will BTC hit $100k by June?', position: 'Yes', price: 0.62, amount: 50, volume: 1240000, category: 'Crypto' },
		{ timestamp: '2025-03-15 14:28', title: 'Fed rate cut in May?', position: 'No', price: 0.35, amount: 30, volume: 890000, category: 'Economics' },
		{ timestamp: '2025-03-15 14:15', title: 'ETH above $5k by April?', position: 'Yes', price: 0.41, amount: 75, volume: 2100000, category: 'Crypto' },
		{ timestamp: '2025-03-15 13:58', title: 'Trump wins 2028 GOP primary?', position: 'Yes', price: 0.78, amount: 20, volume: 5600000, category: 'Politics' },
		{ timestamp: '2025-03-15 13:42', title: 'SOL above $200 by June?', position: 'No', price: 0.55, amount: 40, volume: 980000, category: 'Crypto' },
		{ timestamp: '2025-03-15 13:30', title: 'US GDP growth > 3% Q2?', position: 'Yes', price: 0.29, amount: 60, volume: 450000, category: 'Economics' },
		{ timestamp: '2025-03-15 13:12', title: 'SpaceX Starship launch success?', position: 'Yes', price: 0.83, amount: 25, volume: 1800000, category: 'Science' },
		{ timestamp: '2025-03-15 12:55', title: 'DOGE above $0.50 by May?', position: 'No', price: 0.18, amount: 100, volume: 3200000, category: 'Crypto' },
	];

	const exampleStrategies = [
		{
			name: 'Mean Reversion',
			description: 'Buys when price drops very low (≤ $0.01), betting on reversion to the mean.',
			code: `def strategy(trade, trade_log, portfolio, params):
    if trade["price"] <= 0.01:
        return {
            "market_id": trade["market_id"],
            "position": trade["position"],
            "amount": 10,
            "user_perso_parameters": params
        }
    return {"market_id": trade["market_id"], "position": "hold", "amount": 0}`
		},
		{
			name: 'Cash-Weighted Mean Reversion',
			description: 'Buys low-priced positions with 1% of available cash for dynamic sizing.',
			code: `def strategy(trade, trade_log, portfolio, params):
    if trade["price"] <= 0.01:
        amount = int(portfolio["cash"] * 0.01)
        if amount > 0:
            return {
                "market_id": trade["market_id"],
                "position": trade["position"],
                "amount": amount,
                "user_perso_parameters": params
            }
    return {"market_id": trade["market_id"], "position": "hold", "amount": 0}`
		},
		{
			name: 'No Duplicate Positions',
			description: 'Buys low-priced positions only if not already holding that market/position.',
			code: `def strategy(trade, trade_log, portfolio, params):
    key = (trade["market_id"], trade["position"])
    if trade["price"] <= 0.01 and key not in portfolio["positions"]:
        return {
            "market_id": trade["market_id"],
            "position": trade["position"],
            "amount": 10,
            "user_perso_parameters": params
        }
    return {"market_id": trade["market_id"], "position": "hold", "amount": 0}`
		},
		{
			name: 'Better Price Only',
			description: 'Only buys if the current price is lower than the minimum previously paid.',
			code: `def strategy(trade, trade_log, portfolio, params):
    key = (trade["market_id"], trade["position"])
    past = [t["cost"]/t["amount"] for t in trade_log if (t["market_id"], t["position"]) == key and t["amount"] > 0]
    min_price = min(past) if past else float("inf")
    if trade["price"] <= 0.01 and trade["price"] < min_price:
        return {
            "market_id": trade["market_id"],
            "position": trade["position"],
            "amount": 10,
            "user_perso_parameters": params
        }
    return {"market_id": trade["market_id"], "position": "hold", "amount": 0}`
		},
		{
			name: 'Cooldown Strategy',
			description: 'Waits at least 1 day between trades on the same market/position.',
			code: `def strategy(trade, trade_log, portfolio, params):
    key = (trade["market_id"], trade["position"])
    past = [t for t in trade_log if (t["market_id"], t["position"]) == key]
    if past:
        last_time = max(t["time"] for t in past)
        if trade["timestamp"] - last_time < 86400:
            return {"market_id": trade["market_id"], "position": "hold", "amount": 0}
    if trade["price"] <= 0.01:
        return {
            "market_id": trade["market_id"],
            "position": trade["position"],
            "amount": 10,
            "user_perso_parameters": params
        }
    return {"market_id": trade["market_id"], "position": "hold", "amount": 0}`
		},
	];

	function loadExample(idx: number) {
		selectedExample = idx;
		strategyCode = exampleStrategies[idx].code;
		codeLines = exampleStrategies[idx].code.split('\n');
	}

	// Strategy code editor terminal (xterm)
	let codeTermContainer: HTMLDivElement;
	let codeTermInitialized = $state(false);
	let codeTermInstance: any = $state(null);
	let codeInputLine = '';
	let codeLines: string[] = [];

	async function initCodeTerm() {
		if (codeTermInitialized || !codeTermContainer) return;
		codeTermInitialized = true;

		const { Terminal } = await import('@xterm/xterm');
		const { FitAddon } = await import('@xterm/addon-fit');
		await import('@xterm/xterm/css/xterm.css');

		const term = new Terminal({
			theme: {
				background: '#000000',
				foreground: '#ffffff',
				cursor: '#f97316',
				cursorAccent: '#000000',
				selectionBackground: 'rgba(249, 115, 22, 0.3)',
			},
			fontSize: 13,
			cursorBlink: true,
			cursorStyle: 'block',
			scrollback: 5000,
		});

		const fitAddon = new FitAddon();
		term.loadAddon(fitAddon);
		term.open(codeTermContainer);
		fitAddon.fit();
		codeTermInstance = term;

		const resizeObserver = new ResizeObserver(() => fitAddon.fit());
		resizeObserver.observe(codeTermContainer);

		await new Promise(r => setTimeout(r, 150));
		fitAddon.fit();

		// Strategy editor intro
		term.writeln(`${O}━━━ STRATEGY EDITOR ━━━${R}`);
		term.writeln('');
		term.writeln('Write your Python strategy function below.');
		term.writeln('Your function receives 4 arguments for each trade:');
		term.writeln('');
		term.writeln(`  ${O}trade${R}      - Current trade data (price, amount, position, market_id, title...)`);
		term.writeln(`  ${O}trade_log${R}  - List of your past executed trades`);
		term.writeln(`  ${O}portfolio${R}  - Your portfolio: { cash, positions }`);
		term.writeln(`  ${O}params${R}     - Custom dict to persist data across trades`);
		term.writeln('');
		term.writeln('Return: { market_id, position ("hold" or outcome), amount, user_perso_parameters }');
		term.writeln('');
		term.writeln(`${DIM}Commands: ${O}load <n>${R}${DIM} (load example 1-${exampleStrategies.length}), ${O}clear${R}${DIM}, ${O}show${R}${DIM} (show code), ${O}examples${R}${DIM}${R}`);
		term.writeln(`${DIM}Type your code line by line. Use ${O}done${R}${DIM} to finish, ${O}undo${R}${DIM} to remove last line.${R}`);
		term.writeln('');
		term.writeln(`${G}def strategy(trade, trade_log, portfolio, params):${R}`);
		codeLines = ['def strategy(trade, trade_log, portfolio, params):'];
		codePrompt(term);

		// Input handler
		term.onData((data: string) => {
			const code = data.charCodeAt(0);
			if (data === '\r') {
				term.write('\r\n');
				handleCodeInput(term, codeInputLine);
				codeInputLine = '';
			} else if (data === '\x7f') {
				if (codeInputLine.length > 0) {
					codeInputLine = codeInputLine.slice(0, -1);
					term.write('\b \b');
				}
			} else if (code >= 32) {
				codeInputLine += data;
				term.write(data);
			}
		});
	}

	function codePrompt(term: any) {
		const lineNum = codeLines.length + 1;
		const pad = String(lineNum).padStart(3, ' ');
		term.write(`${DIM}${pad} |${R}     `);
		term.scrollToBottom();
	}

	function handleCodeInput(term: any, input: string) {
		const trimmed = input.trim().toLowerCase();

		if (trimmed === 'done') {
			strategyCode = codeLines.join('\n');
			term.writeln('');
			term.writeln(`${G}━━━ Strategy saved! (${codeLines.length} lines) ━━━${R}`);
			term.writeln(`${DIM}Strategy code is ready. Run backtest when available.${R}`);
			term.write(`\r\n${O}❯${R} `);
			onRunBacktest(strategyCode);
			return;
		}
		if (trimmed === 'undo') {
			if (codeLines.length > 1) {
				codeLines.pop();
				term.writeln(`${DIM}Removed last line. (${codeLines.length} lines remaining)${R}`);
			} else {
				term.writeln(`${DIM}Cannot remove function definition.${R}`);
			}
			codePrompt(term);
			return;
		}
		if (trimmed === 'show') {
			term.writeln('');
			term.writeln(`${O}━━━ Current Code ━━━${R}`);
			codeLines.forEach((line, i) => {
				const pad = String(i + 1).padStart(3, ' ');
				term.writeln(`${DIM}${pad} |${R} ${G}${line}${R}`);
			});
			term.writeln(`${O}━━━━━━━━━━━━━━━━━━━━${R}`);
			term.writeln('');
			codePrompt(term);
			return;
		}
		if (trimmed === 'clear') {
			term.clear();
			codePrompt(term);
			return;
		}
		if (trimmed === 'examples') {
			term.writeln('');
			exampleStrategies.forEach((ex, i) => {
				term.writeln(`  ${O}${i + 1}${R} - ${ex.name}: ${DIM}${ex.description}${R}`);
			});
			term.writeln(`\n${DIM}Type ${O}load <number>${R}${DIM} to load an example.${R}`);
			term.writeln('');
			codePrompt(term);
			return;
		}
		if (trimmed.startsWith('load ')) {
			const num = parseInt(trimmed.replace('load ', ''));
			if (num >= 1 && num <= exampleStrategies.length) {
				const ex = exampleStrategies[num - 1];
				codeLines = ex.code.split('\n');
				strategyCode = ex.code;
				selectedExample = num - 1;
				term.writeln('');
				term.writeln(`${G}Loaded: ${ex.name}${R}`);
				term.writeln('');
				codeLines.forEach((line, i) => {
					const pad = String(i + 1).padStart(3, ' ');
					term.writeln(`${DIM}${pad} |${R} ${G}${line}${R}`);
				});
				term.writeln('');
				term.writeln(`${DIM}Type ${O}done${R}${DIM} to save, or continue editing.${R}`);
				term.writeln('');
				codePrompt(term);
			} else {
				term.writeln(`${O}Invalid. Use load 1-${exampleStrategies.length}${R}`);
				codePrompt(term);
			}
			return;
		}

		// Regular code line
		codeLines.push('    ' + input);
		codePrompt(term);
	}

	// Initialize xterm when container is available
	$effect(() => {
		if (browser && codeTermContainer) {
			// Reset if container changed (e.g. after edit config round-trip)
			if (codeTermInstance && !codeTermContainer.querySelector('.xterm')) {
				codeTermInstance = null;
				codeTermInitialized = false;
			}
			setTimeout(() => initCodeTerm(), 100);
		}
	});

	// Cleanup on destroy
	onDestroy(() => {
		if (codeTermInstance) {
			codeTermInstance.dispose();
			codeTermInstance = null;
			codeTermInitialized = false;
		}
	});
</script>

<div class="strategy-editor-page">
	<!-- TOP: Dataset panel with edit button -->
	<div class="data-panel" class:collapsed={dataCollapsed}>
		<button class="data-header" onclick={() => dataCollapsed = !dataCollapsed}>
			<span class="data-title">
				<span class="cbl">DATASET</span>
				<span class="data-tag"><span class="data-tag-label">SOURCE</span> {dataSource === 'synthesis' ? 'Synthesis API' : 'Parquet'}</span>
				<span class="data-tag"><span class="data-tag-label">TRADES</span> {mockTrades.length.toLocaleString()}</span>
				<span class="data-tag"><span class="data-tag-label">PLATFORM</span> Polymarket</span>
				<span class="data-tag"><span class="data-tag-label">TIMELINE</span> {useTimePeriod ? `${timestampStartStr} → ${timestampEndStr}` : 'All time'}</span>
				{#if filterTitleSearch}<span class="data-tag"><span class="data-tag-label">TITLE</span> {filterTitleSearch}</span>{/if}
				{#if filterCategories.size > 0}<span class="data-tag"><span class="data-tag-label">CATEGORY</span> {Array.from(filterCategories).join(', ')}</span>{/if}
				{#if filterVolumeInf || filterVolumeSup}<span class="data-tag"><span class="data-tag-label">VOLUME</span> {filterVolumeInf ?? '0'} → {filterVolumeSup ?? '∞'}</span>{/if}
			</span>
			<span class="data-right">
				<span class="config-bar-edit" role="button" tabindex="0" onclick={(e) => { e.stopPropagation(); onEditConfig(); }} onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onEditConfig(); } }}>
						EDIT CONFIG
				</span>
				<span class="data-toggle">{dataCollapsed ? '▸' : '▾'}</span>
			</span>
		</button>
		{#if !dataCollapsed}
			<div class="data-table-wrap">
				<table class="data-table">
					<thead>
						<tr>
							<th>TIMESTAMP</th>
							<th>MARKET</th>
							<th>POSITION</th>
							<th>PRICE</th>
							<th>AMOUNT</th>
							<th>VOLUME</th>
							<th>CATEGORY</th>
						</tr>
					</thead>
					<tbody>
						{#each mockTrades as t}
							<tr>
								<td class="td-dim">{t.timestamp}</td>
								<td class="td-title">{t.title}</td>
								<td class:td-yes={t.position === 'Yes'} class:td-no={t.position === 'No'}>{t.position}</td>
								<td>${t.price.toFixed(2)}</td>
								<td>{t.amount}</td>
								<td class="td-dim">{t.volume.toLocaleString()}</td>
								<td class="td-dim">{t.category}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<!-- MIDDLE: Example strategies -->
	<div class="examples-bar">
		{#each exampleStrategies as example, i}
			<button
				class="example-chip"
				class:selected={selectedExample === i}
				onclick={() => { loadExample(i); if (codeTermInstance) { codeTermInstance.clear(); codeTermInstance.writeln(`${G}Loaded: ${example.name}${R}\n`); codeLines.forEach((line, j) => { const pad = String(j+1).padStart(3,' '); codeTermInstance.writeln(`${DIM}${pad} |${R} ${G}${line}${R}`); }); codeTermInstance.writeln(`\n${DIM}Type done to save, or continue editing.${R}\n`); codePrompt(codeTermInstance); } }}
			>
				<span class="example-name">{example.name}</span>
				<span class="example-desc">{example.description}</span>
			</button>
		{/each}
	</div>

	<!-- BOTTOM: Code Terminal -->
	<div class="code-term-wrapper" bind:this={codeTermContainer}></div>
</div>

<style>
	/* ═══════════════ STRATEGY EDITOR PAGE ═══════════════ */
	.strategy-editor-page {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: #000;
	}

	.cbl {
		color: #f97316;
		font-weight: 700;
		font-size: 11px;
		letter-spacing: 1px;
		margin-right: 6px;
	}
	.config-bar-edit {
		background: transparent;
		border: 1px solid #555;
		color: #ccc;
		padding: 6px 16px;
		font-family: monospace;
		font-size: 12px;
		cursor: pointer;
		border-radius: 4px;
		letter-spacing: 1px;
		transition: all 0.2s;
		font-weight: 600;
	}
	.config-bar-edit:hover {
		color: #f97316;
		border-color: #f97316;
		background: rgba(249, 115, 22, 0.08);
	}

	/* ── Data Panel (top section) ── */
	.data-panel {
		flex-shrink: 0;
		border-bottom: 1px solid #fff;
		overflow: hidden;
		background: #000;
	}
	.data-header {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 14px 20px;
		background: #000;
		border: none;
		color: #eee;
		cursor: pointer;
		font-size: 14px;
	}
	.data-header:hover {
		background: #0a0a0a;
	}
	.data-title {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.data-tag {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-family: monospace;
		font-size: 12px;
		color: #ccc;
		background: #111;
		padding: 3px 10px;
		border-radius: 3px;
		border: 1px solid #222;
	}
	.data-tag-label {
		color: #f97316;
		font-weight: 700;
		font-size: 10px;
		letter-spacing: 0.5px;
	}
	.data-right {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.data-toggle {
		color: #f97316;
		font-size: 16px;
	}
	.data-table-wrap {
		max-height: 220px;
		overflow-y: auto;
		background: #000;
	}
	.data-table-wrap::-webkit-scrollbar {
		width: 5px;
	}
	.data-table-wrap::-webkit-scrollbar-track {
		background: #000;
	}
	.data-table-wrap::-webkit-scrollbar-thumb {
		background: #333;
		border-radius: 3px;
	}
	.data-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
		font-family: 'Share Tech Mono', monospace;
	}
	.data-table th {
		position: sticky;
		top: 0;
		background: #000;
		color: #f97316;
		text-align: left;
		padding: 8px 16px;
		font-weight: 600;
		font-size: 11px;
		letter-spacing: 0.5px;
		border-bottom: 1px solid #333;
	}
	.data-table td {
		padding: 7px 16px;
		color: #ddd;
		border-bottom: 1px solid #111;
		white-space: nowrap;
	}
	.data-table tr:hover td {
		background: #0a0a0a;
	}
	.td-dim {
		color: #777;
	}
	.td-title {
		color: #ccc;
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.td-yes {
		color: #22c55e;
		font-weight: 600;
	}
	.td-no {
		color: #ef4444;
		font-weight: 600;
	}

	/* ── Examples Bar (middle section) ── */
	.examples-bar {
		display: flex;
		flex-shrink: 0;
		overflow-x: auto;
		background: #000;
		border-bottom: 1px solid #fff;
	}
	.examples-bar::-webkit-scrollbar {
		height: 0;
	}
	.example-chip {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 14px 18px;
		background: transparent;
		border: none;
		border-right: 1px solid #333;
		color: #888;
		cursor: pointer;
		text-align: left;
		transition: all 0.2s;
	}
	.example-chip:last-child {
		border-right: none;
	}
	.example-chip:hover {
		background: #0a0a0a;
	}
	.example-chip:hover .example-name {
		color: #fff;
	}
	.example-chip.selected {
		background: #0a0a0a;
		border-bottom: 2px solid #f97316;
	}
	.example-chip.selected .example-name {
		color: #f97316;
	}
	.example-name {
		font-family: monospace;
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.5px;
		color: #ccc;
		white-space: nowrap;
	}
	.example-desc {
		font-size: 11px;
		color: #f97316;
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		opacity: 0.7;
	}
	.example-chip:hover .example-desc {
		opacity: 1;
	}
	.example-chip.selected .example-desc {
		opacity: 1;
	}

	/* Code Terminal (takes all remaining space) */
	.code-term-wrapper {
		flex: 1;
		width: 100%;
		box-sizing: border-box;
		position: relative;
	}
	.code-term-wrapper :global(.xterm) {
		padding: 12px;
		height: 100%;
	}
	.code-term-wrapper :global(.xterm-viewport) {
		background-color: #000 !important;
		overflow-y: auto !important;
	}
	.code-term-wrapper :global(.xterm-viewport::-webkit-scrollbar) {
		width: 6px;
	}
	.code-term-wrapper :global(.xterm-viewport::-webkit-scrollbar-track) {
		background: #000;
	}
	.code-term-wrapper :global(.xterm-viewport::-webkit-scrollbar-thumb) {
		background: #f97316;
		border-radius: 3px;
	}
	.code-term-wrapper :global(.xterm-char-measure-element),
	.code-term-wrapper :global(.xterm-helpers),
	.code-term-wrapper :global(.xterm-helper-textarea),
	.code-term-wrapper :global(span),
	.code-term-wrapper :global(canvas) {
		font-family: courier-new, courier, monospace !important;
	}
</style>
