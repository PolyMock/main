import { Connection, PublicKey } from '@solana/web3.js';
import { GetCommitmentSignature } from '@magicblock-labs/ephemeral-rollups-sdk';


const MAGICBLOCK_RPC = 'https://rpc.magicblock.app/devnet/';
const SOLANA_DEVNET_RPC = 'https://api.devnet.solana.com';
const ER_RPC = 'https://devnet.magicblock.app';

export class ERVerification {
	private magicblockConnection: Connection;
	private solanaConnection: Connection;
	private erConnection: Connection;

	constructor() {
		this.magicblockConnection = new Connection(MAGICBLOCK_RPC, 'confirmed');
		this.solanaConnection = new Connection(SOLANA_DEVNET_RPC, 'confirmed');
		this.erConnection = new Connection(ER_RPC, 'confirmed');
	}

	/**
	 * Check if an account exists on the ER
	 */
	async isAccountOnER(accountPDA: PublicKey): Promise<boolean> {
		try {
			const accountInfo = await this.erConnection.getAccountInfo(accountPDA);
			return accountInfo !== null;
		} catch (error) {
			console.error('Error checking ER account:', error);
			return false;
		}
	}

	/**
	 * Check if an account exists on main chain
	 */
	async isAccountOnMainChain(accountPDA: PublicKey): Promise<boolean> {
		try {
			const accountInfo = await this.solanaConnection.getAccountInfo(accountPDA);
			return accountInfo !== null;
		} catch (error) {
			console.error('Error checking main chain account:', error);
			return false;
		}
	}

	/**
	 * Comprehensive account status check
	 */
	async getAccountStatus(accountPDA: PublicKey): Promise<{
		onER: boolean;
		onMainChain: boolean;
		status: 'er-only' | 'main-only' | 'both' | 'none';
	}> {
		const [onER, onMainChain] = await Promise.all([
			this.isAccountOnER(accountPDA),
			this.isAccountOnMainChain(accountPDA),
		]);

		let status: 'er-only' | 'main-only' | 'both' | 'none';
		if (onER && onMainChain) {
			status = 'both';
		} else if (onER) {
			status = 'er-only';
		} else if (onMainChain) {
			status = 'main-only';
		} else {
			status = 'none';
		}

		return { onER, onMainChain, status };
	}

	/**
	 * Get commitment signature for an ER transaction
	 */
	async getERCommitment(transactionSignature: string): Promise<string | null> {
		try {
			const commitSig = await GetCommitmentSignature(
				transactionSignature,
				this.erConnection
			);
			return commitSig;
		} catch (error) {
			console.error('Error getting ER commitment:', error);
			return null;
		}
	}

	/**
	 * Measure transaction speed to detect ER usage
	 */
	async measureTransactionSpeed(
		txPromise: Promise<string>
	): Promise<{
		signature: string;
		timeMs: number;
		likelyER: boolean;
	}> {
		const startTime = performance.now();
		const signature = await txPromise;
		const endTime = performance.now();
		const timeMs = endTime - startTime;


		const likelyER = timeMs < 1000;

		return { signature, timeMs, likelyER };
	}


	async compareAccountData(accountPDA: PublicKey): Promise<{
		dataSame: boolean;
		erData: Buffer | null;
		mainChainData: Buffer | null;
		lastModifiedSlotER: number | null;
		lastModifiedSlotMain: number | null;
	}> {
		try {
			const [erAccountInfo, mainAccountInfo] = await Promise.all([
				this.erConnection.getAccountInfo(accountPDA),
				this.solanaConnection.getAccountInfo(accountPDA),
			]);

			const erData = erAccountInfo?.data || null;
			const mainChainData = mainAccountInfo?.data || null;

			const dataSame =
				erData && mainChainData
					? Buffer.compare(erData, mainChainData) === 0
					: erData === mainChainData;

			return {
				dataSame,
				erData,
				mainChainData,
				lastModifiedSlotER: null, // AccountInfo doesn't have slot property
				lastModifiedSlotMain: null, // AccountInfo doesn't have slot property
			};
		} catch (error) {
			console.error('Error comparing account data:', error);
			return {
				dataSame: true,
				erData: null,
				mainChainData: null,
				lastModifiedSlotER: null,
				lastModifiedSlotMain: null,
			};
		}
	}

