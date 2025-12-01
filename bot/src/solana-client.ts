import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor';
import bs58 from 'bs58';
import { logger } from './logger.js';
import IDL from './idl/polymarket_paper.json' assert { type: 'json' };

export interface UserPosition {
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

export class SolanaClient {
	private connection: Connection;
	private wallet: Keypair;
	private program: Program;
	private programId: PublicKey;

	constructor() {
		// Initialize connection
		const rpcEndpoint = process.env.SOLANA_RPC_ENDPOINT!;
		this.connection = new Connection(rpcEndpoint, 'confirmed');
		logger.info(`Connected to Solana RPC: ${rpcEndpoint}`);

		// Initialize wallet from private key
		this.wallet = this.loadWallet();
		logger.info(`Wallet loaded: ${this.wallet.publicKey.toString()}`);

		// Initialize program
		this.programId = new PublicKey(process.env.SOLANA_PROGRAM_ID!);
		const provider = new AnchorProvider(
			this.connection,
			new Wallet(this.wallet),
			{ commitment: 'confirmed' }
		);

		this.program = new Program(IDL as any, provider);
		logger.info(`Program initialized: ${this.programId.toString()}`);
	}

	private loadWallet(): Keypair {
		try {
			const privateKeyStr = process.env.WALLET_PRIVATE_KEY!;

			// Try base58 format first
			try {
				const privateKey = bs58.decode(privateKeyStr);
				return Keypair.fromSecretKey(privateKey);
			} catch {
				// Try JSON array format
				const privateKey = JSON.parse(privateKeyStr);
				return Keypair.fromSecretKey(Uint8Array.from(privateKey));
			}
		} catch (error) {
			logger.error('Failed to load wallet:', error);
			throw new Error('Invalid wallet private key format');
		}
	}

	/**
	 * Get user account PDA
	 */
	getUserAccountPDA(userPublicKey: PublicKey): [PublicKey, number] {
		return PublicKey.findProgramAddressSync(
			[Buffer.from('user'), userPublicKey.toBuffer()],
			this.programId
		);
	}

	/**
	 * Get position PDA
	 */
	getPositionPDA(userPublicKey: PublicKey, positionId: number): [PublicKey, number] {
		const positionIdBuffer = Buffer.alloc(8);
		positionIdBuffer.writeBigUInt64LE(BigInt(positionId));

		return PublicKey.findProgramAddressSync(
			[Buffer.from('position'), userPublicKey.toBuffer(), positionIdBuffer],
			this.programId
		);
	}

	/**
	 * Get all active positions for a user
	 */
	async getUserPositions(userPublicKey: PublicKey): Promise<UserPosition[]> {
		try {
			// Get user account to know total trades
			const [userAccountPDA] = this.getUserAccountPDA(userPublicKey);
			const userAccount = await this.program.account.userAccount.fetch(
				userAccountPDA
			);

			const totalTrades = (userAccount as any).totalTrades.toNumber();
			const positions: UserPosition[] = [];

			// Fetch each position
			for (let i = 0; i < totalTrades; i++) {
				try {
					const [positionPDA] = this.getPositionPDA(userPublicKey, i);
					const position = await this.program.account.predictionPosition.fetch(
						positionPDA
					);

					// Only include active positions
					if ((position as any).status.active !== undefined) {
						positions.push(position as UserPosition);
					}
				} catch (error) {
					logger.debug(`Position ${i} not found or error:`, error);
				}
			}

			return positions;
		} catch (error) {
			logger.error('Error fetching user positions:', error);
			return [];
		}
	}

	/**
	 * Close a position
	 */
	async closePosition(
		userPublicKey: PublicKey,
		positionId: number,
		currentPrice: number
	): Promise<string> {
		try {
			const [userAccountPDA] = this.getUserAccountPDA(userPublicKey);
			const [positionPDA] = this.getPositionPDA(userPublicKey, positionId);

			// Convert to 6 decimal places (USDC format)
			const currentPriceBN = new BN(Math.floor(currentPrice * 1_000_000));

			logger.info(`Closing position ${positionId} at price ${currentPrice}`);

			const tx = await this.program.methods
				.closePosition(currentPriceBN)
				.accounts({
					userAccount: userAccountPDA,
					positionAccount: positionPDA,
					user: this.wallet.publicKey,
				})
				.rpc();

			logger.success(`Position ${positionId} closed. TX: ${tx}`);
			return tx;
		} catch (error) {
			logger.error(`Error closing position ${positionId}:`, error);
			throw error;
		}
	}

	/**
	 * Get wallet public key
	 */
	getWalletPublicKey(): PublicKey {
		return this.wallet.publicKey;
	}

	/**
	 * Get SOL balance
	 */
	async getSolBalance(): Promise<number> {
		const balance = await this.connection.getBalance(this.wallet.publicKey);
		return balance / 1e9;
	}
}
