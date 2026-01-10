/**
 * API endpoint for fetching available markets for backtesting
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DomeApiClient } from '$lib/backtesting/domeApiClient';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const {
      startDate,
      endDate,
      status,
      tag,
      minVolume,
      maxVolume,
      marketStartDate,
      marketEndDate,
      fetchMode // 'list' = get closed markets list, 'backtest' = get markets for date range
    } = await request.json();

    const apiKey = env.DOME_API_KEY || '';
    if (!apiKey) {
      return json({ error: 'DOME_API_KEY not configured in .env file' }, { status: 500 });
    }

    const domeClient = new DomeApiClient(apiKey);

    // Fetch markets in batches
    const allMarkets: any[] = [];
    let offset = 0;
    const limit = 100;

    // If fetchMode is 'list', we're just getting closed markets without date filtering
    if (fetchMode === 'list') {
      while (true) {
        const batch = await domeClient.getMarkets({
          limit,
          offset,
          status: 'closed' // Only closed markets
        });

        if (batch.length === 0) break;

        allMarkets.push(...batch);
        offset += limit;

        // Limit to 500 markets for performance
        if (allMarkets.length >= 500) break;
      }
    } else {
      // Original behavior - fetch markets for backtest date range
      if (!startDate || !endDate) {
        return json({ error: 'Start date and end date are required for backtest mode' }, { status: 400 });
      }

      const backtestStartDate = new Date(startDate);
      const backtestEndDate = new Date(endDate);

      while (true) {
        const batch = await domeClient.getMarkets({
          startDate: backtestStartDate,
          endDate: backtestEndDate,
          limit,
          offset,
          status: status || 'closed' // Default to closed markets
        });

        if (batch.length === 0) break;

        allMarkets.push(...batch);
        offset += limit;

        // Limit to 500 markets for performance
        if (allMarkets.length >= 500) break;
      }
    }

    // Filter markets based on mode
    const filteredMarkets = allMarkets.filter(market => {
      // Get market start and end times
      const marketStartTime = market.start_time ? new Date(market.start_time * 1000) : null;
      const marketEndTime = market.end_time
        ? new Date(market.end_time * 1000)
        : (market.close_time ? new Date(market.close_time * 1000) : null);

      // For 'list' mode, apply minimal filtering
      if (fetchMode === 'list') {
        // Only include closed markets with outcomes
        if (market.status !== 'closed' || (!market.winning_side && !market.outcome)) {
          return false;
        }

        // Ensure market has actually ended (end_time is in the past)
        if (marketEndTime && marketEndTime > new Date()) {
          return false; // Skip markets that haven't ended yet
        }

        // Skip markets without an end time
        if (!marketEndTime) {
          return false;
        }

        // Tag filter
        if (tag) {
          const marketTags = market.tags || [];
          const hasTag = marketTags.some((marketTag: string) =>
            marketTag.toLowerCase() === tag.toLowerCase()
          );
          if (!hasTag) return false;
        }

        // Volume filters
        const marketVolume = market.volume_total || market.volume || market.volume_24h || market.total_volume || 0;
        if (minVolume && marketVolume < minVolume) return false;
        if (maxVolume && marketVolume > maxVolume) return false;

        return true;
      }

      // For backtest mode, use original filtering logic
      const backtestStartDate = new Date(startDate);
      const backtestEndDate = new Date(endDate);

      // Market must have been active (started before backtest end and ended after backtest start)
      if (marketStartTime && marketEndTime) {
        const wasActiveDuringRange =
          marketStartTime <= backtestEndDate &&
          marketEndTime >= backtestStartDate;

        if (!wasActiveDuringRange) return false;
      }

      // Tag filter
      if (tag) {
        const marketTags = market.tags || [];
        const hasTag = marketTags.some((marketTag: string) =>
          marketTag.toLowerCase() === tag.toLowerCase()
        );
        if (!hasTag) return false;
      }

      // Volume filters - check all possible volume fields
      const marketVolume = market.volume_total || market.volume || market.volume_24h || market.total_volume || 0;
      if (minVolume && marketVolume < minVolume) return false;
      if (maxVolume && marketVolume > maxVolume) return false;

      // Market date range filters
      if (marketStartDate && marketStartTime) {
        const filterStartDate = new Date(marketStartDate);
        if (marketStartTime < filterStartDate) return false;
      }
      if (marketEndDate && marketEndTime) {
        const filterEndDate = new Date(marketEndDate);
        if (marketEndTime > filterEndDate) return false;
      }

      // Only include closed markets with outcomes for backtesting
      if (status === 'closed') {
        return market.status === 'closed' && (market.winning_side || market.outcome);
      }

      return true;
    });

    // Log sample market for debugging
    if (filteredMarkets.length > 0) {
      console.log('Sample market:', JSON.stringify(filteredMarkets[0], null, 2));
    }

    // Sort by end time (most recent first)
    filteredMarkets.sort((a, b) => {
      const aEndTime = a.end_time || a.close_time || 0;
      const bEndTime = b.end_time || b.close_time || 0;
      return bEndTime - aEndTime;
    });

    console.log(`Returning ${filteredMarkets.length} markets (filtered from ${allMarkets.length})`);
    return json({ markets: filteredMarkets });
  } catch (error: any) {
    console.error('Error fetching markets:', error);
    return json(
      { error: error.message || 'An error occurred while fetching markets' },
      { status: 500 }
    );
  }
};
