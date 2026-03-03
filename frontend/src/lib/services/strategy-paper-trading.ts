import { polymarketClient, type PolyMarket } from '$lib/polymarket';
import { polymarketService } from '$lib/solana/polymarket-service';
import { sessionKeyManager, SESSION_KEYS_PROGRAM_ID } from '$lib/solana/session-keys';
import { Connection, Transaction } from '@solana/web3.js';
import type { PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';
import BN from 'bn.js';
import IDL from '$lib/solana/polymarket_paper.json';

interface Strategy {
	id: number;
	strategyName: string;
	marketIds: string[];
	marketTags?: string[];
	marketCategories?: string[];
	avgLiquidity?: number;
	avgVolume?: number;
	stopLoss?: number;
	takeProfit?: number;
	positionSizingValue: number;
	positionSizingType: string;
}

interface MatchedMarket extends PolyMarket {
	matchScore: number;
	matchReasons: string[];
}

/**
 * Find active markets similar to the markets used in backtest
 */
export async function findSimilarActiveMarkets(
	strategy: Strategy,
	limit: number = 10
): Promise<MatchedMarket[]> {
	// Fetch all active markets
	const events = await polymarketClient.fetchEvents(100, false, 0);
	const allMarkets: PolyMarket[] = [];

	for (const event of events) {
		if (event.markets) {
			allMarkets.push(...event.markets.filter(m => m.active && !m.closed));
		}
	}

	// If strategy has tags/categories, filter by those
	const strategyTags = strategy.marketTags || [];
	const strategyCategories = strategy.marketCategories || [];

	const matchedMarkets: MatchedMarket[] = allMarkets
		.map(market => {
			let matchScore = 0;
			const matchReasons: string[] = [];

			// Match by tags
			if (strategyTags.length > 0 && market.tags) {
				const marketTags = market.tags.map(t => t.toLowerCase());
				const matchingTags = strategyTags.filter(tag =>
					marketTags.includes(tag.toLowerCase())
				);
				if (matchingTags.length > 0) {
					matchScore += matchingTags.length * 10;
					matchReasons.push(`Matching tags: ${matchingTags.join(', ')}`);
				}
			}

			// Match by liquidity (within 50% range)
			if (strategy.avgLiquidity && market.liquidity) {
				const liquidityRatio = market.liquidity / strategy.avgLiquidity;
				if (liquidityRatio >= 0.5 && liquidityRatio <= 2) {
					matchScore += 5;
					matchReasons.push(`Similar liquidity: $${market.liquidity.toLocaleString()}`);
				}
			}

			// Match by volume (within 50% range)
			if (strategy.avgVolume && market.volume) {
				const volumeRatio = market.volume / strategy.avgVolume;
				if (volumeRatio >= 0.5 && volumeRatio <= 2) {
					matchScore += 5;
					matchReasons.push(`Similar volume: $${market.volume.toLocaleString()}`);
				}
			}

			// Prefer markets with order books enabled
			if (market.enableOrderBook) {
				matchScore += 2;
			}

			// Prefer binary markets (Yes/No)
			if (market.tokens && market.tokens.length === 2) {
				matchScore += 3;
			}

			return {
				...market,
				matchScore,
				matchReasons
			};
		})
		.filter(m => m.matchScore > 0) // Only include markets with some match
		.sort((a, b) => b.matchScore - a.matchScore) // Sort by best match
		.slice(0, limit);

	return matchedMarkets;
}

/**
 * Calculate how many transactions will be needed for paper trading
 */
export function calculateBatchInfo(marketCount: number): { batches: number; signaturesNeeded: number } {
	const POSITIONS_PER_BATCH = 3; // Solana tx size limit
	const batches = Math.ceil(marketCount / POSITIONS_PER_BATCH);
	return {
		batches,
		signaturesNeeded: batches
	};
}

/**
 * Execute paper trading for a strategy across multiple markets
 */
export async function executePaperTrading(
	strategy: Strategy,
	markets: PolyMarket[],
	wallet: any,
	userBalance: number,
	onProgress?: (current: number, total: number) => void
): Promise<{ success: number; failed: number; txSignatures: string[] }> {
	if (!wallet || !wallet.publicKey) {
		throw new Error('Wallet not connected');
	}

	const POSITIONS_PER_BATCH = 3;
	const batches: PolyMarket[][] = [];

	// Split markets into batches
	for (let i = 0; i < markets.length; i += POSITIONS_PER_BATCH) {
		batches.push(markets.slice(i, i + POSITIONS_PER_BATCH));
	}

	let successCount = 0;
	let failedCount = 0;
	const txSignatures: string[] = [];

	// Get user account to determine position IDs
	const userAccount = await polymarketService.getUserAccount(wallet.publicKey);
	if (!userAccount) {
		throw new Error('User account not initialized. Please initialize your account first.');
	}

	let currentPositionId = userAccount.totalTrades.toNumber();

	// Check for active session
	const sessionKeypair = sessionKeyManager.getSessionKeypair();
	const sessionTokenPDA = sessionKeyManager.getSessionTokenPDA();
	const useSession = sessionKeypair && sessionTokenPDA && sessionKeyManager.isSessionForWallet(wallet.publicKey);

	// Create session-specific program if session is active
	let program = polymarketService.program!;
	if (useSession) {
		const connection = polymarketService['connection'] as Connection;
		const sessionWallet = {
			publicKey: sessionKeypair!.publicKey,
			signTransaction: async (tx: any) => { tx.partialSign(sessionKeypair!); return tx; },
			signAllTransactions: async (txs: any[]) => { txs.forEach(tx => tx.partialSign(sessionKeypair!)); return txs; },
		};
		const sessionProvider = new AnchorProvider(connection, sessionWallet as any, { commitment: 'confirmed' });
		program = new Program(IDL as Idl, sessionProvider);
	}

	// Execute each batch
	for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
		const batch = batches[batchIndex];

		if (onProgress) {
			onProgress(batchIndex + 1, batches.length);
		}

		try {
			const tx = new Transaction();

			// Add instructions for each position in this batch
			for (const market of batch) {
				// Calculate position size based on strategy
				const positionSize = calculatePositionSize(
					userBalance,
					strategy.positionSizingValue,
					strategy.positionSizingType
				);

				// Get current price (use yesPrice from market data)
				const currentPrice = market.yesPrice || 0.5;

				// Create position instruction
				const [userAccountPDA] = polymarketService.getUserAccountPDA(wallet.publicKey);
				const [positionPDA] = polymarketService.getPositionPDA(wallet.publicKey, currentPositionId);

				const amountBN = new BN(Math.floor(positionSize * 1_000_000));
				const priceBN = new BN(Math.floor(currentPrice * 100 * 1_000_000)); // Convert to cents then to 6-decimal
				const stopLossBN = new BN(Math.floor((strategy.stopLoss || 0) * 1_000_000));
				const takeProfitBN = new BN(Math.floor((strategy.takeProfit || 0) * 1_000_000));

				const accounts: Record<string, any> = {
					userAccount: userAccountPDA,
					positionAccount: positionPDA,
					user: useSession ? sessionKeypair!.publicKey : wallet.publicKey,
					sessionToken: useSession ? sessionTokenPDA : SESSION_KEYS_PROGRAM_ID,
				};

				const ix = await program.methods
					.buyYes(market.id, amountBN, priceBN, stopLossBN, takeProfitBN)
					.accounts(accounts)
					.instruction();

				tx.add(ix);
				currentPositionId++;
			}

			let signature: string;

			if (useSession) {
				// Session mode: sign with session keypair, no wallet popup
				tx.feePayer = sessionKeypair!.publicKey;
				const connection = polymarketService['connection'] as Connection;
				const { blockhash } = await connection.getLatestBlockhash();
				tx.recentBlockhash = blockhash;
				tx.sign(sessionKeypair!);
				signature = await connection.sendRawTransaction(tx.serialize());
				await connection.confirmTransaction(signature, 'confirmed');
			} else {
				// Normal mode: wallet signs
				signature = await wallet.sendTransaction(tx, polymarketService['connection']);
				await polymarketService['connection'].confirmTransaction(signature, 'confirmed');
			}

			txSignatures.push(signature);
			successCount += batch.length;

			// Store positions in database
			for (const market of batch) {
				await storeStrategyPosition(strategy.id, market.id, wallet.publicKey.toString());
			}

		} catch (error: any) {
			console.error(`Batch ${batchIndex + 1} failed:`, error);
			failedCount += batch.length;
		}
	}

	return { success: successCount, failed: failedCount, txSignatures };
}

/**
 * Calculate position size based on strategy configuration
 */
function calculatePositionSize(
	balance: number,
	sizingValue: number,
	sizingType: string
): number {
	switch (sizingType) {
		case 'fixed_percentage':
			return balance * (sizingValue / 100);
		case 'fixed_amount':
			return sizingValue;
		case 'kelly':
			// Simplified Kelly criterion
			return balance * (sizingValue / 100);
		default:
			return balance * 0.05; // Default 5%
	}
}

/**
 * Store strategy position link in database
 */
async function storeStrategyPosition(
	strategyId: number,
	marketId: string,
	walletAddress: string
): Promise<void> {
	try {
		await fetch('/api/strategies/positions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				strategyId,
				marketId,
				walletAddress
			}),
			credentials: 'include'
		});
	} catch (error) {
		console.error('Failed to store strategy position:', error);
	}
}
