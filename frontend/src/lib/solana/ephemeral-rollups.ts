import {
	Connection,
	PublicKey,
	Transaction,
	LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
	createDelegateInstruction,
	createUndelegateInstruction,
} from '@magicblock-labs/ephemeral-rollups-sdk';
import { PUBLIC_SOLANA_PROGRAM_ID } from '$env/static/public';

// RPC Endpoints
const MAGICBLOCK_MAINNET_RPC = 'https://rpc.magicblock.app/devnet/';
const SOLANA_DEVNET_RPC = 'https://api.devnet.solana.com';
const EPHEMERAL_ROLLUP_RPC = 'https://devnet.magicblock.app';

export class EphemeralRollupsService {
	private mainConnection: Connection;
	private erConnection: Connection;
	private solanaConnection: Connection;

	constructor() {
	
		this.mainConnection = new Connection(MAGICBLOCK_MAINNET_RPC, 'confirmed');

		
		this.erConnection = new Connection(EPHEMERAL_ROLLUP_RPC, 'confirmed');

		
		this.solanaConnection = new Connection(SOLANA_DEVNET_RPC, 'confirmed');
	}

	/**
	 * Get the main connection
	 */
	getMainConnection(): Connection {
		return this.mainConnection;
	}

	/**
	 * Get the ephemeral rollup connection
	 */
	getERConnection(): Connection {
		return this.erConnection;
	}

	/**
	 * Get the Solana connection 
	 */
	getSolanaConnection(): Connection {
		return this.solanaConnection;
	}

	/**
	 * Delegate an account to the ephemeral rollup
	 * @param wallet - The wallet adapter
	 * @param accountPDA - The PDA to delegate
	 * @param commitmentLevel 
	 */
	async delegateAccount(
		wallet: any,
		accountPDA: PublicKey,
		commitmentLevel: 'processed' | 'confirmed' | 'finalized' = 'finalized'
	): Promise<string> {
		try {
			if (!wallet || !wallet.publicKey) {
				throw new Error('Wallet not connected');
			}

			const payer = wallet.publicKey;

			// Create the delegation instruction
			const delegateIx = createDelegateInstruction({
				payer,
				delegatedAccount: accountPDA,
				ownerProgram: new PublicKey(PUBLIC_SOLANA_PROGRAM_ID),
				commitmentLevel,
			});

			// Create transaction
			const transaction = new Transaction().add(delegateIx);

			// Get latest blockhash
			const { blockhash, lastValidBlockHeight } = await this.mainConnection.getLatestBlockhash();
			transaction.recentBlockhash = blockhash;
			transaction.feePayer = payer;

			// Sign and send transaction
			const signedTx = await wallet.signTransaction(transaction);
			const signature = await this.mainConnection.sendRawTransaction(signedTx.serialize());

			// Confirm transaction
			await this.mainConnection.confirmTransaction({
				signature,
				blockhash,
				lastValidBlockHeight,
			});

			console.log('Account delegated to ER:', signature);
			return signature;
		} catch (error) {
			console.error('Error delegating account:', error);
			throw error;
		}
	}

	/**
	 * Undelegate an account from the ephemeral rollup
	 * @param wallet - The wallet adapter
	 * @param accountPDA - The PDA to undelegate
	 */
	async undelegateAccount(
		wallet: any,
		accountPDA: PublicKey
	): Promise<string> {
		try {
			if (!wallet || !wallet.publicKey) {
				throw new Error('Wallet not connected');
			}

			const payer = wallet.publicKey;

			// Create the undelegation instruction
			const undelegateIx = createUndelegateInstruction({
				payer,
				delegatedAccount: accountPDA,
				ownerProgram: new PublicKey(PUBLIC_SOLANA_PROGRAM_ID),
			});

			// Create transaction
			const transaction = new Transaction().add(undelegateIx);

			// Get latest blockhash
			const { blockhash, lastValidBlockHeight } = await this.mainConnection.getLatestBlockhash();
			transaction.recentBlockhash = blockhash;
			transaction.feePayer = payer;

			// Sign and send transaction
			const signedTx = await wallet.signTransaction(transaction);
			const signature = await this.mainConnection.sendRawTransaction(signedTx.serialize());

			// Confirm transaction
			await this.mainConnection.confirmTransaction({
				signature,
				blockhash,
				lastValidBlockHeight,
			});

			console.log('Account undelegated from ER:', signature);
			return signature;
		} catch (error) {
			console.error('Error undelegating account:', error);
			throw error;
		}
	}

	/**
	 * Check if an account is delegated to the ephemeral rollup
	 * @param accountPDA - The PDA to check
	 */
	async isAccountDelegated(accountPDA: PublicKey): Promise<boolean> {
		try {
			// Check if account exists on ER
			const accountInfo = await this.erConnection.getAccountInfo(accountPDA);
			return accountInfo !== null;
		} catch (error) {
			console.error('Error checking delegation status:', error);
			return false;
		}
	}

	/**
	 * Send a transaction to the ephemeral rollup
	 * This should be used for high-frequency operations
	 */
	async sendERTransaction(
		wallet: any,
		transaction: Transaction
	): Promise<string> {
		try {
			if (!wallet || !wallet.publicKey) {
				throw new Error('Wallet not connected');
			}

			// Get latest blockhash from ER connection
			const { blockhash, lastValidBlockHeight } = await this.erConnection.getLatestBlockhash();
			transaction.recentBlockhash = blockhash;
			transaction.feePayer = wallet.publicKey;

			// Sign and send transaction using ER connection
			const signedTx = await wallet.signTransaction(transaction);
			const signature = await this.erConnection.sendRawTransaction(signedTx.serialize());

			// Confirm on ER
			await this.erConnection.confirmTransaction({
				signature,
				blockhash,
				lastValidBlockHeight,
			});

			console.log('ER transaction sent:', signature);
			return signature;
		} catch (error) {
			console.error('Error sending ER transaction:', error);
			throw error;
		}
	}

	/**
	 * Send a transaction to the main chain
	 */
	async sendMainChainTransaction(
		wallet: any,
		transaction: Transaction
	): Promise<string> {
		try {
			if (!wallet || !wallet.publicKey) {
				throw new Error('Wallet not connected');
			}

			// Get latest blockhash from main connection
			const { blockhash, lastValidBlockHeight } = await this.mainConnection.getLatestBlockhash();
			transaction.recentBlockhash = blockhash;
			transaction.feePayer = wallet.publicKey;

			// Sign and send transaction
			const signedTx = await wallet.signTransaction(transaction);
			const signature = await this.mainConnection.sendRawTransaction(signedTx.serialize());

			// Confirm transaction
			await this.mainConnection.confirmTransaction({
				signature,
				blockhash,
				lastValidBlockHeight,
			});

			console.log('Main chain transaction sent:', signature);
			return signature;
		} catch (error) {
			console.error('Error sending main chain transaction:', error);
			throw error;
		}
	}

	/**
	 * Get SOL balance from Solana devnet 
	 */
	async getSolBalance(publicKey: PublicKey): Promise<number> {
		try {
			const balance = await this.solanaConnection.getBalance(publicKey);
			return balance / LAMPORTS_PER_SOL;
		} catch (error) {
			console.error('Error getting SOL balance:', error);
			return 0;
		}
	}
}

// Export singleton instance
export const ephemeralRollupsService = new EphemeralRollupsService();
