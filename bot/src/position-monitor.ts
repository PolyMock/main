import { SolanaClient, UserPosition } from './solana-client.js';
import { MarketResolver } from './market-resolver.js';
import { logger } from './logger.js';

export class PositionMonitor {
	private solanaClient: SolanaClient;
	private marketResolver: MarketResolver;
	private checkInterval: number;
	private intervalHandle: NodeJS.Timeout | null = null;
	private isRunning: boolean = false;

	// Track processed positions to avoid duplicate closures
	private processedPositions: Set<string> = new Set();

	constructor() {
		this.solanaClient = new SolanaClient();
		this.marketResolver = new MarketResolver();
		this.checkInterval = parseInt(
			process.env.CHECK_INTERVAL_MS || '60000',
			10
		);

		logger.info(`Check interval set to ${this.checkInterval}ms`);
	}

	/**
	 * Start monitoring positions
	 */
	async start() {
		if (this.isRunning) {
			logger.warn('Monitor is already running');
			return;
		}

		this.isRunning = true;
		logger.success(' Position monitor started!');

		// Show wallet info
		const walletPubkey = this.solanaClient.getWalletPublicKey();
		const balance = await this.solanaClient.getSolBalance();
		logger.info(`Wallet: ${walletPubkey.toString()}`);
		logger.info(`SOL Balance: ${balance.toFixed(4)} SOL`);

		// Run initial check
		await this.checkPositions();

		// Set up interval
		this.intervalHandle = setInterval(async () => {
			await this.checkPositions();
		}, this.checkInterval);

		logger.info(
			`Monitoring active. Checking every ${this.checkInterval / 1000} seconds.`
		);
	}

	/**
	 * Stop monitoring positions
	 */
	async stop() {
		if (!this.isRunning) {
			return;
		}

		this.isRunning = false;

		if (this.intervalHandle) {
			clearInterval(this.intervalHandle);
			this.intervalHandle = null;
		}

		logger.info('Position monitor stopped');
	}

	/**
	 * Check all positions and close resolved ones
	 */
	private async checkPositions() {
		try {
			logger.info('🔍 Checking positions...');

			const walletPubkey = this.solanaClient.getWalletPublicKey();

			// Get all active positions
			const positions = await this.solanaClient.getUserPositions(walletPubkey);

			if (positions.length === 0) {
				logger.info('No active positions found');
				return;
			}

			logger.info(`Found ${positions.length} active positions`);

			// Get unique market IDs
			const marketIds = [...new Set(positions.map((p) => p.marketId))];

			// Fetch market resolutions
			logger.info(`Checking ${marketIds.length} unique markets for resolution`);
			const resolutions = await this.marketResolver.getMultipleMarketResolutions(
				marketIds
			);

			// Process each position
			let closedCount = 0;
			for (const position of positions) {
				const positionKey = `${position.marketId}_${position.positionId.toString()}`;

				// Skip if already processed
				if (this.processedPositions.has(positionKey)) {
					logger.debug(`Position ${positionKey} already processed, skipping`);
					continue;
				}

				const resolution = resolutions.get(position.marketId);

				if (!resolution) {
					logger.warn(`No resolution data for market ${position.marketId}`);
					continue;
				}

				if (resolution.resolved) {
					logger.info(
						` Market ${position.marketId} is RESOLVED! Outcome: ${resolution.outcome}`
					);

					// Close the position
					try {
						const tx = await this.solanaClient.closePosition(
							walletPubkey,
							position.positionId.toNumber(),
							resolution.finalPrice
						);

						logger.success(
							` Closed position ${position.positionId.toString()} for market ${position.marketId}`
						);
						logger.info(`   Transaction: ${tx}`);
						logger.info(`   Final price: ${resolution.finalPrice}`);

						// Mark as processed
						this.processedPositions.add(positionKey);
						closedCount++;

						// Small delay between transactions
						await new Promise((resolve) => setTimeout(resolve, 1000));
					} catch (error: any) {
						logger.error(
							`Failed to close position ${position.positionId.toString()}:`,
							error.message
						);
					}
				} else {
					logger.debug(
						`Market ${position.marketId} not yet resolved (current price: ${resolution.finalPrice})`
					);
				}
			}

			if (closedCount > 0) {
				logger.success(` Successfully closed ${closedCount} positions!`);
			} else {
				logger.info('No resolved markets found. Waiting for next check...');
			}
		} catch (error) {
			logger.error('Error checking positions:', error);
		}
	}

	/**
	 * Reset processed positions (useful for testing)
	 */
	resetProcessed() {
		this.processedPositions.clear();
		logger.info('Processed positions reset');
	}
}
