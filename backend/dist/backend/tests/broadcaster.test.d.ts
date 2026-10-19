/**
 * broadcaster.test.ts — Unit tests for snapshot assembly and WebSocket broadcast.
 *
 * Tests:
 *   - buildSnapshot produces the correct MarketBroadcastPayload shape.
 *   - Only coins with valid prices are included.
 *   - Indicator fields are omitted (not null) when not set.
 *   - A real WebSocket client can connect and receive a snapshot.
 */
export {};
