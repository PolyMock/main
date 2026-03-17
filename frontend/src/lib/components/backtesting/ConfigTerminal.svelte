<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	type WizardStep = 'intro' | 'data_source' | 'time_period' | 'start_date' | 'end_date' | 'title' | 'volume_min' | 'volume_max' | 'category' | 'outcomes' | 'review' | 'done';

	interface EngineConfig {
		data_source: 'synthesis' | 'parquet';
		platform: string[];
		timestamp_start: string | null;
		timestamp_end: string | null;
		market_title: string[] | null;
		volume_inf: number | null;
		volume_sup: number | null;
		market_category: string[] | null;
		position: string[] | null;
		possible_outcomes: string[] | null;
		price_inf: number | null;
		price_sup: number | null;
		amount_inf: number | null;
		amount_sup: number | null;
	}

	interface ConfigCompletePayload {
		config: EngineConfig;
		dataSource: 'synthesis' | 'parquet';
		useTimePeriod: boolean;
		timestampStartStr: string;
		timestampEndStr: string;
		filterTitleSearch: string;
		filterVolumeInf: number | null;
		filterVolumeSup: number | null;
		filterCategories: Set<string>;
		filterOutcomesSearch: string;
	}

	let { onConfigComplete }: { onConfigComplete?: (payload: ConfigCompletePayload) => void } = $props();

	// Wizard state
	let wizardStep: WizardStep = $state('intro');
	let dataSource: 'synthesis' | 'parquet' = $state('synthesis');
	let currentInputLine = $state('');

	// Filter state
	let useTimePeriod = $state(false);
	let timestampStartStr = $state('');
	let timestampEndStr = $state('');
	let filterPlatform: Set<string> = $state(new Set(['polymarket']));
	let filterTitleSearch = $state('');
	let filterVolumeInf: number | null = $state(null);
	let filterVolumeSup: number | null = $state(null);
	let filterCategories: Set<string> = $state(new Set());
	let filterOutcomesSearch = $state('');
	let filterPriceInf: number | null = $state(null);
	let filterPriceSup: number | null = $state(null);
	let filterAmountInf: number | null = $state(null);
	let filterAmountSup: number | null = $state(null);
	let filterPosition: Set<string> = $state(new Set());

	const availableCategories = [
		'crypto', 'culture', 'economy', 'elections', 'finance',
		'geopolitics', 'politic', 'sport', 'tech', 'world'
	];

	// Xterm state
	let xtermContainer: HTMLDivElement | undefined = $state();
	let xtermInitialized = $state(false);
	let xtermInstance: any = $state(null);

	// Terminal color constants
	const O = '\x1b[38;5;208m'; // orange
	const G = '\x1b[32m'; // green
	const R = '\x1b[0m'; // reset
	const DIM = '\x1b[90m'; // dim/gray

	const introLines = [
		'',
		'\x1b[38;5;208m ___  ___  ________  ________  ___  ___  ________ ________     ___    ___    ___       ________  ________  ________\x1b[0m',
		'\x1b[38;5;208m|\\  \\|\\  \\|\\   __  \\|\\   ____\\|\\  \\|\\  \\|\\  _____\\\\   __  \\   |\\  \\  /  /|  |\\  \\     |\\   __  \\|\\   __  \\|\\   ____\\\x1b[0m',
		'\x1b[38;5;208m\\ \\  \\\\\\  \\ \\  \\|\\  \\ \\  \\___|\\ \\  \\\\\\  \\ \\  \\__/\\ \\  \\|\\  \\  \\ \\  \\/  / /  \\ \\  \\    \\ \\  \\|\\  \\ \\  \\|\\ /\\ \\  \\___|_\x1b[0m',
		'\x1b[38;5;208m \\ \\   __  \\ \\   __  \\ \\_____  \\ \\   __  \\ \\   __\\\\ \\  \\\\\\  \\  \\ \\    / /    \\ \\  \\    \\ \\   __  \\ \\   __  \\ \\_____  \\\x1b[0m',
		'\x1b[38;5;208m  \\ \\  \\ \\  \\ \\  \\ \\  \\|____|\\  \\ \\  \\ \\  \\ \\  \\_| \\ \\  \\\\\\  \\  /     \\/      \\ \\  \\____\\ \\  \\ \\  \\ \\  \\|\\  \\|____|\\  \\\x1b[0m',
		'\x1b[38;5;208m   \\ \\__\\ \\__\\ \\__\\ \\__\\____\\_\\  \\ \\__\\ \\__\\ \\__\\   \\ \\_______\\/  /\\   \\      \\ \\_______\\ \\__\\ \\__\\ \\_______\\____\\_\\  \\\x1b[0m',
		'\x1b[38;5;208m    \\|__|\\|__|\\|__|\\|__|\\_________\\|__|\\|__|\\|__|    \\|_______/__/ /\\ __\\      \\|_______|\\|__|\\|__|\\|_______|\\_________\\\x1b[0m',
		'\x1b[38;5;208m                       \\|_________|                           |__|/ \\|__|                                  \\|_________|\x1b[0m',
		'',
		'',
		'BACKTEST ENGINE v2.0',
		'',
		'──────────────────────────────────────────────',
		'',
		'Initializing engine...',
		'Loading Polymarket dataset ............ \x1b[32m404M+ trades\x1b[0m',
		'Connecting to Synthesis Trade API ..... \x1b[32mconnected\x1b[0m',
		'',
		'\x1b[32m✓ Parquet dataset ready         (local pre-downloaded trades)\x1b[0m',
		'\x1b[32m✓ Synthesis API ready            (live historical trades & OHLC candles)\x1b[0m',
		'\x1b[32mAll systems operational.\x1b[0m',
		'',
		'──────────────────────────────────────────────',
		'',
		'The backtest engine replays historical prediction market trades through your custom strategy.',
		'Each trade is evaluated chronologically — your strategy decides whether to buy, hold, or skip based on real market conditions and price data.',
		'',
		'Platform: Polymarket',
		'',
		'\x1b[32mReady.\x1b[0m Type \x1b[38;5;208mgo\x1b[0m to start.',
	];

	// Helper functions
	function formatDateForInput(date: Date): string {
		return date.toISOString().split('T')[0];
	}

	function parseDateFromInput(dateStr: string): Date {
		return new Date(dateStr + 'T00:00:00');
	}

	// Compute engine config
	function getEngineConfig(): EngineConfig {
		return {
			data_source: dataSource,
			platform: Array.from(filterPlatform),
			timestamp_start: useTimePeriod && timestampStartStr ? timestampStartStr : null,
			timestamp_end: useTimePeriod && timestampEndStr ? timestampEndStr : null,
			market_title: filterTitleSearch.trim() ? filterTitleSearch.trim().split(',').map(s => s.trim()).filter(Boolean) : null,
			volume_inf: filterVolumeInf,
			volume_sup: filterVolumeSup,
			market_category: filterCategories.size > 0 ? Array.from(filterCategories) : null,
			position: filterPosition.size > 0 ? Array.from(filterPosition) : null,
			possible_outcomes: filterOutcomesSearch.trim() ? filterOutcomesSearch.trim().split(',').map(s => s.trim()).filter(Boolean) : null,
			price_inf: filterPriceInf,
			price_sup: filterPriceSup,
			amount_inf: filterAmountInf,
			amount_sup: filterAmountSup,
		};
	}

	function fireConfigComplete() {
		if (onConfigComplete) {
			onConfigComplete({
				config: getEngineConfig(),
				dataSource,
				useTimePeriod,
				timestampStartStr,
				timestampEndStr,
				filterTitleSearch,
				filterVolumeInf,
				filterVolumeSup,
				filterCategories,
				filterOutcomesSearch,
			});
		}
	}

	function prompt(term: any) {
		term.write(`\r\n${O}❯${R} `);
		term.scrollToBottom();
	}

	function showWizardStep(term: any) {
		const step = wizardStep;
		term.writeln('');
		if (step === 'data_source') {
			term.writeln(`${O}━━━ STEP 1/5: DATA SOURCE ━━━${R}`);
			term.writeln('');
			term.writeln(`Select your data source:`);
			term.writeln('');
			term.writeln(`  ${O}1${R}  Synthesis API  ${DIM}— Live historical trades & OHLC candles via Synthesis Trade API${R}`);
			term.writeln(`  ${O}2${R}  Parquet files   ${DIM}— Local .parquet dataset (404M+ pre-downloaded trades)${R}`);
			term.writeln('');
			term.writeln(`${DIM}Type ${O}1${R}${DIM} or ${O}2${R}${DIM} (default: 1)${R}`);
		} else if (step === 'time_period') {
			term.writeln(`${O}━━━ STEP 2/5: TIME PERIOD ━━━${R}`);
			term.writeln('');
			term.writeln(`Enable time period filter? (${O}yes${R}/${O}no${R})`);
			term.writeln(`${DIM}Press ENTER for no (use all data)${R}`);
		} else if (step === 'start_date') {
			term.writeln(`Start date (${O}YYYY-MM-DD${R}):`);
			term.writeln(`${DIM}e.g. 2024-01-01${R}`);
		} else if (step === 'end_date') {
			term.writeln(`End date (${O}YYYY-MM-DD${R}):`);
			term.writeln(`${DIM}e.g. 2025-01-01${R}`);
		} else if (step === 'title') {
			term.writeln(`${O}━━━ STEP 3/5: MARKET TITLE ━━━${R}`);
			term.writeln('');
			term.writeln(`Filter by market title keywords (comma-separated)`);
			term.writeln(`${DIM}e.g. "Bitcoin, Election, Trump" — ENTER to skip${R}`);
		} else if (step === 'volume_min') {
			term.writeln(`${O}━━━ STEP 4/5: VOLUME RANGE ━━━${R}`);
			term.writeln('');
			term.writeln(`Min volume:`);
			term.writeln(`${DIM}ENTER to skip (no minimum)${R}`);
		} else if (step === 'volume_max') {
			term.writeln(`Max volume:`);
			term.writeln(`${DIM}ENTER to skip (no maximum)${R}`);
		} else if (step === 'category') {
			term.writeln(`${O}━━━ STEP 5/5: CATEGORIES ━━━${R}`);
			term.writeln('');
			term.writeln(`Available: ${availableCategories.map(c => `${O}${c}${R}`).join(', ')}`);
			term.writeln('');
			term.writeln(`Select categories (comma-separated)`);
			term.writeln(`${DIM}e.g. "crypto, sport" — ENTER to skip (all categories)${R}`);
		} else if (step === 'outcomes') {
			term.writeln(`Filter by possible outcomes (comma-separated)`);
			term.writeln(`${DIM}e.g. "Yes, No, Trump" — ENTER to skip${R}`);
		} else if (step === 'review') {
			term.writeln(`${O}━━━ ENGINE CONFIG ━━━${R}`);
			term.writeln('');
			term.writeln(`${G}Data:${R}        ${dataSource === 'synthesis' ? 'Synthesis API (live)' : 'Parquet files (local)'}`);
			term.writeln(`${G}Platform:${R}    Polymarket`);
			term.writeln(`${G}Time:${R}        ${useTimePeriod ? `${timestampStartStr} → ${timestampEndStr}` : 'ALL TIME'}`);
			term.writeln(`${G}Title:${R}       ${filterTitleSearch || '—'}`);
			term.writeln(`${G}Volume:${R}      ${filterVolumeInf ?? '—'} → ${filterVolumeSup ?? '—'}`);
			term.writeln(`${G}Categories:${R}  ${filterCategories.size > 0 ? Array.from(filterCategories).join(', ') : '—'}`);
			term.writeln(`${G}Outcomes:${R}    ${filterOutcomesSearch || '—'}`);
			term.writeln('');
			term.writeln(`Type ${O}confirm${R} to finalize, ${O}reset${R} to start over, or ${O}edit <step>${R} to change a setting.`);
			term.writeln(`${DIM}Steps: data, time, title, volume, category${R}`);
		}
		prompt(term);
	}

	function handleWizardInput(term: any, input: string) {
		const val = input.trim();
		const valLower = val.toLowerCase();

		// Global commands available from any step
		if (valLower === 'reset') {
			dataSource = 'synthesis';
			filterPlatform = new Set(['polymarket']);
			useTimePeriod = false;
			timestampStartStr = '';
			timestampEndStr = '';
			filterTitleSearch = '';
			filterVolumeInf = null;
			filterVolumeSup = null;
			filterCategories = new Set();
			filterOutcomesSearch = '';
			term.clear();
			term.writeln(`${O}Terminal reset.${R}`);
			wizardStep = 'intro';
			term.writeln(`\n${G}Ready.${R} Type ${O}go${R} to start.`);
			prompt(term);
			return;
		}
		if (valLower === 'clear' && wizardStep !== 'intro') {
			term.clear();
			prompt(term);
			return;
		}

		switch (wizardStep) {
			case 'intro':
				if (valLower === 'go') {
					wizardStep = 'data_source';
					showWizardStep(term);
				} else if (valLower === 'help') {
					term.writeln('Available commands:');
					term.writeln(`  ${O}go${R}      - Start configuring your backtest`);
					term.writeln(`  ${O}help${R}    - Show this help message`);
					term.writeln(`  ${O}clear${R}   - Clear the terminal`);
					prompt(term);
				} else if (valLower === 'clear') {
					term.clear();
					prompt(term);
				} else {
					prompt(term);
				}
				break;

			case 'data_source':
				if (valLower === '2' || valLower === 'parquet') {
					dataSource = 'parquet';
					term.writeln(`${G}✓ Data source: Parquet files (local dataset)${R}`);
				} else {
					dataSource = 'synthesis';
					term.writeln(`${G}✓ Data source: Synthesis API (live historical data)${R}`);
				}
				wizardStep = 'time_period';
				showWizardStep(term);
				break;

			case 'time_period':
				if (valLower === 'yes' || valLower === 'y') {
					useTimePeriod = true;
					wizardStep = 'start_date';
					showWizardStep(term);
				} else {
					useTimePeriod = false;
					term.writeln(`${G}✓ Time period: ALL TIME${R}`);
					wizardStep = 'title';
					showWizardStep(term);
				}
				break;

			case 'start_date':
				if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
					timestampStartStr = val;
					term.writeln(`${G}✓ Start: ${val}${R}`);
					wizardStep = 'end_date';
					showWizardStep(term);
				} else {
					term.writeln(`${O}Invalid format. Use YYYY-MM-DD${R}`);
					prompt(term);
				}
				break;

			case 'end_date':
				if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
					timestampEndStr = val;
					term.writeln(`${G}✓ Period: ${timestampStartStr} → ${val}${R}`);
					wizardStep = 'title';
					showWizardStep(term);
				} else {
					term.writeln(`${O}Invalid format. Use YYYY-MM-DD${R}`);
					prompt(term);
				}
				break;

			case 'title':
				filterTitleSearch = val;
				term.writeln(`${G}✓ Title: ${val || 'no filter'}${R}`);
				wizardStep = 'volume_min';
				showWizardStep(term);
				break;

			case 'volume_min':
				filterVolumeInf = val ? parseFloat(val) : null;
				term.writeln(`${G}✓ Volume min: ${filterVolumeInf ?? 'none'}${R}`);
				wizardStep = 'volume_max';
				showWizardStep(term);
				break;

			case 'volume_max':
				filterVolumeSup = val ? parseFloat(val) : null;
				term.writeln(`${G}✓ Volume max: ${filterVolumeSup ?? 'none'}${R}`);
				wizardStep = 'category';
				showWizardStep(term);
				break;

			case 'category':
				if (val) {
					const cats = val.split(',').map(s => s.trim().toLowerCase()).filter(c => availableCategories.includes(c));
					filterCategories = new Set(cats);
					term.writeln(`${G}✓ Categories: ${cats.length > 0 ? cats.join(', ') : 'none matched'}${R}`);
				} else {
					filterCategories = new Set();
					term.writeln(`${G}✓ Categories: all${R}`);
				}
				wizardStep = 'outcomes';
				showWizardStep(term);
				break;

			case 'outcomes':
				filterOutcomesSearch = val;
				term.writeln(`${G}✓ Outcomes: ${val || 'no filter'}${R}`);
				wizardStep = 'review';
				showWizardStep(term);
				break;

			case 'review':
				if (valLower === 'confirm') {
					term.writeln('');
					term.writeln(`${G}━━━ Configuration saved! Loading strategy editor... ━━━${R}`);
					wizardStep = 'done';
					setTimeout(() => { fireConfigComplete(); }, 500);
				} else if (valLower === 'reset') {
					filterPlatform = new Set(['polymarket']);
					useTimePeriod = false;
					timestampStartStr = '';
					timestampEndStr = '';
					filterTitleSearch = '';
					filterVolumeInf = null;
					filterVolumeSup = null;
					filterCategories = new Set();
					filterOutcomesSearch = '';
					term.writeln(`${O}Config reset.${R}`);
					wizardStep = 'data_source';
					showWizardStep(term);
				} else if (valLower.startsWith('edit ')) {
					const target = valLower.replace('edit ', '').trim();
					const stepMap: Record<string, WizardStep> = {
						data: 'data_source', source: 'data_source',
						time: 'time_period', title: 'title',
						volume: 'volume_min', category: 'category', outcomes: 'outcomes',
					};
					if (stepMap[target]) {
						wizardStep = stepMap[target];
						showWizardStep(term);
					} else {
						term.writeln(`${O}Unknown step. Options: data, time, title, volume, category, outcomes${R}`);
						prompt(term);
					}
				} else {
					prompt(term);
				}
				break;

			case 'done':
				if (valLower === 'clear') {
					term.clear();
				} else if (valLower === 'config') {
					wizardStep = 'review';
					showWizardStep(term);
				}
				prompt(term);
				break;
		}
	}

	function setupInput(term: any) {
		term.onData((data: string) => {
			const code = data.charCodeAt(0);

			if (data === '\r') {
				term.write('\r\n');
				handleWizardInput(term, currentInputLine);
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
	}

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
			scrollback: 1000,
		});

		const fitAddon = new FitAddon();
		term.loadAddon(fitAddon);
		term.open(xtermContainer);
		fitAddon.fit();
		xtermInstance = term;

		// Responsive resize
		const resizeObserver = new ResizeObserver(() => fitAddon.fit());
		resizeObserver.observe(xtermContainer);

		// Wait for layout to stabilize before printing intro
		await new Promise(r => setTimeout(r, 150));
		fitAddon.fit();

		// Setup input handler first
		setupInput(term);

		// If returning from edit, skip intro and show review
		if (wizardStep !== 'intro') {
			showWizardStep(term);
			return;
		}

		// Typewriter intro
		let lineIdx = 0;
		const typeInterval = setInterval(() => {
			if (lineIdx < introLines.length) {
				term.writeln(introLines[lineIdx]);
				lineIdx++;
			} else {
				clearInterval(typeInterval);
				term.write('\r\n\x1b[38;5;208m❯\x1b[0m ');
			}
		}, 60);
	}

	// Exported method so parent can reset the wizard
	export function resetWizard() {
		dataSource = 'synthesis';
		filterPlatform = new Set(['polymarket']);
		useTimePeriod = false;
		timestampStartStr = '';
		timestampEndStr = '';
		filterTitleSearch = '';
		filterVolumeInf = null;
		filterVolumeSup = null;
		filterCategories = new Set();
		filterOutcomesSearch = '';
		filterPriceInf = null;
		filterPriceSup = null;
		filterAmountInf = null;
		filterAmountSup = null;
		filterPosition = new Set();
		wizardStep = 'intro';
		currentInputLine = '';

		if (xtermInstance) {
			xtermInstance.dispose();
			xtermInstance = null;
			xtermInitialized = false;
		}

		// Re-initialize after a tick
		if (browser && xtermContainer) {
			setTimeout(() => initXterm(), 100);
		}
	}

	onMount(() => {
		if (browser) {
			setTimeout(() => initXterm(), 100);
		}
	});

	onDestroy(() => {
		if (xtermInstance) {
			xtermInstance.dispose();
			xtermInstance = null;
		}
	});
</script>

<div class="engine-container">
	<div class="engine-intro">
		<div class="xterm-wrapper" bind:this={xtermContainer}></div>
	</div>
</div>

<style>
	.engine-container {
		background: #000000;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* ═══════════════ INTRO SCREEN ═══════════════ */
	.engine-intro {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		background: #000000;
	}
	.xterm-wrapper {
		flex: 1;
		min-height: 0;
		width: 100%;
		border: 1px solid #f97316;
		box-shadow: 0 0 20px rgba(249, 115, 22, 0.15), 0 0 60px rgba(249, 115, 22, 0.05);
		box-sizing: border-box;
		position: relative;
		overflow: hidden;
	}
	.xterm-wrapper :global(.xterm) {
		padding: 12px;
		height: 100%;
	}
	.xterm-wrapper :global(.xterm-viewport) {
		background-color: #000000 !important;
	}
	.xterm-wrapper :global(.xterm-viewport::-webkit-scrollbar) {
		width: 6px;
	}
	.xterm-wrapper :global(.xterm-viewport::-webkit-scrollbar-track) {
		background: #000000;
	}
	.xterm-wrapper :global(.xterm-viewport::-webkit-scrollbar-thumb) {
		background: #f97316;
		border-radius: 3px;
	}
</style>
