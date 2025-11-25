import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { FindEntityPda, ApplySystem, SerializeArgs, BN, anchor } from '@magicblock-labs/bolt-sdk';
import type { Adapter, SignerWalletAdapter } from '@solana/wallet-adapter-base';

export const MAGICBLOCK_RPC = 'https://rpc.magicblock.app/devnet/';
export const SOLANA_RPC = 'https://api.devnet.solana.com';

// Paper Trading Program ID from the contract
export const PAPER_TRADING_PROGRAM_ID = new PublicKey('ENpbjfPxXx9fLhLDcqbLsHmo25LRU4fW9RXFfrqbKbmo');

export const COMPONENT_IDS = {
	TRADING_ACCOUNT: new PublicKey('3PDo9AKeLhU6hcUC7gft3PKQuotH4624mcevqdSiyTPS'),
	COMPETITION: new PublicKey('FPKpeKHnfYuYo8JDiDW7mNzZB8qgf1mLYwpQAcbGyVhJ'),
	POSITION: new PublicKey('9ACLRxNoDHXpHugLUmDtBGTQ6Q5vwnD4wUVSaWaNaVbv'),
	LEADERBOARD: new PublicKey('BCrmcoi7dEgg7UY3SpZfM4dihAWaYuNk3wprXsy1Xp5X'),
};

export const SYSTEM_IDS = {
	JOIN_COMPETITION: new PublicKey('5aJzg88rRLAFGN1imRwK84WMD4JyZBvz7n47nSQz9oGm'),
	OPEN_POSITION: new PublicKey('GdWvbNgbNxWHbSDTBweSi9zPgtRhggGxaJsCxL5vwDp9'),
	CLOSE_POSITION: new PublicKey('CXnKyp5DGMWRHsj9JsbECqBbDP1GeUF3c8AYSPZMmNd2'),
	SETTLE_COMPETITION: new PublicKey('32S5nHLK93PNVJQZgd4PQY4v9tkiLU2j9bEbHhJN4CuL'),
};

export const TRADING_PAIRS = {
	SOL: 0,
	BTC: 1,
	ETH: 2,
	AVAX: 3,
	LINK: 4,
};

export const TOKEN_DECIMALS = {
	// token_in (quote tokens - typically USDT)
	USDT: 6,
	// token_out (base tokens)
	SOL: 9,
	BTC: 8,
	ETH: 18,
	AVAX: 18,
	LINK: 18,
};

export const PAIR_DECIMALS = {
	0: { tokenIn: TOKEN_DECIMALS.USDT, tokenOut: TOKEN_DECIMALS.SOL },   // SOL/USDT
	1: { tokenIn: TOKEN_DECIMALS.USDT, tokenOut: TOKEN_DECIMALS.BTC },   // BTC/USDT
	2: { tokenIn: TOKEN_DECIMALS.USDT, tokenOut: TOKEN_DECIMALS.ETH },   // ETH/USDT
	3: { tokenIn: TOKEN_DECIMALS.USDT, tokenOut: TOKEN_DECIMALS.AVAX },  // AVAX/USDT
	4: { tokenIn: TOKEN_DECIMALS.USDT, tokenOut: TOKEN_DECIMALS.LINK },  // LINK/USDT
};

export enum PositionDirection {
	Long = 'LONG',
	Short = 'SHORT',
}

export const WORLD_ID = new BN(2409);
export const WORLD_INSTANCE_ID = new PublicKey('CVndFdiiuFhkcLEQy71JomGwgZT8Lqeq9oFuU14E9Ngk');

export class MagicBlockClient {
	connection: Connection;
	wallet: Keypair | null = null;
	sessionWallet: Keypair | null = null;
	connectedWallet: Adapter | null = null;
	entityPda: PublicKey | null = null;
	competitionEntity: PublicKey | null = null;

	constructor() {
		this.connection = new Connection(MAGICBLOCK_RPC, 'confirmed');
	}

	// Set connected wallet adapter
	async setConnectedWallet(wallet: Adapter | null) {
		this.connectedWallet = wallet;

		if (wallet?.connected && wallet.publicKey) {
			await this.initializeEntity();
		}
	}

	// Get current wallet (prioritize connected wallet over session wallet)
	getCurrentWallet(): { publicKey: PublicKey; signTransaction?: (tx: Transaction) => Promise<Transaction>; signAllTransactions?: (txs: Transaction[]) => Promise<Transaction[]> } | null {
		if (this.connectedWallet?.connected && this.connectedWallet.publicKey) {
			const signerWallet = this.connectedWallet as SignerWalletAdapter;
			return {
				publicKey: this.connectedWallet.publicKey,
				signTransaction: signerWallet.signTransaction?.bind(signerWallet),
				signAllTransactions: signerWallet.signAllTransactions?.bind(signerWallet)
			};
		}
		
		if (this.sessionWallet) {
			return {
				publicKey: this.sessionWallet.publicKey,
				signTransaction: async (tx: Transaction) => {
					tx.partialSign(this.sessionWallet!);
					return tx;
				},
				signAllTransactions: async (txs: Transaction[]) => {
					return txs.map((tx) => {
						tx.partialSign(this.sessionWallet!);
						return tx;
					});
				}
			};
		}

		return null;
	}

	// Check if we have a connected wallet
	isWalletConnected(): boolean {
		return !!(this.connectedWallet?.connected || this.sessionWallet);
	}

	// Get user account PDA for a specific pair
	getUserAccountPDA(userPubkey: PublicKey, pairIndex: number): [PublicKey, number] {
		return PublicKey.findProgramAddressSync(
			[
				Buffer.from('user'),
				userPubkey.toBuffer(),
				Buffer.from([pairIndex])
			],
			PAPER_TRADING_PROGRAM_ID
		);
	}

	// Get config PDA
	getConfigPDA(): [PublicKey, number] {
		return PublicKey.findProgramAddressSync(
			[Buffer.from('config')],
			PAPER_TRADING_PROGRAM_ID
		);
	}

	// Check if user has initialized their trading account for a specific pair
	async checkAccountInitialized(userPubkey: PublicKey, pairIndex: number): Promise<boolean> {
		try {
			const [userAccountPDA] = this.getUserAccountPDA(userPubkey, pairIndex);
			const accountInfo = await this.connection.getAccountInfo(userAccountPDA);
			return accountInfo !== null;
		} catch (error) {
			return false;
		}
	}

