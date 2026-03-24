/**
 * POST /api/backtest/run
 *
 * Proxies the backtest request to the Fly.io Rust backtest engine.
 * Streams NDJSON responses (progress + result) back to the client.
 */

import { BACKTEST_ENGINE_URL } from '$env/static/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const {
		markets,
		strategyType,
		strategyCode,
		initialCash = 10000,
		reimburseOpenPositions = false,
		priceInf = null,
		priceSup = null,
		position = null,
		timestampStart = null,
		timestampEnd = null,
		strategyParams = null,
		stopLoss = null,
		takeProfit = null,
		trailingStop = null,
		maxHoldHours = null,
	} = body;

	if (!markets?.length) {
		return new Response(
			JSON.stringify({ type: 'error', error: 'No markets provided' }) + '\n',
			{
				status: 400,
				headers: { 'Content-Type': 'application/x-ndjson' },
			}
		);
	}

	// Build the payload matching what the Rust server expects (camelCase)
	const toStr = (v: unknown): string | null =>
		v == null ? null : Array.isArray(v) ? v[0]?.toString() ?? null : String(v);

	console.log('[backtest] Proxying to Fly.io:', JSON.stringify({
		strategyType, initialCash, reimburseOpenPositions,
		strategyParams, stopLoss, takeProfit, trailingStop, maxHoldHours,
	}));

	const payload = {
		markets: markets.slice(0, 15).map((m: Record<string, unknown>) => {
			const outcomePrices = m.outcomePrices;
			let leftPrice: string | null = null;
			let rightPrice: string | null = null;
			if (Array.isArray(outcomePrices) && outcomePrices.length >= 2) {
				leftPrice = String(outcomePrices[0]);
				rightPrice = String(outcomePrices[1]);
			}
			return {
				conditionId: toStr(m.conditionId || m.id) || '',
				question: toStr(m.question || m.title),
				slug: toStr(m.slug),
				volume: typeof m.volume === 'number' ? m.volume : 0,
				category: toStr(m.category) || 'unknown',
				outcomes: m.outcomes,
				clobTokenIds: Array.isArray(m.clobTokenIds) ? m.clobTokenIds.map(String) : null,
				resolvedOutcome: toStr(m.resolvedOutcome),
				endDate: toStr(m.endDate || m.end_date_iso),
				leftTokenId: toStr(m.leftTokenId),
				rightTokenId: toStr(m.rightTokenId),
				leftPrice,
				rightPrice,
			};
		}),
		strategyType,
		strategyCode,
		initialCash,
		reimburseOpenPositions,
		maxTradesPerMarket: 200000,
		priceInf,
		priceSup,
		position,
		timestampStart,
		timestampEnd,
		strategyParams: strategyParams ?? undefined,
		stopLoss: stopLoss ?? undefined,
		takeProfit: takeProfit ?? undefined,
		trailingStop: trailingStop ?? undefined,
		maxHoldHours: maxHoldHours ?? undefined,
	};

	try {
		const engineResponse = await fetch(`${BACKTEST_ENGINE_URL}/backtest/run`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		if (!engineResponse.ok || !engineResponse.body) {
			const errText = await engineResponse.text().catch(() => 'Unknown error');
			return new Response(
				JSON.stringify({ type: 'error', error: `Engine error (${engineResponse.status}): ${errText}` }) + '\n',
				{
					status: 502,
					headers: { 'Content-Type': 'application/x-ndjson' },
				}
			);
		}

		// Stream the NDJSON response directly from Fly.io to the client
		return new Response(engineResponse.body, {
			headers: {
				'Content-Type': 'application/x-ndjson',
				'Transfer-Encoding': 'chunked',
				'Cache-Control': 'no-cache',
			},
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('[backtest] Failed to reach engine:', message);
		return new Response(
			JSON.stringify({ type: 'error', error: `Failed to reach backtest engine: ${message}` }) + '\n',
			{
				status: 502,
				headers: { 'Content-Type': 'application/x-ndjson' },
			}
		);
	}
};
