<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet" />
</svelte:head>

<script lang="ts">
	import { onDestroy } from 'svelte';
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
		selectedMarkets = [],
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
		selectedMarkets?: any[];
		onEditConfig: () => void;
		onRunBacktest: (strategyCode: string, strategyType: string | null, strategyParams?: Record<string, unknown>) => void | Promise<void>;
	} = $props();

	// Strategy execution params (configurable via terminal)
	let initialCash = $state(10000);
	let reimburseOpenPositions = $state(false);
	let priceInf: number | null = $state(null);
	let priceSup: number | null = $state(null);

	// Strategy-specific params
	let thresholdLow = $state(0.30);
	let amount = $state(10);

	// Exit rules
	let stopLoss: number | null = $state(null);      // e.g. 0.20 = 20%
	let takeProfit: number | null = $state(null);     // e.g. 0.50 = 50%
	let trailingStop: number | null = $state(null);   // e.g. 0.10 = 10%
	let maxHoldHours: number | null = $state(null);   // e.g. 168 = 7 days

	/** Parse a number that may use comma as decimal separator */
	function parseNum(s: string): number {
		return parseFloat(s.replace(',', '.'));
	}

	// Terminal color constants
	const O = '\x1b[38;5;208m'; // orange
	const G = '\x1b[32m';       // green
	const R = '\x1b[0m';        // reset
	const DIM = '\x1b[90m';     // dim/gray
	const W = '\x1b[97m';       // bright white
	const CYAN = '\x1b[36m';    // cyan for code keywords

	let selectedStrategy: number | null = $state(0); // Auto-select Mean Reversion

	// Strategies matching the real backtest_engine Rust strategies
	const strategies = [
		{
			id: 'mean_reversion',
			name: 'Mean Reversion',
			description: 'Buy when price drops below threshold, betting on reversion to the mean. Fixed position size.',
			logic: 'If price ≤ threshold → BUY fixed amount, else HOLD',
			uses: ['trade.price', 'trade.position'],
			tags: ['simple', 'price-based'],
			code: `def mean_reversion(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    amount = 10
    if trade.get("price") <= threshold_low:
        market_id = trade.get("market_id")
        position = trade.get("position")
    else:
        market_id = trade.get("market_id")
        position = "hold"
    return {"market_id": market_id, "position": position, "amount": amount}`,
		},
		{
			id: 'mean_reversion_with_portfolio_positions',
			name: 'No Duplicates',
			description: 'Skip markets where you already hold a position. Diversifies across markets.',
			logic: 'If price ≤ threshold AND not already holding → BUY, else HOLD',
			uses: ['trade.price', 'portfolio.positions'],
			tags: ['diversification', 'portfolio-aware'],
			code: `def mean_reversion_with_portfolio_positions(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    if trade.get("price") <= threshold_low:
        market_id = trade.get("market_id")
        position = trade.get("position")
        if (market_id, position) in portfolio["positions"]:
            position = "hold"
            amount = 0
        else:
            amount = 10
    else:
        market_id = trade.get("market_id")
        position = "hold"
        amount = 0
    return {"market_id": market_id, "position": position, "amount": amount}`,
		},
		{
			id: 'mean_reversion_with_trade_log',
			name: 'Better Price',
			description: 'Only buy if the current price is lower than the minimum price you previously paid on this market.',
			logic: 'If price ≤ threshold AND price < min(past prices) → BUY',
			uses: ['trade.price', 'trade_log'],
			tags: ['price improvement', 'trade-log'],
			code: `def mean_reversion_with_trade_log(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    if trade.get("price") <= threshold_low:
        market_id = trade.get("market_id")
        position = trade.get("position")
        trades_on_market = [t for t in trade_log if t["market_id"] == market_id and t["position"] == position]
        if len(trades_on_market) > 0:
            min_price = min(int(t["cost"])/int(t["amount"]) for t in trades_on_market)
            if trade.get("price") < min_price:
                amount = 10
            else:
                position = "hold"
                amount = 0
        else:
            amount = 10
    else:
        market_id = trade.get("market_id")
        position = "hold"
        amount = 0
    return {"market_id": market_id, "position": position, "amount": amount}`,
		},
		{
			id: 'mean_reversion_with_trade_log_time',
			name: 'Cooldown',
			description: 'Enforce a 1-day cooldown between trades on the same market/position. Prevents overtrading.',
			logic: 'If price ≤ threshold AND >1 day since last trade on same market → BUY',
			uses: ['trade.price', 'trade.timestamp', 'trade_log'],
			tags: ['time-based', 'rate-limiting'],
			code: `def mean_reversion_with_trade_log_time(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    if trade.get("price") <= threshold_low:
        market_id = trade.get("market_id")
        position = trade.get("position")
        trades_on_market = [t for t in trade_log if t["market_id"] == market_id and t["position"] == position]
        if len(trades_on_market) > 0:
            from datetime import timedelta
            latest = max(t["time"] for t in trades_on_market)
            if trade.get("timestamp") - latest > timedelta(days=1):
                amount = 10
            else:
                position = "hold"
                amount = 0
        else:
            amount = 10
    else:
        market_id = trade.get("market_id")
        position = "hold"
        amount = 0
    return {"market_id": market_id, "position": position, "amount": amount}`,
		},
		{
			id: 'mean_reversion_with_user_perso_parameter_internal',
			name: 'Scaled Entry',
			description: 'Amount scales with trade count on a market (up to your set amount). Starts small, builds conviction.',
			logic: 'If price ≤ threshold → BUY min(amount, trade_count) shares',
			uses: ['trade.price', 'user_perso_parameters'],
			tags: ['adaptive', 'custom-state'],
			code: `def mean_reversion_with_user_perso_parameter_internal(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    amount = 10
    if "trade_count" not in user_perso_parameters:
        user_perso_parameters["trade_count"] = {}
    if trade.get("market_id") not in user_perso_parameters["trade_count"]:
        user_perso_parameters["trade_count"][trade.get("market_id")] = 0
    user_perso_parameters["trade_count"][trade.get("market_id")] += 1
    if trade.get("price") <= threshold_low:
        market_id = trade.get("market_id")
        position = trade.get("position")
        amount = min(amount, user_perso_parameters["trade_count"][market_id])
    else:
        market_id = trade.get("market_id")
        position = "hold"
        amount = 0
    return {"market_id": market_id, "position": position, "amount": amount, "user_perso_parameters": user_perso_parameters}`,
		},
	];

	function selectStrategy(idx: number) {
		selectedStrategy = idx;
		if (termInstance) {
			termInstance.clear();
			showTerminalView(termInstance);
		}
	}

	function showTerminalView(term: any) {
		if (selectedStrategy === null) return;
		const s = strategies[selectedStrategy];

		// Strategy header
		term.writeln('');
		term.writeln(`  ${O}STRATEGY${R}  ${W}${s.name}${R}  ${DIM}${s.description}${R}`);
		term.writeln('');

		// Code block with syntax highlighting (single-pass to avoid escape code corruption)
		term.writeln(`  ${DIM}┌─ strategy code ──────────────────────────────────────────┐${R}`);
		const code = s.code
			.replace(/threshold_low = [\d.]+/, `threshold_low = ${thresholdLow}`)
			.replace(/amount = 10(?!\d)/, `amount = ${amount}`);
		for (const line of code.split('\n')) {
			const highlighted = line.replace(
				/\b(def|if|else|return|import|for|in|not|from)\b|(threshold_low|amount|market_id|position)(?=\s*=)|(".*?")|(\b\d+\.?\d*\b)/g,
				(m, kw, param, str, num) => {
					if (kw) return `${CYAN}${kw}${R}`;
					if (param) return `${O}${param}${R}`;
					if (str) return `${G}${str}${R}`;
					if (num) return `${O}${num}${R}`;
					return m;
				}
			);
			term.writeln(`  ${DIM}│${R}  ${highlighted}`);
		}
		term.writeln(`  ${DIM}└──────────────────────────────────────────────────────────┘${R}`);
		term.writeln('');

		// Compact params table
		const fmtVal = (v: any, unit = '') => v != null ? `${O}${v}${unit}${R}` : `${DIM}off${R}`;
		const slStr = stopLoss != null ? `${(stopLoss * 100).toFixed(0)}%` : null;
		const tpStr = takeProfit != null ? `${(takeProfit * 100).toFixed(0)}%` : null;
		const trStr = trailingStop != null ? `${(trailingStop * 100).toFixed(0)}%` : null;
		const mhStr = maxHoldHours != null ? `${maxHoldHours}h` : null;

		term.writeln(`  ${DIM}┌─ parameters ─────────────────┬─ exit rules ──────────────┐${R}`);
		term.writeln(`  ${DIM}│${R}  ${G}cash${R}       ${O}$${initialCash.toLocaleString().padEnd(12)}${R}  ${DIM}│${R}  ${G}stoploss${R}    ${fmtVal(slStr).padEnd(16)}  ${DIM}│${R}`);
		term.writeln(`  ${DIM}│${R}  ${G}threshold${R}  ${O}${String(thresholdLow).padEnd(13)}${R}  ${DIM}│${R}  ${G}takeprofit${R}  ${fmtVal(tpStr).padEnd(16)}  ${DIM}│${R}`);
		term.writeln(`  ${DIM}│${R}  ${G}amount${R}     ${O}${String(amount).padEnd(13)}${R}  ${DIM}│${R}  ${G}trailing${R}    ${fmtVal(trStr).padEnd(16)}  ${DIM}│${R}`);
		term.writeln(`  ${DIM}│${R}  ${G}reimburse${R}  ${O}${(reimburseOpenPositions ? 'on' : 'off').padEnd(13)}${R}  ${DIM}│${R}  ${G}maxhold${R}     ${fmtVal(mhStr).padEnd(16)}  ${DIM}│${R}`);
		term.writeln(`  ${DIM}└──────────────────────────────┴────────────────────────────┘${R}`);
		term.writeln('');

		// Run hint
		term.writeln(`  ${W}>>>  Type ${G}run${R}${W} to launch  <<<${R}     ${DIM}${O}help${R}${DIM} for all commands${R}`);
		termPrompt(term);
	}

	// Terminal state
	let termContainer: HTMLDivElement;
	let termInitialized = $state(false);
	let termInstance: any = $state(null);
	let inputLine = '';

	function showParams(term: any) {
		const slStr = stopLoss != null ? `${(stopLoss * 100).toFixed(0)}%` : null;
		const tpStr = takeProfit != null ? `${(takeProfit * 100).toFixed(0)}%` : null;
		const trStr = trailingStop != null ? `${(trailingStop * 100).toFixed(0)}%` : null;
		const mhStr = maxHoldHours != null ? `${maxHoldHours}h` : null;
		const fmtVal = (v: any) => v != null ? `${O}${v}${R}` : `${DIM}off${R}`;

		term.writeln(`  ${DIM}┌─ parameters ─────────────────┬─ exit rules ──────────────┐${R}`);
		term.writeln(`  ${DIM}│${R}  ${G}cash${R}       ${O}$${initialCash.toLocaleString().padEnd(12)}${R}  ${DIM}│${R}  ${G}stoploss${R}    ${fmtVal(slStr).padEnd(16)}  ${DIM}│${R}`);
		term.writeln(`  ${DIM}│${R}  ${G}threshold${R}  ${O}${String(thresholdLow).padEnd(13)}${R}  ${DIM}│${R}  ${G}takeprofit${R}  ${fmtVal(tpStr).padEnd(16)}  ${DIM}│${R}`);
		term.writeln(`  ${DIM}│${R}  ${G}amount${R}     ${O}${String(amount).padEnd(13)}${R}  ${DIM}│${R}  ${G}trailing${R}    ${fmtVal(trStr).padEnd(16)}  ${DIM}│${R}`);
		term.writeln(`  ${DIM}│${R}  ${G}reimburse${R}  ${O}${(reimburseOpenPositions ? 'on' : 'off').padEnd(13)}${R}  ${DIM}│${R}  ${G}maxhold${R}     ${fmtVal(mhStr).padEnd(16)}  ${DIM}│${R}`);
		term.writeln(`  ${DIM}│${R}  ${G}price${R}      ${O}${(priceInf ?? '0') + ' → ' + (priceSup ?? '1')}${R}       ${DIM}│${R}                            ${DIM}│${R}`);
		term.writeln(`  ${DIM}└──────────────────────────────┴────────────────────────────┘${R}`);
	}

	function showCode(term: any) {
		if (selectedStrategy === null) return;
		const s = strategies[selectedStrategy];
		term.writeln(`  ${DIM}┌─ ${s.name} ──────────────────────────────────────────────┐${R}`);
		const code = s.code
			.replace(/threshold_low = [\d.]+/, `threshold_low = ${thresholdLow}`)
			.replace(/amount = 10(?!\d)/, `amount = ${amount}`);
		for (const line of code.split('\n')) {
			const highlighted = line.replace(
				/\b(def|if|else|return|import|for|in|not|from)\b|(threshold_low|amount|market_id|position)(?=\s*=)|(".*?")|(\b\d+\.?\d*\b)/g,
				(m, kw, param, str, num) => {
					if (kw) return `${CYAN}${kw}${R}`;
					if (param) return `${O}${param}${R}`;
					if (str) return `${G}${str}${R}`;
					if (num) return `${O}${num}${R}`;
					return m;
				}
			);
			term.writeln(`  ${DIM}│${R}  ${highlighted}`);
		}
		term.writeln(`  ${DIM}└──────────────────────────────────────────────────────────┘${R}`);
	}

	function termPrompt(term: any) {
		term.write(`\r\n${O}❯${R} `);
		term.scrollToBottom();
	}

	function handleInput(term: any, input: string) {
		const trimmed = input.trim().toLowerCase();

		if (trimmed === 'run') {
			if (selectedStrategy === null) {
				term.writeln(`${O}  Select a strategy first by clicking one above.${R}`);
				termPrompt(term);
				return;
			}
			const s = strategies[selectedStrategy];
			term.writeln('');
			term.writeln(`  ${G}━━━ LAUNCHING: ${s.name} ━━━${R}`);
			term.writeln(`  ${DIM}cash=$${initialCash.toLocaleString()}  threshold=${thresholdLow}  amount=${amount}  reimburse=${reimburseOpenPositions ? 'yes' : 'no'}${R}`);
			term.writeln(`  ${DIM}SL=${stopLoss != null ? (stopLoss * 100).toFixed(0) + '%' : 'off'}  TP=${takeProfit != null ? (takeProfit * 100).toFixed(0) + '%' : 'off'}  trailing=${trailingStop != null ? (trailingStop * 100).toFixed(0) + '%' : 'off'}  maxhold=${maxHoldHours != null ? maxHoldHours + 'h' : 'off'}${R}`);
			term.writeln('');
			onRunBacktest(s.code, s.id, {
				initialCash,
				reimburseOpenPositions,
				priceInf,
				priceSup,
				strategyParams: { threshold_low: thresholdLow, amount },
				stopLoss,
				takeProfit,
				trailingStop,
				maxHoldHours,
			});
			return;
		}
		if (trimmed === 'params') {
			term.writeln('');
			showParams(term);
			termPrompt(term);
			return;
		}
		if (trimmed === 'clear') {
			term.clear();
			showTerminalView(term);
			return;
		}
		if (trimmed === 'code') {
			if (selectedStrategy !== null) {
				term.writeln('');
				showCode(term);
			} else {
				term.writeln(`${O}  Select a strategy first.${R}`);
			}
			termPrompt(term);
			return;
		}
		if (trimmed.startsWith('set ')) {
			const parts = input.trim().substring(4).trim().split(/\s+/);
			const key = parts[0].toLowerCase();
			let valid = true;
			if (key === 'cash' && parts[1]) {
				const val = parseNum(parts[1]);
				if (!isNaN(val) && val > 0) {
					initialCash = val;
				} else {
					term.writeln(`  ${O}Invalid. Use: set cash 10000${R}`);
					valid = false;
				}
			} else if (key === 'reimburse') {
				reimburseOpenPositions = parts[1]?.toLowerCase() === 'on' || parts[1]?.toLowerCase() === 'true' || parts[1]?.toLowerCase() === 'yes';
			} else if (key === 'price') {
				const min = parts[1] ? parseNum(parts[1]) : null;
				const max = parts[2] ? parseNum(parts[2]) : null;
				priceInf = min !== null && !isNaN(min) ? min : null;
				priceSup = max !== null && !isNaN(max) ? max : null;
			} else if (key === 'threshold') {
				const val = parts[1] ? parseNum(parts[1]) : NaN;
				if (!isNaN(val) && val >= 0 && val <= 1) {
					thresholdLow = val;
				} else {
					term.writeln(`  ${O}Invalid. Use: set threshold 0.3 (0-1 range)${R}`);
					valid = false;
				}
			} else if (key === 'amount') {
				const val = parts[1] ? parseNum(parts[1]) : NaN;
				if (!isNaN(val) && val > 0) {
					amount = Math.floor(val);
				} else {
					term.writeln(`  ${O}Invalid. Use: set amount 10${R}`);
					valid = false;
				}
			} else if (key === 'stoploss' || key === 'sl') {
				if (parts[1]?.toLowerCase() === 'off') {
					stopLoss = null;
				} else {
					const val = parts[1] ? parseNum(parts[1]) : NaN;
					if (!isNaN(val) && val > 0) {
						stopLoss = val / 100;
					} else {
						term.writeln(`  ${O}Invalid. Use: set stoploss 20 (%) or off${R}`);
						valid = false;
					}
				}
			} else if (key === 'takeprofit' || key === 'tp') {
				if (parts[1]?.toLowerCase() === 'off') {
					takeProfit = null;
				} else {
					const val = parts[1] ? parseNum(parts[1]) : NaN;
					if (!isNaN(val) && val > 0) {
						takeProfit = val / 100;
					} else {
						term.writeln(`  ${O}Invalid. Use: set takeprofit 50 (%) or off${R}`);
						valid = false;
					}
				}
			} else if (key === 'trailing') {
				if (parts[1]?.toLowerCase() === 'off') {
					trailingStop = null;
				} else {
					const val = parts[1] ? parseNum(parts[1]) : NaN;
					if (!isNaN(val) && val > 0) {
						trailingStop = val / 100;
					} else {
						term.writeln(`  ${O}Invalid. Use: set trailing 10 (%) or off${R}`);
						valid = false;
					}
				}
			} else if (key === 'maxhold') {
				if (parts[1]?.toLowerCase() === 'off') {
					maxHoldHours = null;
				} else {
					const val = parts[1] ? parseNum(parts[1]) : NaN;
					if (!isNaN(val) && val > 0) {
						maxHoldHours = val;
					} else {
						term.writeln(`  ${O}Invalid. Use: set maxhold 168 (hours) or off${R}`);
						valid = false;
					}
				}
			} else {
				term.writeln(`  ${O}Unknown: ${key}. Type ${W}help${O} for options.${R}`);
				valid = false;
			}
			if (valid) {
				term.writeln(`  ${G}✓ ${key} updated${R}`);
				term.writeln('');
				showParams(term);
			}
			termPrompt(term);
			return;
		}

		if (trimmed === 'help') {
			term.writeln('');
			term.writeln(`  ${W}COMMANDS${R}`);
			term.writeln(`  ${O}run${R}                        Launch backtest`);
			term.writeln(`  ${O}code${R}                       Show strategy code`);
			term.writeln(`  ${O}params${R}                     Show all parameters`);
			term.writeln(`  ${O}clear${R}                      Reset terminal view`);
			term.writeln('');
			term.writeln(`  ${W}SET PARAMETERS${R}             ${DIM}set <param> <value>${R}`);
			term.writeln(`  ${O}set cash${R} <n>               Initial bankroll`);
			term.writeln(`  ${O}set threshold${R} <0-1>        Buy threshold price`);
			term.writeln(`  ${O}set amount${R} <shares>        Shares per trade`);
			term.writeln(`  ${O}set reimburse${R} on/off       Reimburse open positions`);
			term.writeln(`  ${O}set price${R} <min> <max>      Price range filter`);
			term.writeln('');
			term.writeln(`  ${W}EXIT RULES${R}`);
			term.writeln(`  ${O}set sl${R} <% or off>          Stop loss`);
			term.writeln(`  ${O}set tp${R} <% or off>          Take profit`);
			term.writeln(`  ${O}set trailing${R} <% or off>    Trailing stop`);
			term.writeln(`  ${O}set maxhold${R} <hours or off> Max holding time`);
			termPrompt(term);
			return;
		}

		if (trimmed) {
			term.writeln(`  ${DIM}Unknown command. Type ${O}help${DIM} for options.${R}`);
		}
		termPrompt(term);
	}

	async function initTerm() {
		if (termInitialized || !termContainer) return;
		termInitialized = true;

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
			scrollback: 1000,
		});

		const fitAddon = new FitAddon();
		term.loadAddon(fitAddon);
		term.open(termContainer);
		fitAddon.fit();
		termInstance = term;

		const resizeObserver = new ResizeObserver(() => fitAddon.fit());
		resizeObserver.observe(termContainer);

		await new Promise(r => setTimeout(r, 150));
		fitAddon.fit();

		// Show strategy code + params immediately
		showTerminalView(term);

		term.onData((data: string) => {
			const code = data.charCodeAt(0);
			if (data === '\r') {
				term.write('\r\n');
				handleInput(term, inputLine);
				inputLine = '';
			} else if (data === '\x7f') {
				if (inputLine.length > 0) {
					inputLine = inputLine.slice(0, -1);
					term.write('\b \b');
				}
			} else if (code >= 32) {
				inputLine += data;
				term.write(data);
			}
		});
	}

	$effect(() => {
		if (browser && termContainer) {
			if (termInstance && !termContainer.querySelector('.xterm')) {
				termInstance = null;
				termInitialized = false;
			}
			setTimeout(() => initTerm(), 100);
		}
	});

	onDestroy(() => {
		if (termInstance) {
			termInstance.dispose();
			termInstance = null;
			termInitialized = false;
		}
	});
