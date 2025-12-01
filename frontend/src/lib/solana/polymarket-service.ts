import {
	Connection,
	PublicKey,
	SystemProgram,
	LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';
import { PUBLIC_SOLANA_PROGRAM_ID, PUBLIC_SOLANA_RPC_ENDPOINT } from '$env/static/public';
import IDL from './polymarket_paper.json';
import { erVerification } from './er-verification';

// Program ID and RPC from environment variables
const PROGRAM_ID = new PublicKey(PUBLIC_SOLANA_PROGRAM_ID);
const RPC_ENDPOINT = PUBLIC_SOLANA_RPC_ENDPOINT;

// IDL type - we'll use the generic Idl type from Anchor
export type PolymarketPaperIDL = Idl;

export interface UserAccount {
	owner: PublicKey;
	usdcBalance: BN;
	totalTrades: BN;
	createdAt: BN;
}

export interface PredictionPosition {
	owner: PublicKey;
	marketId: string;
	positionId: BN;
	predictionType: { yes: {} } | { no: {} };
	amountUsdc: BN;
	pricePerShare: BN;
	shares: BN;
	status: { active: {} } | { closed: {} };
	openedAt: BN;
	closedAt: BN;
}

export class PolymarketService {
	private connection: Connection;
	private program: Program | null = null;
	private verifyEREnabled: boolean = true; // Enable ER verification by default

	constructor() {
		// MagicBlock RPC handles ER automatically - no need for separate connections
		this.connection = new Connection(RPC_ENDPOINT, 'confirmed');
		console.log('Using MagicBlock RPC:', RPC_ENDPOINT);
	}

	/**
	 * Enable or disable ER verification logging
	 */
	setERVerification(enabled: boolean) {
		this.verifyEREnabled = enabled;
		console.log(`ER verification ${enabled ? 'enabled' : 'disabled'}`);
	}

	/**
	 * Initialize the Anchor program
	 * MagicBlock RPC automatically routes to ER when needed
	 */
	async initializeProgram(wallet: any): Promise<void> {
		try {
			const provider = new AnchorProvider(
				this.connection,
				wallet,
				{ commitment: 'confirmed' }
			);

			// Use the local IDL file
			this.program = new Program(IDL as Idl, provider);
			console.log('Program initialized with MagicBlock RPC');
		} catch (error) {
			console.error('Failed to initialize program:', error);
			throw error;
		}
	}

	/**
	 * Get the PDA for a user account
	 */
	getUserAccountPDA(userPublicKey: PublicKey): [PublicKey, number] {
		return PublicKey.findProgramAddressSync(
			[Buffer.from('user'), userPublicKey.toBuffer()],
			PROGRAM_ID
		);
	}

	/**
	 * Get the PDA for a position account
	 */
	getPositionPDA(userPublicKey: PublicKey, positionId: number): [PublicKey, number] {
		const positionIdBuffer = Buffer.alloc(8);
		positionIdBuffer.writeBigUInt64LE(BigInt(positionId));

		return PublicKey.findProgramAddressSync(
			[
				Buffer.from('position'),
				userPublicKey.toBuffer(),
				positionIdBuffer
			],
			PROGRAM_ID
		);
	}

	/**
	 * Get the PDA for the program config
	 */
	getConfigPDA(): [PublicKey, number] {
		return PublicKey.findProgramAddressSync(
			[Buffer.from('config')],
			PROGRAM_ID
		);
	}

	/**
	 * Check if user account exists
	 */
	async checkUserAccount(userPublicKey: PublicKey): Promise<boolean> {
		try {
			const [userAccountPDA] = this.getUserAccountPDA(userPublicKey);
			const accountInfo = await this.connection.getAccountInfo(userAccountPDA);
			return accountInfo !== null;
		} catch (error) {
			console.error('Error checking user account:', error);
			return false;
		}
	}

	/**
	 * Get user account data
	 */
	async getUserAccount(userPublicKey: PublicKey): Promise<UserAccount | null> {
		try {
			if (!this.program) {
				throw new Error('Program not initialized');
			}

			const [userAccountPDA] = this.getUserAccountPDA(userPublicKey);
			const account = await this.program.account.userAccount.fetch(userAccountPDA);
			return account as UserAccount;
		} catch (error) {
			console.error('Error fetching user account:', error);
			return null;
		}
	}

	/**
	 * Initialize user account with mock USDC balance
	 * Requires a 0.1 SOL entry fee
	 */
	async initializeUserAccount(
		wallet: any,
		entryFee: number = 0.1
	): Promise<string> {
		try {
			if (!this.program) {
				throw new Error('Program not initialized');
			}

			const userPublicKey = wallet.publicKey;
			const [userAccountPDA] = this.getUserAccountPDA(userPublicKey);
			const [configPDA] = this.getConfigPDA();

			// Get config to find treasury
			const config = await this.program.account.programConfig.fetch(configPDA);

			const entryFeeLamports = entryFee * LAMPORTS_PER_SOL;

			const tx = await this.program.methods
				.initializeAccount(new BN(entryFeeLamports))
				.accounts({
					userAccount: userAccountPDA,
					config: configPDA,
					user: userPublicKey,
					treasury: config.treasury,
					systemProgram: SystemProgram.programId,
				})
				.rpc();

			console.log('User account initialized:', tx);
			return tx;
		} catch (error) {
			console.error('Error initializing user account:', error);
			throw error;
		}
	}

	/**
	 * Buy YES shares (MagicBlock RPC handles ER routing automatically)
	 */
	async buyYes(
		wallet: any,
		marketId: string,
		amountUsdc: number,
		pricePerShare: number
	): Promise<string> {
		try {
			if (!this.program) {
				throw new Error('Program not initialized');
			}

			const userPublicKey = wallet.publicKey;
			const [userAccountPDA] = this.getUserAccountPDA(userPublicKey);

			// Get user account to get the next position ID
			const userAccount = await this.getUserAccount(userPublicKey);
			if (!userAccount) {
				throw new Error('User account not initialized');
			}

			const positionId = userAccount.totalTrades.toNumber();
			const [positionPDA] = this.getPositionPDA(userPublicKey, positionId);

			// Convert to 6 decimal places (USDC format)
			const amountUsdcBN = new BN(Math.floor(amountUsdc * 1_000_000));
			const pricePerShareBN = new BN(Math.floor(pricePerShare * 1_000_000));

			const tx = await this.program.methods
				.buyYes(marketId, amountUsdcBN, pricePerShareBN)
				.accounts({
					userAccount: userAccountPDA,
					positionAccount: positionPDA,
					user: userPublicKey,
					systemProgram: SystemProgram.programId,
				})
				.rpc();

			console.log('YES position created:', tx);

			// Verify ER usage
			if (this.verifyEREnabled) {
				setTimeout(async () => {
					await erVerification.logERVerification(tx, userAccountPDA);
				}, 1000); // Wait 1 second for transaction to propagate
			}

			return tx;
		} catch (error) {
			console.error('Error buying YES:', error);
			throw error;
		}
	}

	/**
	 * Buy NO shares (MagicBlock RPC handles ER routing automatically)
	 */
	async buyNo(
		wallet: any,
		marketId: string,
		amountUsdc: number,
		pricePerShare: number
	): Promise<string> {
		try {
			if (!this.program) {
				throw new Error('Program not initialized');
			}

			const userPublicKey = wallet.publicKey;
			const [userAccountPDA] = this.getUserAccountPDA(userPublicKey);

			// Get user account to get the next position ID
			const userAccount = await this.getUserAccount(userPublicKey);
			if (!userAccount) {
				throw new Error('User account not initialized');
			}

			const positionId = userAccount.totalTrades.toNumber();
			const [positionPDA] = this.getPositionPDA(userPublicKey, positionId);

			// Convert to 6 decimal places (USDC format)
			const amountUsdcBN = new BN(Math.floor(amountUsdc * 1_000_000));
			const pricePerShareBN = new BN(Math.floor(pricePerShare * 1_000_000));

			const tx = await this.program.methods
				.buyNo(marketId, amountUsdcBN, pricePerShareBN)
				.accounts({
					userAccount: userAccountPDA,
					positionAccount: positionPDA,
					user: userPublicKey,
					systemProgram: SystemProgram.programId,
				})
				.rpc();

			console.log('NO position created:', tx);

			// Verify ER usage
			if (this.verifyEREnabled) {
				setTimeout(async () => {
					await erVerification.logERVerification(tx, userAccountPDA);
				}, 1000); // Wait 1 second for transaction to propagate
			}

			return tx;
		} catch (error) {
			console.error('Error buying NO:', error);
			throw error;
		}
	}

	/**
	 * Get all positions for a user
	 */
	async getUserPositions(userPublicKey: PublicKey): Promise<PredictionPosition[]> {
		try {
			if (!this.program) {
				throw new Error('Program not initialized');
			}

			// Get user account to know how many positions
			const userAccount = await this.getUserAccount(userPublicKey);
			if (!userAccount) {
				return [];
			}

			const totalTrades = userAccount.totalTrades.toNumber();
			const positions: PredictionPosition[] = [];

			// Fetch each position
			for (let i = 0; i < totalTrades; i++) {
				try {
					const [positionPDA] = this.getPositionPDA(userPublicKey, i);
					const position = await this.program.account.predictionPosition.fetch(positionPDA);
					positions.push(position as PredictionPosition);
				} catch (error) {
					console.error(`Error fetching position ${i}:`, error);
				}
			}

			return positions;
		} catch (error) {
			console.error('Error fetching user positions:', error);
			return [];
		}
	}

	/**
	 * Close a position (MagicBlock RPC handles ER routing automatically)
	 */
	async closePosition(
		wallet: any,
		positionId: number,
		currentPrice: number
	): Promise<string> {
		try {
			if (!this.program) {
				throw new Error('Program not initialized');
			}

			const userPublicKey = wallet.publicKey;
			const [userAccountPDA] = this.getUserAccountPDA(userPublicKey);
			const [positionPDA] = this.getPositionPDA(userPublicKey, positionId);

			// Convert to 6 decimal places
			const currentPriceBN = new BN(Math.floor(currentPrice * 1_000_000));

			const tx = await this.program.methods
				.closePosition(currentPriceBN)
				.accounts({
					userAccount: userAccountPDA,
					positionAccount: positionPDA,
					user: userPublicKey,
				})
				.rpc();

			console.log('Position closed:', tx);
			return tx;
		} catch (error) {
			console.error('Error closing position:', error);
			throw error;
		}
	}
}

// Export singleton instance
export const polymarketService = new PolymarketService();