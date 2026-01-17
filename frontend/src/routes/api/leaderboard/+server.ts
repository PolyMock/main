import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { polymarketService } from '$lib/solana/polymarket-service';
import { polymarketClient } from '$lib/polymarket';
import { PublicKey } from '@solana/web3.js';
import { browser } from '$app/environment';

interface LeaderboardEntry {
	rank: number;
	name: string;
	walletAddress: string;
	profitLoss: number;
	volume: number;
	picture?: string;
}

/**
 * Get all users from localStorage who have linked their wallet to Google account
 */
function getAllLinkedUsers(): Map<string, { name: string; picture: string; email: string }> {
	const linkedUsers = new Map<string, { name: string; picture: string; email: string }>();

	// In server-side, we can't access localStorage, but we can return empty map
	// In production, this should be stored in a database
	// For now, we'll check if auth data exists in the request context

	return linkedUsers;
}

/**
 * Fetch real leaderboard data from blockchain
 */
async function getLeaderboardData(timeframe: string): Promise<LeaderboardEntry[]> {
	try {

		// Get all user accounts from the blockchain
		const userAccounts = await polymarketService.getAllUserAccounts();


		if (userAccounts.length === 0) {
			return [];
		}

		// Calculate P&L and volume for each user
		const leaderboardData: Array<{
			walletAddress: string;
			profitLoss: number;
			volume: number;
			name: string;
			picture: string;
		}> = [];

		for (const { publicKey, account } of userAccounts) {
			const walletAddress = account.owner.toString();

			// Get user positions
			const positions = await polymarketService.getUserPositions(account.owner);

			let totalProfitLoss = 0;
			let totalVolume = 0;

			// Calculate P&L and volume from positions
			for (const position of positions) {
				const amountUsdc = position.amountUsdc.toNumber() / 1_000_000;
				const shares = position.shares.toNumber() / 1_000_000;
				const pricePerShare = position.pricePerShare.toNumber() / 1_000_000;
				const predictionType = 'yes' in position.predictionType ? 'Yes' : 'No';

				totalVolume += amountUsdc;

				// Get current price from Polymarket API
				try {
					const currentPrice = await polymarketClient.getPositionCurrentPrice(
						position.marketId,
						predictionType
					);

					if (currentPrice !== null) {
						const currentValue = shares * currentPrice;
						const pnl = currentValue - amountUsdc;
						totalProfitLoss += pnl;
					}
				} catch (error) {
					console.error(`Error fetching price for market ${position.marketId}:`, error);
					// If we can't get current price, assume no profit/loss
				}
			}

			// Try to get user info from linked Google accounts
			// In production, this would query a database
			// For now, use wallet address as name
			const shortAddress = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;

			leaderboardData.push({
				walletAddress,
				profitLoss: totalProfitLoss,
				volume: totalVolume,
				name: shortAddress, // Will be replaced if user has linked Google account
				picture: `https://api.dicebear.com/7.x/avataaars/svg?seed=${walletAddress}`,
			});
		}

		// Sort by profit/loss descending
		leaderboardData.sort((a, b) => b.profitLoss - a.profitLoss);

		// Add ranks
		const rankedLeaderboard: LeaderboardEntry[] = leaderboardData.map((entry, index) => ({
			rank: index + 1,
			...entry,
		}));


		return rankedLeaderboard;
	} catch (error) {
		console.error('Error generating leaderboard:', error);
		throw error;
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const timeframe = url.searchParams.get('timeframe') || 'monthly';

	try {
		const leaderboard = await getLeaderboardData(timeframe);

		return json({
			success: true,
			timeframe,
			leaderboard,
			totalTraders: leaderboard.length
		});
	} catch (error: any) {
		console.error('Error fetching leaderboard:', error);
		return json(
			{
				success: false,
				error: error.message || 'Failed to fetch leaderboard',
				leaderboard: []
			},
			{ status: 500 }
		);
	}
};
