// Shared by the express-session cookie config (app.setup.ts) and
// SessionRegistryService's per-user index TTL, so the two can never drift.
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 1 day