</script>

<div class="strategy-page">
	<!-- TOP: Dataset summary bar + edit config -->
	<div class="data-bar">
		<div class="data-left">
			<span class="cbl">DATASET</span>
			<span class="data-tag"><span class="dtl">SOURCE</span> Synthesis API</span>
			<span class="data-tag"><span class="dtl">MARKETS</span> {selectedMarkets.length}</span>
			<span class="data-tag"><span class="dtl">PLATFORM</span> Polymarket</span>
			<span class="data-tag"><span class="dtl">TIME</span> {useTimePeriod ? `${timestampStartStr} → ${timestampEndStr}` : 'All time'}</span>
			{#if filterCategories.size > 0}<span class="data-tag"><span class="dtl">CATEGORY</span> {Array.from(filterCategories).join(', ')}</span>{/if}
		</div>
		<button class="edit-btn" onclick={() => onEditConfig()}>EDIT CONFIG</button>
	</div>

	<!-- MIDDLE: Strategy cards -->
	<div class="strategies-section">
		<div class="strategies-label">SELECT STRATEGY</div>
		<div class="strategies-grid">
			{#each strategies as s, i}
				<button
					class="strategy-card"
					class:selected={selectedStrategy === i}
					onclick={() => selectStrategy(i)}
				>
					<div class="sc-header">
						<span class="sc-num">{i + 1}</span>
						<span class="sc-name">{s.name}</span>
						{#if selectedStrategy === i}
							<span class="sc-active">ACTIVE</span>
						{/if}
					</div>
					<p class="sc-desc">{s.description}</p>
				</button>
			{/each}
		</div>
	</div>

	<!-- BOTTOM: Terminal -->
	<div class="term-wrapper" bind:this={termContainer}></div>
</div>

<style>
	.strategy-page {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: #000;
	}

	/* ── Data Bar ── */
	.data-bar {
		flex-shrink: 0;
		border-bottom: 1px solid #222;
		background: #000;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 16px;
		gap: 12px;
	}
	.data-left {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		min-width: 0;
	}
	.cbl { color: #f97316; font-weight: 700; font-size: 11px; letter-spacing: 1px; flex-shrink: 0; }
	.data-tag {
		display: inline-flex; align-items: center; gap: 4px;
		font-family: monospace; font-size: 11px; color: #aaa;
		background: #111; padding: 2px 8px; border-radius: 3px; border: 1px solid #222;
		white-space: nowrap;
	}
	.dtl { color: #f97316; font-weight: 700; font-size: 9px; letter-spacing: 0.5px; }
	.edit-btn {
		flex-shrink: 0;
		background: transparent; border: 1px solid #f97316; color: #f97316;
		padding: 6px 16px; font-family: 'Share Tech Mono', monospace; font-size: 11px;
		cursor: pointer; border-radius: 4px; letter-spacing: 1px; font-weight: 700;
		transition: all 0.15s;
	}
	.edit-btn:hover { background: #f97316; color: #000; }

	/* ── Strategy Cards ── */
	.strategies-section {
		flex-shrink: 0;
		overflow-x: auto;
		overflow-y: hidden;
		border-bottom: 1px solid #f97316;
		background: #000;
		padding: 10px 16px 12px;
	}
	.strategies-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 10px;
		font-weight: 700;
		color: #f97316;
		letter-spacing: 2px;
		margin-bottom: 8px;
		padding-left: 2px;
	}
	.strategies-grid {
		display: flex;
		gap: 8px;
		min-width: min-content;
	}
	.strategy-card {
		flex: 0 0 185px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 12px;
		background: #0a0a0a;
		border: 1px solid #222;
		border-radius: 6px;
		color: #ccc;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s;
	}
	.strategy-card:hover {
		border-color: #f97316;
		background: #111;
	}
	.strategy-card.selected {
		border-color: #f97316;
		background: #1a0d00;
		box-shadow: 0 0 12px rgba(249, 115, 22, 0.15), inset 0 0 20px rgba(249, 115, 22, 0.03);
	}
	.sc-header {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.sc-num {
		font-family: 'Share Tech Mono', monospace;
		font-size: 10px;
		font-weight: 700;
		color: #555;
		background: #1a1a1a;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		flex-shrink: 0;
	}
	.strategy-card:hover .sc-num { color: #f97316; background: #1a0d00; }
	.strategy-card.selected .sc-num { color: #000; background: #f97316; }
	.sc-name {
		font-family: 'Share Tech Mono', monospace;
		font-size: 12px;
		font-weight: 700;
		color: #fff;
		letter-spacing: 0.3px;
		flex: 1;
	}
	.strategy-card.selected .sc-name { color: #f97316; }
	.sc-active {
		font-size: 7px;
		font-weight: 700;
		color: #f97316;
		background: rgba(249, 115, 22, 0.2);
		padding: 2px 5px;
		border-radius: 3px;
		letter-spacing: 1px;
		flex-shrink: 0;
	}
	.sc-desc {
		font-size: 11px;
		color: #888;
		line-height: 1.4;
		margin: 0;
	}
	.strategy-card.selected .sc-desc { color: #bbb; }

	/* ── Terminal ── */
	.term-wrapper {
		flex: 1;
		min-height: 180px;
		width: 100%;
		box-sizing: border-box;
		position: relative;
	}
	.term-wrapper :global(.xterm) { padding: 8px 12px; height: 100%; }
	.term-wrapper :global(.xterm-viewport) { background-color: #000 !important; overflow-y: auto !important; }
	.term-wrapper :global(.xterm-viewport::-webkit-scrollbar) { width: 6px; }
	.term-wrapper :global(.xterm-viewport::-webkit-scrollbar-track) { background: #000; }
	.term-wrapper :global(.xterm-viewport::-webkit-scrollbar-thumb) { background: #f97316; border-radius: 3px; }
</style>
