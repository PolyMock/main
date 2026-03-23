<script lang="ts">
	import TradeDataDisplay from './TradeDataDisplay.svelte';
	import PythonCodeEditor from './PythonCodeEditor.svelte';
	import type { Trade, ValidationStatus } from '$lib/backtesting/step3-types';

	interface Props {
		strategyCode?: string;
		validationStatus?: ValidationStatus;
		trades?: Trade[];
		tradesLoading?: boolean;
		tradesError?: string | null;
		currentPage?: number;
		totalPages?: number;
		totalTrades?: number;
		onStrategyCodeChange?: (code: string) => void;
		onValidate?: () => void;
		onPageChange?: (page: number) => void;
		onBackClick?: () => void;
	}

	let {
		strategyCode = '',
		validationStatus = { isValid: false, message: '', isChecking: false },
		trades = [],
		tradesLoading = false,
		tradesError = null,
		currentPage = 1,
		totalPages = 1,
		totalTrades = 0,
		onStrategyCodeChange,
		onValidate,
		onPageChange,
		onBackClick,
	}: Props = $props();

	function handleCodeChange(newCode: string) {
		if (onStrategyCodeChange) {
			onStrategyCodeChange(newCode);
		}
	}

	function handleValidate() {
		if (onValidate) {
			onValidate();
		}
	}

	const PART_1 = `def strategy_function(trade, trade_log, portfolio, user_perso_parameters):`;
	const PART_3 = `    return action`;
</script>

<div class="editor-container">
	<!-- Left Panel: Code Editor -->
	<div class="left-panel">
		<div class="code-editor-wrapper">
			<!-- Header -->
			<div class="editor-header">
				<h3>Strategy Code (Part 1 + Part 2 + Part 3)</h3>
				<button class="btn-back" onclick={onBackClick} title="Back to filters">
					← Back to Filters
				</button>
			</div>

			<!-- Part 1: Read-only function signature -->
			<div class="code-part part-readonly">
				<span class="line-number">1</span>
				<span class="code-text part-1">{PART_1}</span>
			</div>

			<!-- Part 2: Editable code area with CodeMirror -->
			<div class="code-part editable">
				<PythonCodeEditor
					code={strategyCode}
					onChange={handleCodeChange}
					placeholder="# Write your strategy logic here&#10;# Example:&#10;if trade.get('price') <= 0.01:&#10;    direction = 'buy'&#10;    amount = 10"
				/>
			</div>

			<!-- Part 3: Read-only return statement -->
			<div class="code-part part-readonly">
				<span class="line-number">end</span>
				<span class="code-text part-3">{PART_3}</span>
			</div>

			<!-- Validation Controls -->
			<div class="validation-controls">
				<button
					class="btn btn-validate"
					onclick={handleValidate}
					disabled={validationStatus.isChecking}
				>
					{validationStatus.isChecking ? 'Validating...' : 'Validate Strategy'}
				</button>

				{#if validationStatus.isValid !== false && validationStatus.message}
					<div class="validation-result" class:valid={validationStatus.isValid} class:error={!validationStatus.isValid}>
						<span class="status-icon">
							{validationStatus.isValid ? '✓' : '✗'}
						</span>
						<span class="status-text">{validationStatus.message}</span>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Right Panel: Trade Data Display -->
	<div class="right-panel">
		<TradeDataDisplay
			{trades}
			isLoading={tradesLoading}
			error={tradesError}
			{currentPage}
			{totalPages}
			{totalTrades}
			onPageChange={onPageChange}
		/>
	</div>
</div>

<style>
	.editor-container {
		display: grid;
		grid-template-columns: 1fr 1fr;
		height: 100%;
		gap: 0;
		background: #000;
		overflow: hidden;
	}

	.left-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		background: #0a0a0a;
		border-right: 1px solid #333;
	}

	.code-editor-wrapper {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.editor-header {
		padding: 16px 20px;
		border-bottom: 1px solid #333;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.editor-header h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #f97316;
	}

	.btn-back {
		padding: 6px 12px;
		background: transparent;
		border: 1px solid #333;
		color: #999;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 500;
		font-family: 'Share Tech Mono', monospace;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-back:hover {
		border-color: #f97316;
		color: #f97316;
	}

	.code-part {
		display: flex;
		gap: 12px;
		padding: 12px 16px;
		font-family: 'Share Tech Mono', monospace;
		font-size: 13px;
		line-height: 1.6;
	}

	.code-part.part-readonly {
		background: #0f0f0f;
		color: #666;
		user-select: none;
	}

	.code-part.editable {
		flex: 1;
		padding: 0;
		background: transparent;
		overflow: hidden;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.line-number {
		color: #444;
		min-width: 30px;
		text-align: right;
		flex-shrink: 0;
	}

	.code-text {
		white-space: pre-wrap;
		word-break: break-word;
	}

	.validation-controls {
		padding: 16px;
		border-top: 1px solid #333;
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.btn-validate {
		padding: 8px 16px;
		background: #f97316;
		color: #000;
		border: none;
		border-radius: 4px;
		font-size: 12px;
		font-weight: 600;
		font-family: 'Share Tech Mono', monospace;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-validate:hover:not(:disabled) {
		background: #ea580c;
		box-shadow: 0 0 12px rgba(249, 115, 22, 0.4);
	}

	.btn-validate:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.validation-result {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		padding: 6px 12px;
		border-radius: 4px;
		flex: 1;
	}

	.validation-result.valid {
		background: rgba(34, 197, 94, 0.1);
		color: #22c55e;
		border: 1px solid #22c55e;
	}

	.validation-result.error {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
		border: 1px solid #ef4444;
	}

	.status-icon {
		font-weight: bold;
		font-size: 14px;
	}

	.status-text {
		flex: 1;
		font-family: 'Share Tech Mono', monospace;
	}

	.right-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		background: #000;
	}
</style>
