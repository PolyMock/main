import dotenv from 'dotenv';
import { PositionMonitor } from './position-monitor.js';
import { logger } from './logger.js';

// Load environment variables
dotenv.config();

async function main() {
	logger.info(' Polymarket Position Closer Bot Starting...');

	// Validate environment variables
	const requiredEnvVars = [
		'SOLANA_RPC_ENDPOINT',
		'SOLANA_PROGRAM_ID',
		'WALLET_PRIVATE_KEY',
	];

	for (const envVar of requiredEnvVars) {
		if (!process.env[envVar]) {
			logger.error(` Missing required environment variable: ${envVar}`);
			logger.info('Please copy .env.example to .env and fill in your values');
			process.exit(1);
		}
	}

	// Initialize position monitor
	const monitor = new PositionMonitor();

	// Start monitoring
	await monitor.start();

	// Handle graceful shutdown
	process.on('SIGINT', async () => {
		logger.info('\n Shutting down gracefully...');
		await monitor.stop();
		process.exit(0);
	});

	process.on('SIGTERM', async () => {
		logger.info('\n Shutting down gracefully...');
		await monitor.stop();
		process.exit(0);
	});
}

main().catch((error) => {
	logger.error('Fatal error:', error);
	process.exit(1);
});