	// Initialize trading account for a user - MagicBlock ephemeral rollup approach
	async initializeAccount(pairIndex: number, entryFee: number = 0.1, initialTokenIn: number = 10000): Promise<string> {
		const currentWallet = this.getCurrentWallet();
		if (!currentWallet) {
			throw new Error('Wallet not connected');
		}

		try {
			const solanaConnection = new Connection(SOLANA_RPC, 'confirmed');
			const balance = await solanaConnection.getBalance(currentWallet.publicKey);
			if (balance < 100000000) {
				throw new Error('Insufficient SOL balance');
			}

			const [userAccountPDA] = this.getUserAccountPDA(currentWallet.publicKey, pairIndex);
			const [configPDA] = this.getConfigPDA();

			const existingAccount = await this.connection.getAccountInfo(userAccountPDA);
			if (existingAccount) {
				return 'account_already_exists';
			}

			const configAccountInfo = await this.connection.getAccountInfo(configPDA);
			if (!configAccountInfo) {
				throw new Error('Config account not initialized. Contact admin.');
			}

			const treasuryPubkey = new PublicKey(configAccountInfo.data.subarray(40, 72));

			const entryFeeScaled = Math.floor(entryFee * LAMPORTS_PER_SOL);
			const pairDecimals = PAIR_DECIMALS[pairIndex as keyof typeof PAIR_DECIMALS];
			const initialTokenInScaled = Math.floor(initialTokenIn * Math.pow(10, pairDecimals.tokenIn));

			// Setup for potential Anchor usage (keeping for future use)

			// Calculate the correct Anchor discriminator
			const methodName = "global:initialize_account";
			const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(methodName));
			const discriminator = new Uint8Array(hash).slice(0, 8);
			
			
			// Create instruction data buffer (discriminator + pair_index + entry_fee + initial_token_in + token_in_decimals + token_out_decimals)
			const instructionData = Buffer.alloc(27);
			Buffer.from(discriminator).copy(instructionData, 0);
			instructionData.writeUInt8(pairIndex, 8);
			instructionData.writeBigUInt64LE(BigInt(entryFeeScaled), 9);
			instructionData.writeBigUInt64LE(BigInt(initialTokenInScaled), 17);
			instructionData.writeUInt8(pairDecimals.tokenIn, 25);
			instructionData.writeUInt8(pairDecimals.tokenOut, 26);

			const instruction = new TransactionInstruction({
				keys: [
					{ pubkey: userAccountPDA, isSigner: false, isWritable: true },
					{ pubkey: configPDA, isSigner: false, isWritable: false },
					{ pubkey: currentWallet.publicKey, isSigner: true, isWritable: true },
					{ pubkey: treasuryPubkey, isSigner: false, isWritable: true },
					{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
				],
				programId: PAPER_TRADING_PROGRAM_ID,
				data: instructionData
			});

			const transaction = new Transaction().add(instruction);
			
			// Get fresh blockhash to avoid duplicate transaction issues
			const latestBlockhash = await this.connection.getLatestBlockhash('finalized');
			transaction.recentBlockhash = latestBlockhash.blockhash;
			transaction.feePayer = currentWallet.publicKey;

			// Sign and send transaction on main chain
			let signature: string;
			if (currentWallet.signTransaction) {
				const signedTx = await currentWallet.signTransaction(transaction);
				try {
					signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
						skipPreflight: false,
						preflightCommitment: 'finalized'
					});
				} catch (error: any) {
					if (error.name === 'SendTransactionError') {
						if (error.message?.includes('This transaction has already been processed')) {
							throw new Error('Transaction already processed. Please wait a moment before trying again.');
						}
					}
					throw error;
				}
			} else {
				throw new Error('Wallet does not support transaction signing');
			}

			
			// Wait for confirmation
			await this.connection.confirmTransaction(signature, 'confirmed');
			
