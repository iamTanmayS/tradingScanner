/**
 * SMOKE TEST 1: Node.js Backend Connectivity
 * ============================================
 * Tests:
 *  A) REST klines from two Binance hosts
 *  B) !miniTicker@arr WebSocket — inspects raw payload, partial-update behaviour,
 *     event time (E), and field names
 *
 * Run: node smoke/node-smoke.mjs
 */

import WebSocket from 'ws';

// ─── Helpers ────────────────────────────────────────────────────────────────

const pass  = (msg) => console.log(`  ✅  ${msg}`);
const fail  = (msg) => console.log(`  ❌  ${msg}`);
const info  = (msg) => console.log(`  ℹ️   ${msg}`);
const sep   = ()    => console.log('\n' + '─'.repeat(60));

// ─── A. REST klines ──────────────────────────────────────────────────────────

async function testREST() {
  sep();
  console.log('TEST A — REST /api/v3/klines (1h, 5 candles for BTCUSDT)\n');

  const hosts = [
    'https://data-api.binance.vision',
    'https://api.binance.com',
  ];

  for (const host of hosts) {
    const url = `${host}/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=5`;
    try {
      const t0  = Date.now();
      const res = await fetch(url);
      const ms  = Date.now() - t0;

      if (!res.ok) {
        fail(`${host}  →  HTTP ${res.status} ${res.statusText}`);
        continue;
      }

      const data = await res.json();
      pass(`${host}  →  ${res.status} OK  (${ms} ms,  ${data.length} candles returned)`);

      // Print one candle so we understand the array structure
      const [openTime, open, high, low, close, baseVol,
             closeTime, quoteVol, trades] = data[0];

      info(`Sample candle fields:`);
      info(`  [0] openTime  : ${openTime}  (${new Date(openTime).toISOString()})`);
      info(`  [1] open      : ${open}`);
      info(`  [2] high      : ${high}`);
      info(`  [3] low       : ${low}`);
      info(`  [4] close     : ${close}`);
      info(`  [5] baseVol   : ${baseVol}`);
      info(`  [6] closeTime : ${closeTime}  (${new Date(closeTime).toISOString()})`);
      info(`  [7] quoteVol  : ${quoteVol}  ← USDT turnover (this is v24 in our schema)`);
      info(`  [8] trades    : ${trades}`);
    } catch (err) {
      fail(`${host}  →  ${err.message}`);
    }
  }
}

// ─── B. WebSocket !miniTicker@arr ────────────────────────────────────────────

async function testWebSocket() {
  sep();
  console.log('TEST B — WebSocket  wss://stream.binance.com:9443/ws/!miniTicker@arr\n');
  console.log('Capturing 3 consecutive messages to check partial-update behaviour…\n');

  const url = 'wss://stream.binance.com:9443/ws/!miniTicker@arr';

  return new Promise((resolve) => {
    const ws       = new WebSocket(url);
    let   msgCount = 0;
    // Track how many unique symbols appeared across messages
    const seenSymbols = new Set();
    const batchSizes  = [];

    const timeout = setTimeout(() => {
      fail('No message received within 15 seconds — possible connectivity or geo-block issue');
      ws.terminate();
      resolve();
    }, 15_000);

    ws.on('open', () => {
      pass(`WebSocket connected to ${url}`);
    });

    ws.on('message', (raw) => {
      msgCount++;
      const data = JSON.parse(raw.toString());

      // Only process first 3 messages so we can compare batch sizes
      if (msgCount > 3) { return; }

      const usdtCoins = data.filter(item => item.s.endsWith('USDT'));
      batchSizes.push(usdtCoins.length);

      // Pick the first USDT coin and print its raw fields
      const sample = usdtCoins[0];
      usdtCoins.forEach(c => seenSymbols.add(c.s));

      console.log(`  📦 Message #${msgCount}:`);
      info(`  Total symbols in this batch : ${data.length}`);
      info(`  USDT pairs in this batch    : ${usdtCoins.length}`);

      if (msgCount === 1 && sample) {
        console.log('\n  Raw fields on first USDT coin (sample):');
        info(`  s  (symbol)        : ${sample.s}`);
        info(`  e  (event type)    : ${sample.e}`);
        info(`  E  (event time ms) : ${sample.E}  → ${new Date(sample.E).toISOString()}`);
        info(`  o  (open 24h)      : ${sample.o}`);
        info(`  c  (close/last)    : ${sample.c}`);
        info(`  h  (high 24h)      : ${sample.h}`);
        info(`  l  (low 24h)       : ${sample.l}`);
        info(`  v  (base volume)   : ${sample.v}`);
        info(`  q  (quote volume)  : ${sample.q}  ← USDT turnover = v24`);
        info(`  change24h derived  : ${(((+sample.c - +sample.o) / +sample.o) * 100).toFixed(4)}%`);
        console.log('');
      }

      if (msgCount === 3) {
        clearTimeout(timeout);
        ws.close();
      }
    });

    ws.on('close', () => {
      sep();
      console.log('PARTIAL-UPDATE ANALYSIS\n');

      if (batchSizes.length === 3) {
        const [b1, b2, b3] = batchSizes;
        info(`Batch sizes (USDT pairs): msg1=${b1}  msg2=${b2}  msg3=${b3}`);

        if (b1 !== b2 || b2 !== b3) {
          pass('Batch sizes DIFFER between messages — confirms !miniTicker@arr is a');
          pass('PARTIAL UPDATE stream (only changed symbols per second), NOT a full snapshot.');
          pass('Conclusion: backend cache must MERGE each batch, never replace.');
        } else {
          info('Batch sizes are equal across 3 messages.');
          info('This may still be partial updates — coincidence or all coins moved.');
          info('The architecture.md decision to merge-and-not-replace still stands.');
        }

        const serverNow = batchSizes.length > 0 ? Date.now() : null;
        if (serverNow) {
          pass(`Smoke test completed at ${new Date().toISOString()}`);
        }
      }

      resolve();
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      fail(`WebSocket error: ${err.message}`);
      resolve();
    });
  });
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log('\n🔬  CRYPTO SCANNER — PHASE 1 NODE SMOKE TEST');
console.log('    Tests Binance REST & WebSocket connectivity from Node.js\n');

await testREST();
await testWebSocket();

sep();
console.log('\n✅  Phase 1 Node smoke test complete.\n');

