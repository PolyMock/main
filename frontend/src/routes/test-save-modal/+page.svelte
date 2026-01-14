<script lang="ts">
	let showSaveModal = false;
	let strategyName = '';
	let saveError = '';
	let savingStrategy = false;
	let showSuccessNotification = false;

	function openModal() {
		showSaveModal = true;
		strategyName = '';
		saveError = '';
	}

	function closeModal() {
		showSaveModal = false;
		strategyName = '';
		saveError = '';
	}

	async function saveStrategy() {
		if (!strategyName.trim()) {
			saveError = 'Please enter a strategy name';
			return;
		}

		savingStrategy = true;
		saveError = '';

		// Simulate save
		await new Promise(resolve => setTimeout(resolve, 1000));

		savingStrategy = false;
		showSaveModal = false;

		// Show success notification
		showSuccessNotification = true;
		setTimeout(() => {
			showSuccessNotification = false;
		}, 3000);
	}
</script>

<div class="test-page">
	<h1>🧪 Save Modal Test Page</h1>
	<p>This page lets you preview and customize the save strategy modal.</p>

	<button on:click={openModal} class="btn-open">Open Save Modal</button>

	<!-- Success Notification -->
	{#if showSuccessNotification}
		<div class="success-notification">
			<div class="success-content">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
					<circle cx="12" cy="12" r="10" fill="#10b981"/>
					<path d="M8 12l3 3 5-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<div>
					<h3>Strategy Saved Successfully!</h3>
					<p>Your backtest strategy has been saved to your account.</p>
				</div>
				<button on:click={() => showSuccessNotification = false} class="close-notification">
					<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
						<path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/>
					</svg>
				</button>
			</div>
		</div>
	{/if}

	<!-- Save Modal -->
	{#if showSaveModal}
		<div class="modal-overlay" on:click={closeModal}>
			<div class="modal-content" on:click|stopPropagation>
				<div class="modal-header">
					<h2>Save Backtest Strategy</h2>
					<button on:click={closeModal} class="close-btn">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
							<line x1="18" y1="6" x2="6" y2="18" stroke-width="2"/>
							<line x1="6" y1="6" x2="18" y2="18" stroke-width="2"/>
						</svg>
					</button>
				</div>

				<div class="modal-body">
					<div class="form-group">
						<label for="strategy-name">Strategy Name</label>
						<input
							id="strategy-name"
							type="text"
							bind:value={strategyName}
							placeholder="e.g., Momentum Strategy"
							class="form-input"
							disabled={savingStrategy}
						/>
					</div>

					{#if saveError}
						<div class="error-message">
							<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"/>
							</svg>
							{saveError}
						</div>
					{/if}

					<div class="info-box">
						<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"/>
						</svg>
						<p>Your backtest configuration, results, and all trade data will be saved.</p>
					</div>
				</div>

				<div class="modal-footer">
					<button on:click={closeModal} class="btn-cancel" disabled={savingStrategy}>
						Cancel
					</button>
					<button on:click={saveStrategy} class="btn-save" disabled={savingStrategy}>
						{#if savingStrategy}
							<span class="spinner"></span>
							Saving...
						{:else}
							Save Strategy
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.test-page {
		min-height: 100vh;
		background: #0a0e1a;
		padding: 40px 20px;
		color: white;
	}

	h1 {
		text-align: center;
		margin-bottom: 16px;
		color: #3b82f6;
	}

	p {
		text-align: center;
		color: #8b92ab;
		margin-bottom: 40px;
	}

	.btn-open {
		display: block;
		margin: 0 auto;
		padding: 14px 32px;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-open:hover {
		background: #2563eb;
		transform: translateY(-2px);
	}

	/* Success Notification */
	.success-notification {
		position: fixed;
		top: 80px;
		right: 20px;
		z-index: 10000;
		animation: slideIn 0.3s ease-out;
	}

	@keyframes slideIn {
		from {
			transform: translateX(400px);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	.success-content {
		background: #141824;
		border: 2px solid #10b981;
		border-radius: 12px;
		padding: 20px;
		display: flex;
		align-items: flex-start;
		gap: 16px;
		min-width: 400px;
		max-width: 500px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
	}

	.success-content svg:first-child {
		flex-shrink: 0;
		margin-top: 2px;
	}

	.success-content h3 {
		margin: 0 0 4px 0;
		color: #10b981;
		font-size: 16px;
		font-weight: 700;
	}

	.success-content p {
		margin: 0;
		color: #8b92ab;
		font-size: 14px;
		text-align: left;
	}

	.close-notification {
		background: transparent;
		border: none;
		color: #6b7280;
		cursor: pointer;
		padding: 4px;
		margin-left: auto;
		flex-shrink: 0;
		transition: color 0.2s;
	}

	.close-notification:hover {
		color: white;
	}

	/* Modal */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
	}

	.modal-content {
		background: #141824;
		border: 1px solid #1e2537;
		border-radius: 16px;
		width: 100%;
		max-width: 500px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		animation: modalIn 0.2s ease-out;
	}

	@keyframes modalIn {
		from {
			transform: scale(0.95);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 24px 24px 20px;
		border-bottom: 1px solid #1e2537;
	}

	.modal-header h2 {
		margin: 0;
		color: white;
		font-size: 20px;
		font-weight: 700;
	}

	.close-btn {
		background: transparent;
		border: none;
		color: #8b92ab;
		cursor: pointer;
		padding: 4px;
		display: flex;
		transition: color 0.2s;
	}

	.close-btn:hover {
		color: white;
	}

	.modal-body {
		padding: 24px;
	}

	.form-group {
		margin-bottom: 20px;
	}

	.form-group label {
		display: block;
		margin-bottom: 8px;
		color: #d1d5db;
		font-size: 14px;
		font-weight: 600;
	}

	.form-input {
		width: 100%;
		padding: 12px 16px;
		background: #1a1f2e;
		border: 1px solid #2a2f45;
		border-radius: 8px;
		color: white;
		font-size: 15px;
		transition: all 0.2s;
		box-sizing: border-box;
	}

	.form-input:focus {
		outline: none;
		border-color: #3b82f6;
		background: #0a0e1a;
	}

	.form-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid #ef4444;
		border-radius: 8px;
		color: #ef4444;
		font-size: 14px;
		margin-bottom: 20px;
	}

	.info-box {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px 16px;
		background: rgba(59, 130, 246, 0.1);
		border: 1px solid #3b82f6;
		border-radius: 8px;
		color: #60a5fa;
		font-size: 13px;
	}

	.info-box svg {
		flex-shrink: 0;
		margin-top: 2px;
	}

	.info-box p {
		margin: 0;
		color: #93c5fd;
		text-align: left;
	}

	.modal-footer {
		padding: 20px 24px 24px;
		display: flex;
		gap: 12px;
		justify-content: flex-end;
		border-top: 1px solid #1e2537;
	}

	.btn-cancel,
	.btn-save {
		padding: 10px 24px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.btn-cancel {
		background: transparent;
		color: #8b92ab;
		border: 1px solid #2a2f45;
	}

	.btn-cancel:hover:not(:disabled) {
		border-color: #3b4155;
		color: white;
	}

	.btn-save {
		background: #3b82f6;
		color: white;
	}

	.btn-save:hover:not(:disabled) {
		background: #2563eb;
		transform: translateY(-1px);
	}

	.btn-cancel:disabled,
	.btn-save:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 640px) {
		.success-content {
			min-width: auto;
			max-width: calc(100vw - 40px);
		}
	}
</style>