	/**
	 * Verify transaction execution location
	 */
	async verifyTransactionLocation(signature: string): Promise<{
		onER: boolean;
		onMainChain: boolean;
		location: 'er' | 'main-chain' | 'both' | 'unknown';
	}> {
		try {
			const [erTx, mainTx] = await Promise.all([
				this.erConnection.getTransaction(signature, {
					maxSupportedTransactionVersion: 0,
				}),
				this.solanaConnection.getTransaction(signature, {
					maxSupportedTransactionVersion: 0,
				}),
			]);

			const onER = erTx !== null;
			const onMainChain = mainTx !== null;

			let location: 'er' | 'main-chain' | 'both' | 'unknown';
			if (onER && onMainChain) {
				location = 'both'; 
			} else if (onER) {
				location = 'er';
			} else if (onMainChain) {
				location = 'main-chain';
			} else {
				location = 'unknown';
			}

			return { onER, onMainChain, location };
		} catch (error) {
			console.error('Error verifying transaction location:', error);
			return { onER: false, onMainChain: false, location: 'unknown' };
		}
	}

	/**
	 * Complete ER verification for a transaction
	 */
	async verifyERTransaction(
		signature: string,
		accountPDA: PublicKey
	): Promise<{
		signature: string;
		usedER: boolean;
		evidence: {
			txLocation: 'er' | 'main-chain' | 'both' | 'unknown';
			accountOnER: boolean;
			commitmentSignature: string | null;
			accountStatus: string;
		};
	}> {
		const [txLocation, accountStatus, commitSig] = await Promise.all([
			this.verifyTransactionLocation(signature),
			this.getAccountStatus(accountPDA),
			this.getERCommitment(signature),
		]);

		const usedER =
			txLocation.location === 'er' ||
			txLocation.location === 'both' ||
			accountStatus.onER;

		return {
			signature,
			usedER,
			evidence: {
				txLocation: txLocation.location,
				accountOnER: accountStatus.onER,
				commitmentSignature: commitSig,
				accountStatus: accountStatus.status,
			},
		};
	}

	/**
	 * Log comprehensive ER verification to console
	 */
	async logERVerification(signature: string, accountPDA: PublicKey): Promise<void> {
		console.group('🔍 Ephemeral Rollups Verification');

		const verification = await this.verifyERTransaction(signature, accountPDA);

		console.log('Transaction:', signature);
		console.log('Account:', accountPDA.toString());
		console.log('\n Results:');
		console.log('   Used ER:', verification.usedER ? 'YES' : 'NO');
		console.log('   Transaction Location:', verification.evidence.txLocation);
		console.log('   Account on ER:', verification.evidence.accountOnER ? 'YES' : 'NO');
		console.log('   Account Status:', verification.evidence.accountStatus);

		if (verification.evidence.commitmentSignature) {
			console.log('   Commitment Signature:', verification.evidence.commitmentSignature);
			console.log('   PROOF: Transaction committed from ER to main chain!');
		}

		if (verification.usedER) {
			console.log('\n CONFIRMED: This transaction used Ephemeral Rollups! 🚀');
		} else {
			console.log('\n  This transaction did NOT use Ephemeral Rollups');
		}

		console.groupEnd();
	}
}

// Export singleton instance
export const erVerification = new ERVerification();

// Helper function for easy verification
export async function verifyER(signature: string, accountPDA: PublicKey) {
	return await erVerification.logERVerification(signature, accountPDA);
}
