/**
 * Shared TypeScript contracts for the Real-Time Crypto Scanner.
 *
 * These types are used by both the backend (ingestion hub) and the
 * frontend (scanner engine). Keep them in sync — changing a field here
 * requires updating the backend serializer and the frontend consumer.
 *
 * Convention for unavailable indicators:
 *   Use `undefined` (omit the field), never `null` or `0`.
 *   Zero is a valid numerical result; it must not represent "missing data".
 */
export {};