			return signature;
		} catch (error) {
			throw error;
		}
	}

	// Get account status for all pairs
	async getAccountStatus(): Promise<{ [pairIndex: number]: boolean }> {
		const currentWallet = this.getCurrentWallet();
		if (!currentWallet) {
			return {};
		}

		const status: { [pairIndex: number]: boolean } = {};
		
		// Check initialization status for all trading pairs
		for (const [, pairIndex] of Object.entries(TRADING_PAIRS)) {
			status[pairIndex] = await this.checkAccountInitialized(currentWallet.publicKey, pairIndex);
		}

		return status;
	}

	async initializeSessionWallet(): Promise<Keypair> {

		const stored = localStorage.getItem('magicblock_session_wallet');
		if (stored) {
			try {
				const secretKey = Uint8Array.from(JSON.parse(stored));
				this.sessionWallet = Keypair.fromSecretKey(secretKey);
				await this.initializeEntity();
				this.setupProvider();
				return this.sessionWallet;
			} catch (e) {
			}
		}

		this.sessionWallet = Keypair.generate();
		localStorage.setItem(
			'magicblock_session_wallet',
			JSON.stringify(Array.from(this.sessionWallet.secretKey))
		);

		await this.initializeEntity();
		this.setupProvider();
		return this.sessionWallet;
	}

	async initializeEntity(): Promise<void> {
		const currentWallet = this.getCurrentWallet();
		if (!currentWallet) return;

		try {
			this.entityPda = FindEntityPda({
				worldId: WORLD_ID,
				seed: Buffer.from(currentWallet.publicKey.toBytes()),
			});

			this.competitionEntity = new PublicKey('5ebXENtrEamPapRhzMGjvrcavWwrEwWiY4Yftjx3wUsk');
		} catch (e) {
		}
	}

	setAdminWallet(secretKeyBase58: string): void {
		try {
			const secretKey = Keypair.fromSecretKey(
				Uint8Array.from(Buffer.from(secretKeyBase58, 'base64'))
			);
			this.wallet = secretKey;
		} catch (e) {
		}
	}

	getProvider(): anchor.AnchorProvider {
		const currentWallet = this.getCurrentWallet();
		if (!currentWallet) {
			throw new Error('No wallet available');
		}

		const wallet = {
			publicKey: currentWallet.publicKey,
			signTransaction: currentWallet.signTransaction || (async (tx: Transaction) => {
				throw new Error('Wallet does not support transaction signing');
			}),
			signAllTransactions: currentWallet.signAllTransactions || (async (txs: Transaction[]) => {
				throw new Error('Wallet does not support multiple transaction signing');
			}),
		};

		return new anchor.AnchorProvider(this.connection, wallet as any, {
			commitment: 'confirmed',
		});
	}

	setupProvider(): void {
		const provider = this.getProvider();
		anchor.setProvider(provider);
	}

	async getTradingAccountPDA(owner: PublicKey): Promise<[PublicKey, number]> {
		return PublicKey.findProgramAddressSync(
			[Buffer.from('trading-account'), owner.toBuffer()],
			COMPONENT_IDS.TRADING_ACCOUNT
		);
	}

	async buySpot(pairIndex: number, usdtAmount: number, currentPrice: number): Promise<string> {
		const currentWallet = this.getCurrentWallet();
		if (!currentWallet) {
			throw new Error('Wallet not connected');
		}

		const costInTokenIn = Math.floor(usdtAmount * 1e6);
		const priceScaled = Math.floor(currentPrice * 1e6);

		const [userAccountPDA] = this.getUserAccountPDA(currentWallet.publicKey, pairIndex);

		const methodName = "global:buy";
		const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(methodName));
		const discriminator = new Uint8Array(hash).slice(0, 8);

		const instructionData = Buffer.alloc(8 + 16);
		Buffer.from(discriminator).copy(instructionData, 0);
		instructionData.writeBigUInt64LE(BigInt(costInTokenIn), 8);
		instructionData.writeBigUInt64LE(BigInt(priceScaled), 16);

		const instruction = new TransactionInstruction({
			keys: [
				{ pubkey: userAccountPDA, isSigner: false, isWritable: true },
				{ pubkey: currentWallet.publicKey, isSigner: true, isWritable: false },
			],
			programId: PAPER_TRADING_PROGRAM_ID,
			data: instructionData
		});

		const transaction = new Transaction().add(instruction);
		const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
		transaction.recentBlockhash = latestBlockhash.blockhash;
		transaction.feePayer = currentWallet.publicKey;

		const signedTx = await currentWallet.signTransaction!(transaction);
		const signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
			skipPreflight: false,
			preflightCommitment: 'confirmed'
		});

		await this.connection.confirmTransaction({
			signature,
			blockhash: latestBlockhash.blockhash,
			lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
		}, 'confirmed');

		return signature;
	}

	async sellSpot(pairIndex: number, tokenAmount: number, currentPrice: number): Promise<string> {
		const currentWallet = this.getCurrentWallet();
		if (!currentWallet) {
			throw new Error('Wallet not connected');
		}

		const valueInTokenIn = Math.floor(tokenAmount * currentPrice * 1e6);
		const priceScaled = Math.floor(currentPrice * 1e6);

		const [userAccountPDA] = this.getUserAccountPDA(currentWallet.publicKey, pairIndex);

		const methodName = "global:sell";
		const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(methodName));
		const discriminator = new Uint8Array(hash).slice(0, 8);

		const instructionData = Buffer.alloc(8 + 16);
		Buffer.from(discriminator).copy(instructionData, 0);
		instructionData.writeBigUInt64LE(BigInt(valueInTokenIn), 8);
		instructionData.writeBigUInt64LE(BigInt(priceScaled), 16);

		const instruction = new TransactionInstruction({
			keys: [
				{ pubkey: userAccountPDA, isSigner: false, isWritable: true },
				{ pubkey: currentWallet.publicKey, isSigner: true, isWritable: false },
			],
			programId: PAPER_TRADING_PROGRAM_ID,
			data: instructionData
		});

		const transaction = new Transaction().add(instruction);
		const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
		transaction.recentBlockhash = latestBlockhash.blockhash;
		transaction.feePayer = currentWallet.publicKey;

		const signedTx = await currentWallet.signTransaction!(transaction);
		const signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
			skipPreflight: false,
			preflightCommitment: 'confirmed'
		});

		await this.connection.confirmTransaction({
			signature,
			blockhash: latestBlockhash.blockhash,
			lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
		}, 'confirmed');

		return signature;
	}

	async getPositionPDA(
		tradingAccount: PublicKey,
		positionId: number
	): Promise<[PublicKey, number]> {
		return PublicKey.findProgramAddressSync(
			[Buffer.from('position'), tradingAccount.toBuffer(), Buffer.from([positionId])],
			COMPONENT_IDS.POSITION
		);
	}

	async openPosition(
		pairSymbol: string,
		direction: PositionDirection,
		currentPrice: number,
		size: number,
		takeProfit?: number,
		stopLoss?: number
	): Promise<string> {
		const currentWallet = this.getCurrentWallet();
		if (!currentWallet) {
			throw new Error('Wallet not connected');
		}

		const pairIndex = TRADING_PAIRS[pairSymbol as keyof typeof TRADING_PAIRS];
		if (pairIndex === undefined) {
			throw new Error(`Unknown trading pair: ${pairSymbol}`);
		}

		// First try MagicBlock rollup execution
		try {
			return await this.openMagicBlockPosition(
				currentWallet,
				pairIndex,
				direction,
				currentPrice,
				size,
				takeProfit,
				stopLoss
			);
		} catch (error) {
			
			// Fallback to direct contract call
			return await this.openDirectPosition(
				currentWallet,
				pairIndex,
				direction,
				currentPrice,
				size,
				takeProfit,
				stopLoss
			);
		}
	}

	private async openMagicBlockPosition(
		currentWallet: any,
		pairIndex: number,
		direction: PositionDirection,
		currentPrice: number,
		size: number,
		takeProfit?: number,
		stopLoss?: number
	): Promise<string> {
		
		// Get decimal configuration for this pair
		const pairDecimals = PAIR_DECIMALS[pairIndex as keyof typeof PAIR_DECIMALS];
		
		// Instead of using Bolt systems, let's execute the paper trading program directly
		const priceScaled = Math.floor(currentPrice * 1e6); // Price always has 6 decimals
		const amountTokenOut = Math.floor((size / currentPrice) * Math.pow(10, pairDecimals.tokenOut));
		const requiredTokenIn = Math.floor(size * Math.pow(10, pairDecimals.tokenIn));
		const takeProfitScaled = takeProfit ? Math.floor(takeProfit * 1e6) : 0;
		const stopLossScaled = stopLoss ? Math.floor(stopLoss * 1e6) : 0;

		// Check if user has sufficient balance before attempting the transaction
		const accountData = await this.getUserAccountData(pairIndex);
		if (!accountData) {
			throw new Error(`Trading account not found for pair ${pairIndex}. Please initialize first.`);
		}

		const requiredBalance = requiredTokenIn / Math.pow(10, pairDecimals.tokenIn); // Convert back to readable format for comparison
		const epsilon = 0.01; // Allow 0.01 USDT tolerance for floating point precision

		if (accountData.tokenInBalance < requiredBalance - epsilon) {
			throw new Error(`Insufficient balance. Required: ${requiredBalance.toFixed(2)} USDT, Available: ${accountData.tokenInBalance.toFixed(2)} USDT`);
		}

		// Get the user account PDA for this pair
		const [userAccountPDA] = this.getUserAccountPDA(currentWallet.publicKey, pairIndex);
		
		// Check if account is initialized on MagicBlock
		const accountInfo = await this.connection.getAccountInfo(userAccountPDA);
		if (!accountInfo) {
			throw new Error(`Trading account not initialized for pair ${pairIndex}. Please initialize first.`);
		}

		// Create the instruction data for the paper trading program
		let methodName: string;
		if (direction === PositionDirection.Long) {
			methodName = "global:open_long_position";
		} else {
			methodName = "global:open_short_position";  
		}

		const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(methodName));
		const discriminator = new Uint8Array(hash).slice(0, 8);

		// Create instruction data buffer (discriminator + 4 u64s)
		const instructionData = Buffer.alloc(8 + 32); // 8 bytes discriminator + 32 bytes for 4 u64s
		Buffer.from(discriminator).copy(instructionData, 0);
		instructionData.writeBigUInt64LE(BigInt(amountTokenOut), 8);
		instructionData.writeBigUInt64LE(BigInt(priceScaled), 16);
		instructionData.writeBigUInt64LE(BigInt(takeProfitScaled), 24);
		instructionData.writeBigUInt64LE(BigInt(stopLossScaled), 32);

		// Calculate position PDA - read total_positions from account data
		// Updated UserAccount structure: discriminator(8) + owner(32) + pair_index(1) + token_in_balance(8) + token_out_balance(8) + token_in_decimals(1) + token_out_decimals(1) + total_positions(8)
		const dataView = new DataView(accountInfo.data.buffer, accountInfo.data.byteOffset, accountInfo.data.byteLength);
		const totalPositions = dataView.getBigUint64(8 + 32 + 1 + 8 + 8 + 1 + 1, true); // little endian
		
		// Convert totalPositions to little endian bytes (8 bytes for u64)
		const totalPositionsBuffer = Buffer.allocUnsafe(8);
		totalPositionsBuffer.writeBigUInt64LE(totalPositions);

		const [positionPDA] = PublicKey.findProgramAddressSync(
			[
				Buffer.from('position'),
				currentWallet.publicKey.toBuffer(),
				Buffer.from([pairIndex]),
				totalPositionsBuffer
			],
			PAPER_TRADING_PROGRAM_ID
		);

		// Create the transaction instruction to execute on MagicBlock
		const instruction = new TransactionInstruction({
			keys: [
				{ pubkey: userAccountPDA, isSigner: false, isWritable: true },
				{ pubkey: positionPDA, isSigner: false, isWritable: true },
				{ pubkey: currentWallet.publicKey, isSigner: true, isWritable: true },
				{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
			],
			programId: PAPER_TRADING_PROGRAM_ID,
			data: instructionData
		});

		const transaction = new Transaction().add(instruction);
		
		// Get fresh blockhash from MagicBlock connection
		const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
		transaction.recentBlockhash = latestBlockhash.blockhash;
		transaction.feePayer = currentWallet.publicKey;

		const signedTx = await currentWallet.signTransaction(transaction);
		
		let signature: string;
		try {
			signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
				skipPreflight: false,
				preflightCommitment: 'confirmed'
			});
		} catch (error: any) {
			if (error.name === 'SendTransactionError') {
				if (error.message?.includes('This transaction has already been processed')) {
					// Check if we can extract the signature from the error or transaction
					// If the transaction was already processed, it likely succeeded
					
					// Try to get the signature from the serialized transaction
					try {
						const txSignature = signedTx.signatures[0]?.toString();
						if (txSignature) {
							// Check transaction status
							const status = await this.connection.getSignatureStatus(txSignature);
							if (status.value?.confirmationStatus) {
								return txSignature;
							}
						}
					} catch (sigError) {
					}
					
					throw new Error('Transaction already processed. Please wait a moment before trying again.');
				}
			}
			throw error;
		}

		// Wait for confirmation on MagicBlock
		await this.connection.confirmTransaction({
			signature,
			blockhash: latestBlockhash.blockhash,
			lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
		}, 'confirmed');

		return signature;
	}

	private async openDirectPosition(
		currentWallet: any,
		pairIndex: number,
		direction: PositionDirection,
		currentPrice: number,
		size: number,
		takeProfit?: number,
		stopLoss?: number
	): Promise<string> {
		// Use MagicBlock connection only to avoid rate limits
		
		const [userAccountPDA] = this.getUserAccountPDA(currentWallet.publicKey, pairIndex);
		
		// Check if account is initialized
		const accountInfo = await this.connection.getAccountInfo(userAccountPDA);
		if (!accountInfo) {
			throw new Error(`Trading account not initialized for pair ${pairIndex}. Please initialize first.`);
		}

		// Get decimal configuration for this pair
		const pairDecimals = PAIR_DECIMALS[pairIndex as keyof typeof PAIR_DECIMALS];
		
		const priceScaled = Math.floor(currentPrice * 1e6); // Price always has 6 decimals
		const amountTokenOut = Math.floor((size / currentPrice) * Math.pow(10, pairDecimals.tokenOut));
		const requiredTokenIn = Math.floor(size * Math.pow(10, pairDecimals.tokenIn));
		const takeProfitScaled = takeProfit ? Math.floor(takeProfit * 1e6) : 0;
		const stopLossScaled = stopLoss ? Math.floor(stopLoss * 1e6) : 0;

		// Check balance using MagicBlock connection
		const accountData = await this.getUserAccountData(pairIndex);
		
		if (!accountData) {
			throw new Error(`Trading account not found for pair ${pairIndex}. Please initialize first.`);
		}

		const requiredBalance = requiredTokenIn / Math.pow(10, pairDecimals.tokenIn); // Convert back to readable format

		if (accountData.tokenInBalance < requiredBalance) {
			throw new Error(`Insufficient balance. Required: ${requiredBalance.toFixed(2)} USDT, Available: ${accountData.tokenInBalance.toFixed(2)} USDT`);
		}

		// Create the instruction data
		let methodName: string;
		if (direction === PositionDirection.Long) {
			methodName = "global:open_long_position";
		} else {
			methodName = "global:open_short_position";  
		}

		const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(methodName));
		const discriminator = new Uint8Array(hash).slice(0, 8);

		// Create instruction data buffer (discriminator + 4 u64s)
		const instructionData = Buffer.alloc(8 + 32); // 8 bytes discriminator + 32 bytes for 4 u64s
		Buffer.from(discriminator).copy(instructionData, 0);
		instructionData.writeBigUInt64LE(BigInt(amountTokenOut), 8);
		instructionData.writeBigUInt64LE(BigInt(priceScaled), 16);
		instructionData.writeBigUInt64LE(BigInt(takeProfitScaled), 24);
		instructionData.writeBigUInt64LE(BigInt(stopLossScaled), 32);

		// Calculate position PDA - read total_positions from account data
		// Updated UserAccount structure: discriminator(8) + owner(32) + pair_index(1) + token_in_balance(8) + token_out_balance(8) + token_in_decimals(1) + token_out_decimals(1) + total_positions(8)
		const dataView = new DataView(accountInfo.data.buffer, accountInfo.data.byteOffset, accountInfo.data.byteLength);
		const totalPositions = dataView.getBigUint64(8 + 32 + 1 + 8 + 8 + 1 + 1, true); // little endian
		
		// Convert totalPositions to little endian bytes (8 bytes for u64)
		const totalPositionsBuffer = Buffer.allocUnsafe(8);
		totalPositionsBuffer.writeBigUInt64LE(totalPositions);

		const [positionPDA] = PublicKey.findProgramAddressSync(
			[
				Buffer.from('position'),
				currentWallet.publicKey.toBuffer(),
				Buffer.from([pairIndex]),
				totalPositionsBuffer
			],
			PAPER_TRADING_PROGRAM_ID
		);

		const instruction = new TransactionInstruction({
			keys: [
				{ pubkey: userAccountPDA, isSigner: false, isWritable: true },
				{ pubkey: positionPDA, isSigner: false, isWritable: true },
				{ pubkey: currentWallet.publicKey, isSigner: true, isWritable: true },
				{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
			],
			programId: PAPER_TRADING_PROGRAM_ID,
			data: instructionData
		});

		const transaction = new Transaction().add(instruction);
		
		// Get fresh blockhash
		const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
		transaction.recentBlockhash = latestBlockhash.blockhash;
		transaction.feePayer = currentWallet.publicKey;

		const signedTx = await currentWallet.signTransaction(transaction);
		
		let signature: string;
		try {
			signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
				skipPreflight: false,
				preflightCommitment: 'confirmed'
			});
		} catch (error: any) {
			if (error.name === 'SendTransactionError') {
				if (error.message?.includes('This transaction has already been processed')) {
					// Check if the transaction actually succeeded
					
					try {
						const txSignature = signedTx.signatures[0]?.toString();
						if (txSignature) {
							const status = await this.connection.getSignatureStatus(txSignature);
							if (status.value?.confirmationStatus) {
								return txSignature;
							}
						}
					} catch (sigError) {
					}
					
					throw new Error('Transaction already processed. Please wait a moment before trying again.');
				}
			}
			throw error;
		}

		// Wait for confirmation
		await this.connection.confirmTransaction({
			signature,
			blockhash: latestBlockhash.blockhash,
			lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
		}, 'confirmed');

		return signature;
	}

	async closeDirectPosition(positionPubkey: string, currentPrice: number): Promise<string> {
		const currentWallet = this.getCurrentWallet();
		if (!currentWallet) {
			throw new Error('Wallet not connected');
		}


		// Use MagicBlock connection only to avoid rate limits
		
		// Get position account to read the data
		const positionAccountPubkey = new PublicKey(positionPubkey);
		const positionAccount = await this.connection.getAccountInfo(positionAccountPubkey);
		if (!positionAccount) {
			throw new Error('Position account not found');
		}

		// Parse position data to get pair_index
		const data = positionAccount.data;
		let offset = 8; // Skip discriminator
		offset += 32; // Skip owner
		const pairIndex = data[offset]; // pair_index

		// Get user account PDA
		const [userAccountPDA] = this.getUserAccountPDA(currentWallet.publicKey, pairIndex);

		// Create the instruction data for close_position
		const methodName = "global:close_position";
		const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(methodName));
		const discriminator = new Uint8Array(hash).slice(0, 8);

		// Create instruction data buffer (discriminator + current_price u64)
		const instructionData = Buffer.alloc(8 + 8); // 8 bytes discriminator + 8 bytes for u64
		Buffer.from(discriminator).copy(instructionData, 0);
		instructionData.writeBigUInt64LE(BigInt(Math.floor(currentPrice * 1e6)), 8); // Price with 6 decimals

		const instruction = new TransactionInstruction({
			keys: [
				{ pubkey: positionAccountPubkey, isSigner: false, isWritable: true },
				{ pubkey: userAccountPDA, isSigner: false, isWritable: true },
				{ pubkey: currentWallet.publicKey, isSigner: true, isWritable: false },
			],
			programId: PAPER_TRADING_PROGRAM_ID,
			data: instructionData
		});

		const transaction = new Transaction().add(instruction);
		
		// Get fresh blockhash
		const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
		transaction.recentBlockhash = latestBlockhash.blockhash;
		transaction.feePayer = currentWallet.publicKey;

		const signedTx = await currentWallet.signTransaction!(transaction);
		
		let signature: string;
		try {
			signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
				skipPreflight: false,
				preflightCommitment: 'confirmed'
			});
		} catch (error: any) {
			if (error.name === 'SendTransactionError') {
				if (error.message?.includes('This transaction has already been processed')) {
					// For close position, this usually means the position was successfully closed
					
					try {
						const txSignature = signedTx.signatures[0]?.toString();
						if (txSignature) {
							return txSignature;
						}
					} catch (sigError) {
					}
					
					// Return success indicator - position likely closed successfully  
					return 'close_position_success';
				}
			}
			throw error;
		}

		// Wait for confirmation
		await this.connection.confirmTransaction({
			signature,
			blockhash: latestBlockhash.blockhash,
			lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
		}, 'confirmed');

		return signature;
	}

	async executeSpotTrade(
		pairSymbol: string,
		action: 'BUY' | 'SELL',
		currentPrice: number,
		tokenAmount: number
	): Promise<string> {
		const currentWallet = this.getCurrentWallet();
		if (!currentWallet) {
			throw new Error('Wallet not connected');
		}

		const pairIndex = TRADING_PAIRS[pairSymbol as keyof typeof TRADING_PAIRS];
		if (pairIndex === undefined) {
			throw new Error(`Unknown trading pair: ${pairSymbol}`);
		}

		// Check if account is initialized
		const [userAccountPDA] = this.getUserAccountPDA(currentWallet.publicKey, pairIndex);
		const accountInfo = await this.connection.getAccountInfo(userAccountPDA);
		if (!accountInfo) {
			throw new Error(`Trading account not initialized for pair ${pairIndex}. Please initialize first.`);
		}

		// Get decimal configuration for this pair
		const pairDecimals = PAIR_DECIMALS[pairIndex as keyof typeof PAIR_DECIMALS];
		
		// Contract expects amount_token_out in proper token decimals
		const amountTokenOut = Math.floor(tokenAmount * Math.pow(10, pairDecimals.tokenOut));
		const priceScaled = Math.floor(currentPrice * 1e6); // Price always has 6 decimals

		// Check balance before executing trade
		const accountData = await this.getUserAccountData(pairIndex);
		if (!accountData) {
			throw new Error(`Trading account not found for pair ${pairIndex}. Please initialize first.`);
		}

		if (action === 'BUY') {
			// For buying, check if we have enough USDT
			const requiredUSDT = tokenAmount * currentPrice;
			const availableUSDT = accountData.tokenInBalance;
			if (availableUSDT < requiredUSDT) {
				throw new Error(`Insufficient USDT balance. Required: ${requiredUSDT.toFixed(2)}, Available: ${availableUSDT.toFixed(2)}`);
			}
		} else {
			// For selling, check if we have enough tokens
			const availableTokenAmount = accountData.tokenOutBalance;
			if (availableTokenAmount < tokenAmount) {
				throw new Error(`Insufficient token balance. Required: ${tokenAmount.toFixed(6)}, Available: ${availableTokenAmount.toFixed(6)}`);
			}
		}

		// Create the instruction data for buy/sell
		let methodName: string;
		if (action === 'BUY') {
			methodName = "global:buy";
		} else {
			methodName = "global:sell";
		}

		const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(methodName));
		const discriminator = new Uint8Array(hash).slice(0, 8);

		// Create instruction data buffer (discriminator + amount_token_out u64 + price u64)
		const instructionData = Buffer.alloc(8 + 8 + 8); // 8 bytes discriminator + 8 bytes amount + 8 bytes price
		Buffer.from(discriminator).copy(instructionData, 0);
		instructionData.writeBigUInt64LE(BigInt(amountTokenOut), 8);
		instructionData.writeBigUInt64LE(BigInt(priceScaled), 16);

		const instruction = new TransactionInstruction({
			keys: [
				{ pubkey: userAccountPDA, isSigner: false, isWritable: true },
				{ pubkey: currentWallet.publicKey, isSigner: true, isWritable: true },
			],
			programId: PAPER_TRADING_PROGRAM_ID,
			data: instructionData
		});

		const transaction = new Transaction().add(instruction);
		
		// Get fresh blockhash
		const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
		transaction.recentBlockhash = latestBlockhash.blockhash;
		transaction.feePayer = currentWallet.publicKey;

		const signedTx = await currentWallet.signTransaction!(transaction);
		
		let signature: string;
		try {
			signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
				skipPreflight: false,
				preflightCommitment: 'confirmed'
			});
		} catch (error: any) {
			if (error.name === 'SendTransactionError') {
				if (error.message?.includes('This transaction has already been processed')) {
					// For spot trades, this usually means the trade was successful
					
					try {
						const txSignature = signedTx.signatures[0]?.toString();
						if (txSignature) {
							return txSignature;
						}
					} catch (sigError) {
					}
					
					// Return success indicator - trade likely completed successfully  
					return 'spot_trade_success';
				}
			}
			throw error;
		}

		// Wait for confirmation
		await this.connection.confirmTransaction({
			signature,
			blockhash: latestBlockhash.blockhash,
			lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
		}, 'confirmed');

		return signature;
	}

	async closePosition(positionId: string): Promise<string> {
		const currentWallet = this.getCurrentWallet();
		if (!currentWallet || !this.entityPda || !this.competitionEntity) {
			throw new Error('Wallet not connected or entity not initialized');
		}


		try {
			const positionEntityPda = new PublicKey(positionId);

			const { transaction } = await ApplySystem({
				authority: currentWallet.publicKey,
				systemId: SYSTEM_IDS.CLOSE_POSITION,
				entities: [
					{
						entity: this.competitionEntity,
						components: [{ componentId: COMPONENT_IDS.COMPETITION }],
					},
					{
						entity: this.entityPda,
						components: [{ componentId: COMPONENT_IDS.TRADING_ACCOUNT }],
					},
					{
						entity: positionEntityPda,
						components: [{ componentId: COMPONENT_IDS.POSITION }],
					},
				],
				world: WORLD_INSTANCE_ID,
			});

			// Get fresh blockhash and set transaction properties
			const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
			transaction.recentBlockhash = latestBlockhash.blockhash;
			transaction.feePayer = currentWallet.publicKey;

			// Sign and send transaction
			let signature: string;
			if (currentWallet.signTransaction) {
				const signedTx = await currentWallet.signTransaction(transaction);
				try {
					signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
						skipPreflight: false,
						preflightCommitment: 'confirmed'
					});
				} catch (error: any) {
					if (error.name === 'SendTransactionError') {
						if (error.message?.includes('This transaction has already been processed')) {
							throw new Error('Transaction already processed. Please wait a moment before trying again.');
						}
					}
					throw error;
				}
				
				// Wait for confirmation
				await this.connection.confirmTransaction({
					signature,
					blockhash: latestBlockhash.blockhash,
					lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
				}, 'confirmed');
			} else if (this.sessionWallet) {
				// Fallback to session wallet signing
				signature = await sendAndConfirmTransaction(
					this.connection,
					transaction,
					[this.sessionWallet],
					{ commitment: 'confirmed' }
				);
			} else {
				throw new Error('No signing method available');
			}

			return signature;
		} catch (error) {
			throw error;
		}
	}

	async fetchPositions(): Promise<any[]> {
		const currentWallet = this.getCurrentWallet();
		if (!currentWallet) {
			return [];
		}

		let positions: any[] = [];

		// Try to fetch MagicBlock positions first
		if (this.entityPda) {
			try {
				const positionAccounts = await this.connection.getProgramAccounts(COMPONENT_IDS.POSITION, {
					filters: [
						{
							memcmp: {
								offset: 8,
								bytes: this.entityPda.toBase58()
							}
						}
					]
				});

				for (const accountInfo of positionAccounts) {
					try {
						const data = accountInfo.account.data;
						positions.push({
							type: 'magicblock',
							pubkey: accountInfo.pubkey.toBase58(),
							data: data.toString('hex').substring(0, 100) + '...'
						});
					} catch (parseError) {
					}
				}

			} catch (error) {
			}
		}

		// Fetch direct contract positions using MagicBlock rollup only
		try {
			const positionAccountSize = 104;

			const allAccounts = await this.connection.getProgramAccounts(PAPER_TRADING_PROGRAM_ID, {
				filters: [
					{
						dataSize: positionAccountSize
					},
					{
						memcmp: {
							offset: 8,
							bytes: currentWallet.publicKey.toBase58()
						}
					}
				]
			});

			const directPositions = allAccounts;

			for (const accountInfo of directPositions) {
				try {
					// Parse position data from the contract
					const data = accountInfo.account.data;
					const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
					
					// Parse according to PositionAccount struct from main.rs:
					// owner: Pubkey (32), pair_index: u8 (1), position_id: u64 (8)
					// position_type: PositionType (1), amount_token_out: u64 (8)
					// entry_price: u64 (8), take_profit_price: u64 (8), stop_loss_price: u64 (8)
					// status: PositionStatus (1), opened_at: i64 (8), closed_at: i64 (8)
					
					let offset = 8; // Skip discriminator
					
					// owner: Pubkey (32 bytes)
					offset += 32;
					
					// pair_index: u8 (1 byte)
					const pairIndex = data[offset];
					offset += 1;
					
					// position_id: u64 (8 bytes)
					const positionId = dataView.getBigUint64(offset, true);
					offset += 8;
					
					// position_type: PositionType (1 byte) - 0 = Long, 1 = Short  
					const positionType = data[offset];
					offset += 1;
					
					// amount_token_out: u64 (8 bytes)
					const amountTokenOut = dataView.getBigUint64(offset, true);
					offset += 8;
					
					// entry_price: u64 (8 bytes)
					const entryPrice = dataView.getBigUint64(offset, true);
					offset += 8;
					
					// take_profit_price: u64 (8 bytes)
					const takeProfitPrice = dataView.getBigUint64(offset, true);
					offset += 8;
					
					// stop_loss_price: u64 (8 bytes)
					const stopLossPrice = dataView.getBigUint64(offset, true);
					offset += 8;
					
					// status: PositionStatus (1 byte) - 0 = Active, 1 = Closed
					const status = data[offset];
					offset += 1;
					
					// opened_at: i64 (8 bytes)
					const openedAt = dataView.getBigInt64(offset, true);
					offset += 8;
					
					// closed_at: i64 (8 bytes)
					const closedAt = dataView.getBigInt64(offset, true);

					// Get pair symbol and decimals
					const pairSymbols = ['SOL', 'BTC', 'ETH', 'AVAX', 'LINK'];
					const pairSymbol = pairSymbols[pairIndex] || 'UNKNOWN';
					const pairDecimals = PAIR_DECIMALS[pairIndex as keyof typeof PAIR_DECIMALS];

					if (status === 0 && pairDecimals) {
						positions.push({
							type: 'direct',
							pubkey: accountInfo.pubkey.toBase58(),
							positionId: positionId.toString(),
							direction: positionType === 0 ? 'LONG' : 'SHORT',
							pairIndex,
							pairSymbol,
							amountTokenOut: Number(amountTokenOut) / Math.pow(10, pairDecimals.tokenOut),
							entryPrice: Number(entryPrice) / 1e6, // Price always has 6 decimals
							takeProfitPrice: takeProfitPrice > 0 ? Number(takeProfitPrice) / 1e6 : null,
							stopLossPrice: stopLossPrice > 0 ? Number(stopLossPrice) / 1e6 : null,
							openedAt: new Date(Number(openedAt) * 1000),
							status: 'ACTIVE'
						});
					}
				} catch (parseError) {
				}
			}

		} catch (error) {
		}

		return positions;
	}

	async requestAirdrop(amount: number = 1): Promise<string> {
		const currentWallet = this.getCurrentWallet();
		if (!currentWallet) {
			throw new Error('Wallet not connected');
		}

		const signature = await this.connection.requestAirdrop(
			currentWallet.publicKey,
			amount * LAMPORTS_PER_SOL
		);

		return signature;
	}

	async getBalance(): Promise<number> {
		const currentWallet = this.getCurrentWallet();
		if (!currentWallet) {
			return 0;
		}

		try {
			const solanaConnection = new Connection(SOLANA_RPC, 'confirmed');
			const balance = await solanaConnection.getBalance(currentWallet.publicKey);
			return balance / LAMPORTS_PER_SOL;
		} catch (error) {
			const balance = await this.connection.getBalance(currentWallet.publicKey);
			return balance / LAMPORTS_PER_SOL;
		}
	}

	// Get mock token balances for a specific trading pair
	async getUserAccountData(pairIndex: number): Promise<{ tokenInBalance: number; tokenOutBalance: number; totalPositions: number } | null> {
		const currentWallet = this.getCurrentWallet();
		if (!currentWallet) {
			return null;
		}

		try {
			const [userAccountPDA] = this.getUserAccountPDA(currentWallet.publicKey, pairIndex);
			const accountInfo = await this.connection.getAccountInfo(userAccountPDA);
			
			if (!accountInfo) {
				return null;
			}

			// Parse the account data according to the UserAccount struct
			const data = accountInfo.data;
			
			// Skip the 8-byte discriminator
			let offset = 8;
			
			// Skip owner (32 bytes)
			offset += 32;
			
			// Skip pair_index (1 byte)  
			offset += 1;
			
			// Read token_in_balance (8 bytes, u64)
			const tokenInBalanceRaw = data.readBigUInt64LE(offset);
			offset += 8;
			
			// Read token_out_balance (8 bytes, u64)
			const tokenOutBalanceRaw = data.readBigUInt64LE(offset);
			offset += 8;
			
			// Read token_in_decimals (1 byte, u8)
			const tokenInDecimals = data[offset];
			offset += 1;
			
			// Read token_out_decimals (1 byte, u8)
			const tokenOutDecimals = data[offset];
			offset += 1;
			
			// Read total_positions (8 bytes, u64)
			const totalPositions = Number(data.readBigUInt64LE(offset));

			// Convert to readable format using stored decimals
			const tokenInBalance = Number(tokenInBalanceRaw) / Math.pow(10, tokenInDecimals);
			const tokenOutBalance = Number(tokenOutBalanceRaw) / Math.pow(10, tokenOutDecimals);

			return {
				tokenInBalance,
				tokenOutBalance,
				totalPositions
			};
		} catch (error) {
			return null;
		}
	}

	// Get mock token balances for all initialized trading pairs
	async getAllUserAccountData(): Promise<{ [pairIndex: number]: { tokenInBalance: number; tokenOutBalance: number; totalPositions: number } }> {
		const accountData: { [pairIndex: number]: { tokenInBalance: number; tokenOutBalance: number; totalPositions: number } } = {};
		
		// Check all trading pairs
		for (const [, pairIndex] of Object.entries(TRADING_PAIRS)) {
			const data = await this.getUserAccountData(pairIndex);
			if (data) {
				accountData[pairIndex] = data;
			}
		}

		return accountData;
	}

	async joinCompetition(): Promise<string> {
		const currentWallet = this.getCurrentWallet();
		if (!currentWallet || !this.entityPda || !this.competitionEntity) {
			throw new Error('Wallet not connected or entity not initialized');
		}


		try {
			const { transaction } = await ApplySystem({
				authority: currentWallet.publicKey,
				systemId: SYSTEM_IDS.JOIN_COMPETITION,
				entities: [
					{
						entity: this.competitionEntity,
						components: [{ componentId: COMPONENT_IDS.COMPETITION }],
					},
					{
						entity: this.entityPda,
						components: [{ componentId: COMPONENT_IDS.TRADING_ACCOUNT }],
					},
				],
				world: WORLD_INSTANCE_ID,
			});

			// Get fresh blockhash and set transaction properties
			const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
			transaction.recentBlockhash = latestBlockhash.blockhash;
			transaction.feePayer = currentWallet.publicKey;

			// Sign and send transaction
			let signature: string;
			if (currentWallet.signTransaction) {
				const signedTx = await currentWallet.signTransaction(transaction);
				try {
					signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
						skipPreflight: false,
						preflightCommitment: 'confirmed'
					});
				} catch (error: any) {
					if (error.name === 'SendTransactionError') {
						if (error.message?.includes('This transaction has already been processed')) {
							throw new Error('Transaction already processed. Please wait a moment before trying again.');
						}
					}
					throw error;
				}
				
				// Wait for confirmation
				await this.connection.confirmTransaction({
					signature,
					blockhash: latestBlockhash.blockhash,
					lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
				}, 'confirmed');
			} else if (this.sessionWallet) {
				// Fallback to session wallet signing
				signature = await sendAndConfirmTransaction(
					this.connection,
					transaction,
					[this.sessionWallet],
					{ commitment: 'confirmed' }
				);
			} else {
				throw new Error('No signing method available');
			}

			return signature;
		} catch (error) {
			throw error;
		}
	}

	async fetchLeaderboard(currentPrices?: Record<string, number>): Promise<any[]> {
		try {
			const userAccountSize = 68; // Updated size with decimal fields

			const allAccounts = await this.connection.getProgramAccounts(PAPER_TRADING_PROGRAM_ID, {
				filters: [
					{
						dataSize: userAccountSize
					}
				]
			});

			const userMap = new Map<string, { totalValue: number; totalPositions: number }>();

			for (const accountInfo of allAccounts) {
				try {
					const data = accountInfo.account.data;
					let offset = 8;

					const ownerBytes = data.slice(offset, offset + 32);
					const owner = new PublicKey(ownerBytes).toBase58();
					offset += 32;

					const pairIndex = data[offset];
					offset += 1;

					const tokenInBalanceRaw = data.readBigUInt64LE(offset);
					offset += 8;

					const tokenOutBalanceRaw = data.readBigUInt64LE(offset);
					offset += 8;

					const tokenInDecimals = data[offset];
					offset += 1;

					const tokenOutDecimals = data[offset];
					offset += 1;

					const totalPositions = Number(data.readBigUInt64LE(offset));

					const tokenInBalance = Number(tokenInBalanceRaw) / Math.pow(10, tokenInDecimals);
					const tokenOutBalance = Number(tokenOutBalanceRaw) / Math.pow(10, tokenOutDecimals);

					const pairSymbols = ['SOL', 'BTC', 'ETH', 'AVAX', 'LINK'];
					const pairSymbol = pairSymbols[pairIndex];
					const currentPrice = currentPrices?.[pairSymbol] || 0;

					const pairValue = tokenInBalance + (tokenOutBalance * currentPrice);

					if (!userMap.has(owner)) {
						userMap.set(owner, { totalValue: 0, totalPositions: 0 });
					}

					const userData = userMap.get(owner)!;
					userData.totalValue += pairValue;
					userData.totalPositions += totalPositions;
				} catch (parseError) {
				}
			}

			const leaderboard = [];
			for (const [address, data] of userMap.entries()) {
				const pnl = data.totalValue - 10000;

				leaderboard.push({
					address: address.substring(0, 8),
					pnl,
					trades: data.totalPositions,
					balance: data.totalValue
				});
			}

			leaderboard.sort((a, b) => b.pnl - a.pnl);

			return leaderboard.map((entry, index) => ({
				...entry,
				rank: index + 1
			}));
		} catch (error) {
			return [];
		}
	}

	async fetchCompetitionData(): Promise<{ startTime: Date; endTime: Date; totalParticipants: number; prizePool: number; isActive: boolean; name: string } | null> {
		if (!this.competitionEntity) {
			return null;
		}

		try {

			const [componentPda] = PublicKey.findProgramAddressSync(
				[Buffer.from('component'), this.competitionEntity.toBuffer(), COMPONENT_IDS.COMPETITION.toBuffer()],
				COMPONENT_IDS.COMPETITION
			);

			const accountInfo = await this.connection.getAccountInfo(componentPda);
			if (!accountInfo) {
				return null;
			}

			const data = accountInfo.data;
			let offset = 8;

			const authorityBytes = data.slice(offset, offset + 32);
			offset += 32;

			const startTimeBuffer = data.slice(offset, offset + 8);
			const startTime = new DataView(startTimeBuffer.buffer, startTimeBuffer.byteOffset).getBigInt64(0, true);
			offset += 8;

			const endTimeBuffer = data.slice(offset, offset + 8);
			const endTime = new DataView(endTimeBuffer.buffer, endTimeBuffer.byteOffset).getBigInt64(0, true);
			offset += 8;

			const totalParticipantsBuffer = data.slice(offset, offset + 8);
			const totalParticipants = new DataView(totalParticipantsBuffer.buffer, totalParticipantsBuffer.byteOffset).getBigUint64(0, true);
			offset += 8;

			const prizePoolBuffer = data.slice(offset, offset + 8);
			const prizePool = new DataView(prizePoolBuffer.buffer, prizePoolBuffer.byteOffset).getBigUint64(0, true);
			offset += 8;

			const isActive = data[offset] === 1;
			offset += 1;

			const nameLength = data.readUInt32LE(offset);
			offset += 4;
			const name = data.slice(offset, offset + nameLength).toString('utf-8');

			return {
				startTime: new Date(Number(startTime) * 1000),
				endTime: new Date(Number(endTime) * 1000),
				totalParticipants: Number(totalParticipants),
				prizePool: Number(prizePool),
				isActive,
				name
			};
		} catch (error) {
			return null;
		}
	}

	async settleCompetition(): Promise<string> {
		const currentWallet = this.getCurrentWallet();
		if (!currentWallet || !this.competitionEntity) {
			throw new Error('Wallet not connected or competition entity not initialized');
		}


		try {
			const { transaction } = await ApplySystem({
				authority: currentWallet.publicKey,
				systemId: SYSTEM_IDS.SETTLE_COMPETITION,
				entities: [
					{
						entity: this.competitionEntity,
						components: [{ componentId: COMPONENT_IDS.COMPETITION }],
					},
				],
				world: WORLD_INSTANCE_ID,
			});

			// Get fresh blockhash and set transaction properties
			const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
			transaction.recentBlockhash = latestBlockhash.blockhash;
			transaction.feePayer = currentWallet.publicKey;

			// Sign and send transaction
			let signature: string;
			if (currentWallet.signTransaction) {
				const signedTx = await currentWallet.signTransaction(transaction);
				try {
					signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
						skipPreflight: false,
						preflightCommitment: 'confirmed'
					});
				} catch (error: any) {
					if (error.name === 'SendTransactionError') {
						if (error.message?.includes('This transaction has already been processed')) {
							throw new Error('Transaction already processed. Please wait a moment before trying again.');
						}
					}
					throw error;
				}
				
				// Wait for confirmation
				await this.connection.confirmTransaction({
					signature,
					blockhash: latestBlockhash.blockhash,
					lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
				}, 'confirmed');
			} else if (this.sessionWallet) {
				// Fallback to session wallet signing
				signature = await sendAndConfirmTransaction(
					this.connection,
					transaction,
					[this.sessionWallet],
					{ commitment: 'confirmed' }
				);
			} else {
				throw new Error('No signing method available');
			}

			return signature;
		} catch (error) {
			throw error;
		}
	}

	async mintTrophyNFT(
		rank: number,
		winnerAddress: PublicKey,
		competitionId: string,
		finalPnl: number,
		totalTrades: number
	): Promise<string> {
		if (!this.wallet) {
			throw new Error('Admin wallet not initialized');
		}


		const mintKeypair = Keypair.generate();

		const [metadataPDA] = PublicKey.findProgramAddressSync(
			[
				Buffer.from('metadata'),
				new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
				mintKeypair.publicKey.toBuffer(),
			],
			new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
		);


		const associatedTokenAddress = await this.getAssociatedTokenAddress(
			mintKeypair.publicKey,
			winnerAddress
		);

		try {
			const instruction = await this.createMintTrophyInstruction(
				this.wallet.publicKey,
				winnerAddress,
				mintKeypair.publicKey,
				associatedTokenAddress,
				metadataPDA,
				rank,
				competitionId,
				finalPnl,
				totalTrades
			);

			const transaction = new Transaction().add(instruction);
			transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
			transaction.feePayer = this.wallet.publicKey;

			transaction.sign(this.wallet, mintKeypair);

			const signature = await sendAndConfirmTransaction(
				this.connection,
				transaction,
				[this.wallet, mintKeypair],
				{ commitment: 'confirmed' }
			);

			return signature;
		} catch (error) {
			throw error;
		}
	}

	async getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
		const [address] = PublicKey.findProgramAddressSync(
			[owner.toBuffer(), new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA').toBuffer(), mint.toBuffer()],
			new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
		);
		return address;
	}

	async createMintTrophyInstruction(
		authority: PublicKey,
		winner: PublicKey,
		mint: PublicKey,
		tokenAccount: PublicKey,
		metadata: PublicKey,
		rank: number,
		competitionId: string,
		finalPnl: number,
		totalTrades: number
	): Promise<any> {
		const args = {
			rank,
			competitionId,
			finalPnl: Math.floor(finalPnl * 1e8),
			totalTrades,
		};

		const accounts = {
			authority,
			winner,
			mint,
			tokenAccount,
			metadata,
			tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
			associatedTokenProgram: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
			systemProgram: new PublicKey('11111111111111111111111111111111'),
			rent: new PublicKey('SysvarRent111111111111111111111111111111111'),
			tokenMetadataProgram: new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'),
		};

		return {
			keys: [
				{ pubkey: accounts.authority, isSigner: true, isWritable: true },
				{ pubkey: accounts.winner, isSigner: false, isWritable: true },
				{ pubkey: accounts.mint, isSigner: true, isWritable: true },
				{ pubkey: accounts.tokenAccount, isSigner: false, isWritable: true },
				{ pubkey: accounts.metadata, isSigner: false, isWritable: true },
				{ pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
				{ pubkey: accounts.associatedTokenProgram, isSigner: false, isWritable: false },
				{ pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
				{ pubkey: accounts.rent, isSigner: false, isWritable: false },
				{ pubkey: accounts.tokenMetadataProgram, isSigner: false, isWritable: false },
			],
			programId: SYSTEM_IDS.SETTLE_COMPETITION,
			data: Buffer.from(JSON.stringify(args)),
		};
	}
}

export const magicBlockClient = new MagicBlockClient();
