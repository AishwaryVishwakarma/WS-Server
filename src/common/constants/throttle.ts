const MINUTE = 60 * 1000;

// Default budget for authenticated API use. Tracked per user
// (SessionThrottlerGuard), so an SPA firing several requests per interaction
// stays well clear while a runaway client is still capped.
export const DEFAULT_THROTTLE = {ttl: MINUTE, limit: 100};

// Public read routes are anonymous-browsable — feeds, pagination and debounced
// search legitimately burst — and are tracked per IP, so a shared-proxy IP
// gets a roomy budget.
export const PUBLIC_READ_THROTTLE = {
  default: {ttl: MINUTE, limit: 120},
};

// Auth endpoints resist credential stuffing / brute force — deliberately tight.
export const AUTH_THROTTLE = {
  default: {ttl: MINUTE, limit: 10},
};
