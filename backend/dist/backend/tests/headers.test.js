import { it, expect } from 'vitest';
it('checks Binance headers and rate limits', async () => {
    const res1 = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=50');
    console.log('api.binance.com Status:', res1.status);
    const h1 = {};
    for (const [k, v] of res1.headers.entries()) {
        if (k.includes('weight') || k.includes('rate') || k.includes('retry') || k.includes('mbx'))
            h1[k] = v;
    }
    console.log('api.binance.com Headers:', h1);
    const res2 = await fetch('https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=50');
    console.log('data-api.binance.vision Status:', res2.status);
    const h2 = {};
    for (const [k, v] of res2.headers.entries()) {
        if (k.includes('weight') || k.includes('rate') || k.includes('retry') || k.includes('mbx'))
            h2[k] = v;
    }
    console.log('data-api.binance.vision Headers:', h2);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
});
