// The global ThrottlerGuard (app.module.ts) defaults to a strict 10 req/min.
// Public read routes are anonymous-browsable — feeds, pagination and
// debounced search legitimately burst well past that, so they get a more
// generous per-route budget.
export const PUBLIC_READ_THROTTLE = {
  default: {ttl: 60 * 1000, limit: 60},
};
