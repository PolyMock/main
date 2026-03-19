<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet" />
</svelte:head>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { BacktestResult } from '$lib/backtesting/types';

	let { backtestResult }: { backtestResult: BacktestResult } = $props();

	let xtermContainer: HTMLDivElement;
	let xtermInstance: any = $state(null);
	let xtermInitialized = $state(false);

	const O = '\x1b[38;5;208m'; // orange
	const G = '\x1b[32m'; // green
	const RED = '\x1b[31m'; // red
	const R = '\x1b[0m'; // reset
	const DIM = '\x1b[90m'; // dim
	const BOLD = '\x1b[1m'; // bold
	const CYAN = '\x1b[36m'; // cyan
	const YELLOW = '\x1b[33m'; // yellow

	function fmt$(n: number): string {
		const sign = n >= 0 ? '+' : '';
		return `${sign}$${Math.abs(n).toFixed(2)}`;
	}

	function fmtPct(n: number): string {
		const sign = n >= 0 ? '+' : '';
		return `${sign}${n.toFixed(2)}%`;
	}

	function colorVal(n: number, formatted: string): string {
		return n >= 0 ? `${G}${formatted}${R}` : `${RED}${formatted}${R}`;
	}

	function padR(s: string, len: number): string {
		return s.padEnd(len);
	}

	function padL(s: string, len: number): string {
		return s.padStart(len);
	}

	function printMetrics(term: any) {
		const m = backtestResult.metrics;
		const result = backtestResult;

		const line = `${DIM}${'─'.repeat(72)}${R}`;
		const doubleLine = `${O}${'━'.repeat(72)}${R}`;

		term.writeln('');
		term.writeln(doubleLine);
		term.writeln(`${O}  BACKTEST RESULTS${R}`);
		term.writeln(doubleLine);
		term.writeln('');

		// ── Summary ──
		term.writeln(`${BOLD}${CYAN}  SUMMARY${R}`);
		term.writeln(line);
		term.writeln(`  ${DIM}Initial Capital:${R}     ${padL('$' + result.startingCapital.toLocaleString(), 14)}`);
		term.writeln(`  ${DIM}Final Capital:${R}       ${colorVal(result.endingCapital - result.startingCapital, padL('$' + result.endingCapital.toLocaleString(undefined, { minimumFractionDigits: 2 }), 14))}`);
		term.writeln(`  ${DIM}Net P&L:${R}             ${colorVal(m.netPnl, padL(fmt$(m.netPnl), 14))}`);
		term.writeln(`  ${DIM}ROI:${R}                 ${colorVal(m.roi, padL(fmtPct(m.roi), 14))}`);
		term.writeln(`  ${DIM}Execution Time:${R}      ${padL((result.executionTime / 1000).toFixed(2) + 's', 14)}`);
		term.writeln(`  ${DIM}Markets Analyzed:${R}    ${padL(String(result.marketsAnalyzed), 14)}`);
		term.writeln('');

		// ── Trade Stats ──
		term.writeln(`${BOLD}${CYAN}  TRADE STATISTICS${R}`);
		term.writeln(line);
		term.writeln(`  ${DIM}Total Trades:${R}        ${padL(String(m.totalTrades), 14)}`);
		term.writeln(`  ${DIM}Winning:${R}             ${G}${padL(String(m.winningTrades), 14)}${R}`);
		term.writeln(`  ${DIM}Losing:${R}              ${RED}${padL(String(m.losingTrades), 14)}${R}`);
		term.writeln(`  ${DIM}Win Rate:${R}            ${colorVal(m.winRate - 50, padL(m.winRate.toFixed(1) + '%', 14))}`);
		term.writeln(`  ${DIM}Profit Factor:${R}       ${padL(m.profitFactor === Infinity ? '∞' : m.profitFactor.toFixed(2), 14)}`);
		term.writeln(`  ${DIM}Expectancy:${R}          ${colorVal(m.expectancy, padL(fmt$(m.expectancy), 14))}`);
		term.writeln('');

		// ── Win/Loss ──
		term.writeln(`${BOLD}${CYAN}  WIN / LOSS ANALYSIS${R}`);
		term.writeln(line);
		term.writeln(`  ${DIM}Average Win:${R}         ${G}${padL(fmt$(m.avgWin), 14)}${R}`);
		term.writeln(`  ${DIM}Average Loss:${R}        ${RED}${padL(fmt$(Math.abs(m.avgLoss)), 14)}${R}`);
		term.writeln(`  ${DIM}Best Trade:${R}          ${G}${padL(fmt$(m.bestTrade), 14)}${R}`);
		term.writeln(`  ${DIM}Worst Trade:${R}         ${RED}${padL(fmt$(m.worstTrade), 14)}${R}`);
		term.writeln(`  ${DIM}Median Win:${R}          ${G}${padL(fmt$(m.medianWin), 14)}${R}`);
		term.writeln(`  ${DIM}Median Loss:${R}         ${RED}${padL(fmt$(Math.abs(m.medianLoss)), 14)}${R}`);
		term.writeln('');

		// ── Risk Metrics ──
		term.writeln(`${BOLD}${CYAN}  RISK METRICS${R}`);
		term.writeln(line);
		term.writeln(`  ${DIM}Max Drawdown:${R}        ${RED}${padL('$' + m.maxDrawdown.toFixed(2), 14)}${R}`);
		term.writeln(`  ${DIM}Max Drawdown %:${R}      ${RED}${padL(m.maxDrawdownPercentage.toFixed(2) + '%', 14)}${R}`);
		term.writeln(`  ${DIM}Sharpe Ratio:${R}        ${padL(m.sharpeRatio.toFixed(2), 14)}`);
		term.writeln(`  ${DIM}Volatility:${R}          ${padL(m.volatility.toFixed(4), 14)}`);
		term.writeln(`  ${DIM}Capital Utilization:${R} ${padL(m.capitalUtilization.toFixed(1) + '%', 14)}`);
		term.writeln('');

		// ── Time Metrics ──
		term.writeln(`${BOLD}${CYAN}  TIME METRICS${R}`);
		term.writeln(line);
		term.writeln(`  ${DIM}Avg Hold Time:${R}       ${padL(m.avgHoldTime.toFixed(1) + 'h (' + (m.avgHoldTime / 24).toFixed(1) + 'd)', 20)}`);
		term.writeln(`  ${DIM}Median Hold Time:${R}    ${padL(m.medianHoldTime.toFixed(1) + 'h', 14)}`);
		term.writeln(`  ${DIM}Longest Win Streak:${R}  ${G}${padL(String(m.longestWinStreak), 14)}${R}`);
		term.writeln(`  ${DIM}Longest Loss Streak:${R} ${RED}${padL(String(m.longestLossStreak), 14)}${R}`);
		term.writeln('');

		// ── Side Performance ──
		term.writeln(`${BOLD}${CYAN}  SIDE PERFORMANCE${R}`);
		term.writeln(line);
		const yp = m.yesPerformance;
		const np = m.noPerformance;
		term.writeln(`  ${DIM}         ${padR('YES', 20)} ${padR('NO', 20)}${R}`);
		term.writeln(`  ${DIM}Trades:  ${R}${G}${padR(String(yp.count), 20)}${R}${RED}${padR(String(np.count), 20)}${R}`);
		term.writeln(`  ${DIM}Win %:   ${R}${padR(yp.winRate.toFixed(1) + '%', 20)}${padR(np.winRate.toFixed(1) + '%', 20)}`);
		term.writeln(`  ${DIM}P&L:     ${R}${colorVal(yp.pnl, padR(fmt$(yp.pnl), 20))}${colorVal(np.pnl, padR(fmt$(np.pnl), 20))}`);
		term.writeln(`  ${DIM}Avg Win: ${R}${G}${padR(fmt$(yp.avgWin), 20)}${R}${G}${padR(fmt$(np.avgWin), 20)}${R}`);
		term.writeln(`  ${DIM}Avg Loss:${R}${RED}${padR(fmt$(Math.abs(yp.avgLoss)), 20)}${R}${RED}${padR(fmt$(Math.abs(np.avgLoss)), 20)}${R}`);
		term.writeln('');

		// ── Exit Reasons ──
		const er = m.exitReasonDistribution;
		const exitTotal = m.totalTrades || 1;
		term.writeln(`${BOLD}${CYAN}  EXIT REASON DISTRIBUTION${R}`);
		term.writeln(line);
		const reasons = [
			{ name: 'Resolution', count: er.resolution },
			{ name: 'Stop Loss', count: er.stopLoss },
			{ name: 'Take Profit', count: er.takeProfit },
			{ name: 'Max Hold Time', count: er.maxHoldTime },
			{ name: 'Trailing Stop', count: er.trailingStop },
			{ name: 'Partial Exits', count: er.partialExits },
		].filter(r => r.count > 0);

		for (const r of reasons) {
			const pct = ((r.count / exitTotal) * 100).toFixed(1);
			const bar = '█'.repeat(Math.max(1, Math.round((r.count / exitTotal) * 30)));
			term.writeln(`  ${DIM}${padR(r.name + ':', 18)}${R} ${O}${bar}${R} ${r.count} (${pct}%)`);
		}
		if (reasons.length === 0) {
			term.writeln(`  ${DIM}No exit data available${R}`);
		}
		term.writeln('');

		// ── Top Trades ──
		const topTrades = [...backtestResult.trades].sort((a, b) => b.pnl - a.pnl).slice(0, 5);
		const worstTrades = [...backtestResult.trades].sort((a, b) => a.pnl - b.pnl).slice(0, 5);

		if (topTrades.length > 0) {
			term.writeln(`${BOLD}${CYAN}  TOP 5 TRADES${R}`);
			term.writeln(line);
			for (const t of topTrades) {
				const name = (t.marketName || '').slice(0, 35).padEnd(37);
				term.writeln(`  ${G}${fmt$(t.pnl).padStart(10)}${R}  ${t.side.padEnd(4)} ${DIM}${name}${R}`);
			}
			term.writeln('');
		}

		if (worstTrades.length > 0 && worstTrades[0].pnl < 0) {
			term.writeln(`${BOLD}${CYAN}  WORST 5 TRADES${R}`);
			term.writeln(line);
			for (const t of worstTrades) {
				if (t.pnl >= 0) break;
				const name = (t.marketName || '').slice(0, 35).padEnd(37);
				term.writeln(`  ${RED}${fmt$(t.pnl).padStart(10)}${R}  ${t.side.padEnd(4)} ${DIM}${name}${R}`);
			}
			term.writeln('');
		}

		term.writeln(doubleLine);
		term.writeln(`${DIM}  Type ${O}trades${R}${DIM} to list all trades, ${O}export${R}${DIM} for options, ${O}clear${R}${DIM} to reset${R}`);
		term.writeln('');
		term.write(`${O}❯${R} `);
	}

	function printAllTrades(term: any) {
		const trades = [...backtestResult.trades].sort((a, b) =>
			new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime()
		);

		term.writeln('');
		term.writeln(`${O}━━━ ALL TRADES (${trades.length}) ━━━${R}`);
		term.writeln('');

		const header = `  ${DIM}${padR('#', 4)} ${padR('SIDE', 5)} ${padR('ENTRY', 12)} ${padR('EXIT', 12)} ${padR('ENTRY$', 8)} ${padR('EXIT$', 8)} ${padR('P&L', 12)} ${padR('P&L%', 10)} ${padR('MARKET', 30)}${R}`;
		term.writeln(header);
		term.writeln(`  ${DIM}${'─'.repeat(100)}${R}`);

		trades.forEach((t, i) => {
			const entryDate = new Date(t.entryTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
			const exitDate = t.exitTime ? new Date(t.exitTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
			const pnlColor = t.pnl >= 0 ? G : RED;
			const name = (t.marketName || '').slice(0, 28);

			term.writeln(`  ${padR(String(i + 1), 4)} ${padR(t.side, 5)} ${padR(entryDate, 12)} ${padR(exitDate, 12)} ${padR('$' + t.entryPrice.toFixed(3), 8)} ${padR('$' + t.exitPrice.toFixed(3), 8)} ${pnlColor}${padR(fmt$(t.pnl), 12)}${R} ${pnlColor}${padR(fmtPct(t.pnlPercentage), 10)}${R} ${DIM}${name}${R}`);
		});

		term.writeln('');
		term.write(`${O}❯${R} `);
	}

	let currentInputLine = '';

	async function initXterm() {
		if (xtermInitialized || !xtermContainer) return;
		xtermInitialized = true;

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
		term.open(xtermContainer);
		fitAddon.fit();
		xtermInstance = term;

		const resizeObserver = new ResizeObserver(() => fitAddon.fit());
		resizeObserver.observe(xtermContainer);

		await new Promise(r => setTimeout(r, 100));
		fitAddon.fit();

		// Input handling
		term.onData((data: string) => {
			const code = data.charCodeAt(0);
			if (data === '\r') {
				term.write('\r\n');
				handleInput(term, currentInputLine.trim().toLowerCase());
				currentInputLine = '';
			} else if (data === '\x7f') {
				if (currentInputLine.length > 0) {
					currentInputLine = currentInputLine.slice(0, -1);
					term.write('\b \b');
				}
			} else if (code >= 32) {
				currentInputLine += data;
				term.write(data);
			}
		});

		// Print metrics
		printMetrics(term);
	}

	function handleInput(term: any, input: string) {
		if (input === 'trades' || input === 'trade' || input === 'list') {
			printAllTrades(term);
		} else if (input === 'clear') {
			term.clear();
			term.write(`${O}❯${R} `);
		} else if (input === 'metrics' || input === 'summary') {
			printMetrics(term);
		} else if (input === 'export') {
			term.writeln('');
			term.writeln(`${O}Export options:${R}`);
			term.writeln(`  ${O}json${R}   — Download backtest results as JSON`);
			term.writeln(`  ${O}csv${R}    — Download trade log as CSV`);
			term.writeln('');
			term.write(`${O}❯${R} `);
		} else if (input === 'json') {
			exportJSON();
			term.writeln(`${G}✓ JSON exported${R}`);
			term.write(`\r\n${O}❯${R} `);
		} else if (input === 'csv') {
			exportCSV();
			term.writeln(`${G}✓ CSV exported${R}`);
			term.write(`\r\n${O}❯${R} `);
		} else if (input === 'help') {
			term.writeln('');
			term.writeln(`${O}Commands:${R}`);
			term.writeln(`  ${O}metrics${R}  — Show full metrics summary`);
			term.writeln(`  ${O}trades${R}   — List all trades`);
			term.writeln(`  ${O}export${R}   — Export options`);
			term.writeln(`  ${O}json${R}     — Export results as JSON`);
			term.writeln(`  ${O}csv${R}      — Export trades as CSV`);
			term.writeln(`  ${O}clear${R}    — Clear terminal`);
			term.writeln('');
			term.write(`${O}❯${R} `);
		} else if (input !== '') {
			term.writeln(`${DIM}Unknown command. Type ${O}help${R}${DIM} for available commands.${R}`);
			term.write(`${O}❯${R} `);
		} else {
			term.write(`${O}❯${R} `);
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

	function exportCSV() {
		const headers = ['#', 'Market', 'Side', 'Entry Time', 'Exit Time', 'Entry Price', 'Exit Price', 'Amount', 'Shares', 'P&L', 'P&L %', 'Exit Reason', 'Duration (h)'];
		const rows = backtestResult.trades.map((t, i) => [
			i + 1,
			`"${t.marketName}"`,
			t.side,
			new Date(t.entryTime).toISOString(),
			t.exitTime ? new Date(t.exitTime).toISOString() : '',
			t.entryPrice.toFixed(4),
			t.exitPrice.toFixed(4),
			t.amountInvested.toFixed(2),
			t.shares.toFixed(4),
			t.pnl.toFixed(2),
			t.pnlPercentage.toFixed(2),
			t.exitReason || '',
			t.holdingDuration?.toFixed(1) || '',
		]);
		downloadFile(
			[headers.join(','), ...rows.map(r => r.join(','))].join('\n'),
			`backtest_trades_${new Date().toISOString().slice(0, 10)}.csv`,
			'text/csv'
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

	onMount(() => {
		if (browser) {
			setTimeout(() => initXterm(), 150);
		}
	});

	onDestroy(() => {
		if (xtermInstance) {
			xtermInstance.dispose();
			xtermInstance = null;
		}
	});
</script>

<div class="terminal-panel">
	<div class="terminal-wrapper" bind:this={xtermContainer}></div>
</div>

<style>
	.terminal-panel {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.terminal-wrapper {
		flex: 1;
		min-height: 0;
		width: 100%;
		border: 1px solid #1a1a1a;
		box-sizing: border-box;
		position: relative;
		overflow: hidden;
	}

	.terminal-wrapper :global(.xterm) {
		padding: 12px;
		height: 100%;
	}

	.terminal-wrapper :global(.xterm-viewport) {
		background-color: #000000 !important;
	}

	.terminal-wrapper :global(.xterm-viewport::-webkit-scrollbar) {
		width: 6px;
	}

	.terminal-wrapper :global(.xterm-viewport::-webkit-scrollbar-track) {
		background: #000;
	}

	.terminal-wrapper :global(.xterm-viewport::-webkit-scrollbar-thumb) {
		background: #f97316;
		border-radius: 3px;
	}
</style>
