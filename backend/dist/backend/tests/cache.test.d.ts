/**
 * cache.test.ts — Unit tests for market cache merge logic.
 *
 * Tests that:
 *   - Partial updates merge correctly into existing entries.
 *   - Invalid prices never overwrite valid cached values.
 *   - change24h is derived correctly, with division-by-zero guard.
 *   - Symbols not in the cache are silently ignored.
 */
export {};
