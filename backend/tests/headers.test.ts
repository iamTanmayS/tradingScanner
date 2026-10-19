import { it, expect } from 'vitest';

it('checks exchangeInfo across endpoints', async () => {
  const endpoints = [
    'https://data-api.binance.vision/api/v3/exchangeInfo',
    'https://api1.binance.com/api/v3/exchangeInfo',
    'https://api.binance.com/api/v3/exchangeInfo',
  ];
  for (const ep of endpoints) {
    const res = await fetch(ep, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });
    console.log(ep, 'status:', res.status);
    expect(res.status).toBe(200);
  }
});
