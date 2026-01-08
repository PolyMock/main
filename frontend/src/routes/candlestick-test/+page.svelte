<script lang="ts">
  import { onMount } from 'svelte';

  let candlesticks: any[] = [];
  let loading = false;
  let error = '';

  // Working market found from our search
  const TEST_MARKET = {
    title: 'Will Donald Trump be inaugurated?',
    conditionId: '0xc3d4155148681756bfe67bb41d8d0882a8a122e7d3762b3591bf6598c9bd198b',
    volume: '$400M+'
  };

  async function testCandlesticks() {
    loading = true;
    error = '';
    candlesticks = [];

    try {
      // Use specific date range for this market (Jan 7-14, 2025)
      // The market closed on Jan 14, 2025, so we need data from before that
      const endTime = Math.floor(new Date('2025-01-15').getTime() / 1000);
      const startTime = Math.floor(new Date('2025-01-07').getTime() / 1000);

      console.log('Fetching candlesticks via API...');
      console.log('Date range:', new Date(startTime * 1000).toISOString(), 'to', new Date(endTime * 1000).toISOString());

      const response = await fetch(
        `/api/candlesticks/${TEST_MARKET.conditionId}?startTime=${startTime}&endTime=${endTime}&interval=1440`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch candlesticks');
      }

      const data = await response.json();
      console.log('Candlesticks received:', data);
      candlesticks = data.candlesticks || [];

      if (candlesticks.length === 0) {
        error = 'No candlestick data returned. The market may not have data for this period.';
      }
    } catch (err: any) {
      error = err.message || 'Failed to fetch candlesticks';
      console.error('Error:', err);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    testCandlesticks();
  });
</script>

<div class="page-container">
  <div class="header">
    <h1>Candlestick Data Test</h1>
    <p>Testing real candlestick data from Dome API</p>
  </div>

  <div class="market-info">
    <h2>Test Market</h2>
    <p><strong>Title:</strong> {TEST_MARKET.title}</p>
    <p><strong>Condition ID:</strong> <code>{TEST_MARKET.conditionId}</code></p>
    <p><strong>Volume:</strong> {TEST_MARKET.volume}</p>
  </div>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading candlestick data...</p>
    </div>
  {/if}

  {#if error}
    <div class="error">
      <h3>Error</h3>
      <p>{error}</p>
    </div>
  {/if}

  {#if !loading && !error && candlesticks.length > 0}
    <div class="success">
      <h3>✅ Success! Found {candlesticks.length} candlesticks</h3>

      <div class="candlesticks-container">
        <h4>Candlestick Data:</h4>
        {#each candlesticks as candle, index}
          <div class="candlestick-card">
            <h5>Candle {index + 1}</h5>
            <div class="data-row">
              <span class="label">Timestamp:</span>
              <span class="value">{new Date(candle.timestamp).toLocaleString()}</span>
            </div>
            <div class="data-row">
              <span class="label">Open:</span>
              <span class="value">${candle.open.toFixed(4)}</span>
            </div>
            <div class="data-row">
              <span class="label">High:</span>
              <span class="value">${candle.high.toFixed(4)}</span>
            </div>
            <div class="data-row">
              <span class="label">Low:</span>
              <span class="value">${candle.low.toFixed(4)}</span>
            </div>
            <div class="data-row">
              <span class="label">Close:</span>
              <span class="value">${candle.close.toFixed(4)}</span>
            </div>
            <div class="data-row">
              <span class="label">Volume:</span>
              <span class="value">{candle.volume.toLocaleString()}</span>
            </div>

            <!-- Simple price movement visual -->
            <div class="price-bar">
              <div class="bar {candle.close >= candle.open ? 'green' : 'red'}"
                   style="height: {Math.abs(candle.close - candle.open) * 100}px; min-height: 2px;">
              </div>
            </div>
          </div>
        {/each}
      </div>

      <div class="json-output">
        <h4>Raw JSON (first candlestick):</h4>
        <pre>{JSON.stringify(candlesticks[0], null, 2)}</pre>
      </div>
    </div>
  {/if}

  <div class="actions">
    <button on:click={testCandlesticks} disabled={loading}>
      {loading ? 'Loading...' : 'Reload Test'}
    </button>
    <a href="/backtesting" class="back-link">← Back to Backtesting</a>
  </div>
</div>

<style>
  .page-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 40px 20px;
    color: white;
  }

  .header {
    text-align: center;
    margin-bottom: 40px;
  }

  .header h1 {
    font-size: 36px;
    font-weight: bold;
    margin-bottom: 10px;
  }

  .header p {
    color: #8b92ab;
    font-size: 18px;
  }

  .market-info {
    background: #1e2537;
    padding: 24px;
    border-radius: 12px;
    margin-bottom: 30px;
  }

  .market-info h2 {
    font-size: 24px;
    margin-bottom: 16px;
  }

  .market-info p {
    margin: 8px 0;
    color: #b0b8cc;
  }

  .market-info code {
    background: #0f1419;
    padding: 4px 8px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 14px;
  }

  .loading {
    text-align: center;
    padding: 60px 20px;
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #2a2f45;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 20px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error {
    background: #3d1f1f;
    border: 2px solid #ef4444;
    padding: 24px;
    border-radius: 12px;
    margin-bottom: 30px;
  }

  .error h3 {
    color: #ef4444;
    margin-bottom: 12px;
  }

  .success {
    background: #1a2e1a;
    border: 2px solid #22c55e;
    padding: 24px;
    border-radius: 12px;
    margin-bottom: 30px;
  }

  .success h3 {
    color: #22c55e;
    margin-bottom: 20px;
  }

  .candlesticks-container {
    margin-top: 24px;
  }

  .candlesticks-container h4 {
    font-size: 20px;
    margin-bottom: 16px;
  }

  .candlestick-card {
    background: #0f1419;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 16px;
  }

  .candlestick-card h5 {
    font-size: 16px;
    color: #3b82f6;
    margin-bottom: 12px;
  }

  .data-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #2a2f45;
  }

  .data-row:last-of-type {
    border-bottom: none;
  }

  .label {
    font-weight: 600;
    color: #8b92ab;
  }

  .value {
    font-family: monospace;
    color: white;
  }

  .price-bar {
    margin-top: 16px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    height: 100px;
  }

  .bar {
    width: 40px;
    border-radius: 4px 4px 0 0;
  }

  .bar.green {
    background: #22c55e;
  }

  .bar.red {
    background: #ef4444;
  }

  .json-output {
    margin-top: 32px;
    padding-top: 32px;
    border-top: 1px solid #2a2f45;
  }

  .json-output h4 {
    font-size: 18px;
    margin-bottom: 12px;
  }

  .json-output pre {
    background: #0f1419;
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 13px;
    line-height: 1.5;
  }

  .actions {
    display: flex;
    gap: 16px;
    justify-content: center;
    align-items: center;
    margin-top: 32px;
  }

  button {
    padding: 12px 32px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  button:hover:not(:disabled) {
    background: #2563eb;
    transform: translateY(-2px);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .back-link {
    color: #3b82f6;
    text-decoration: none;
    font-size: 16px;
    font-weight: 600;
    transition: color 0.2s;
  }

  .back-link:hover {
    color: #2563eb;
  }
</style>
