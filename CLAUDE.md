# CLAUDE.md

Repository guidance for the Whispering Shadows backend.

## Project

NestJS 11 + TypeORM + PostgreSQL API with Redis-backed sessions. The sibling
`../WS-Web` Next.js application proxies `/api/*` here so cookies remain
first-party; do not add CORS unless the deployment architecture changes.

Reading public content is anonymous. Participation and account data require a
session. Preserve that boundary when adding routes.

## Commands

```bash
npm run start:dev          # watch-mode server
npm run build              # compile to dist/
npm run typecheck          # check production and test TypeScript
npm run lint               # ESLint with fixes
npm test                   # unit tests
npm run test:cov           # unit tests with coverage

npm run dev:infra:up       # development PostgreSQL + Redis
npm run dev:infra:down
npm run seed               # wipe and recreate development seed data

npm run test:infra:up      # integration PostgreSQL + Redis
npm run test:integration   # real app, run serially
npm run test:infra:down    # removes test volumes

npm run migration:generate -- src/database/migrations/<Name>
npm run migration:run
npm run migration:revert
```

`.env.example` targets the Docker development services. Configuration is
validated fail-closed in `src/app.module.ts`; keep new required variables and
production safety checks there.

## Architecture

- Domain modules live under `src/` (`auth`, `users`, `stories`, `comments`,
  `tags`, `notifications`, `bookmarks`, `follows`, `likes`, `series`, and
  supporting modules). Split controllers by audience when practical: public,
  private/self, and admin.
- Put application-wide middleware and filters in `src/app.setup.ts`, which is
  shared by production startup and the integration harness. Do not duplicate
  global wiring in `main.ts`.
- Authentication uses `express-session` and Redis, not JWT. Mutations require
  `SessionAuthGuard`; public reads use `OptionalSessionAuthGuard` when viewer
  identity affects the response.
- A guarded Swagger route must also declare `@ApiCookieAuth('session')`.
  Optional-session routes intentionally do not advertise required auth.
- CSRF uses `csrf-csrf` double-submit tokens bound to the session. Add an
  exemption only when the route must work without a session or the browser API
  cannot attach the header, and document the reason next to the exemption.
- Public response DTOs use the preview tier; self responses add private fields;
  admin responses add administrative fields. Serialize with
  `excludeExtraneousValues: true` and expose new fields deliberately.
- Redis-backed cross-instance behavior (sessions, notifications, presence)
  must remain safe with multiple API instances.

## Stories and feeds

- `GET /stories` has two paging modes. Supplying `page` selects numbered offset
  pagination; omitting it selects opaque-cursor keyset pagination. Do not mix
  the response envelopes.
- Feed sorts must have a stable ordering and deterministic ID tie-breaker.
  Trending uses a fixed recency window and integer engagement score so cursor
  boundaries do not drift.
- Public feed search uses the generated PostgreSQL `searchVector` and GIN index.
  Preserve the active sort order; search is a filter. When the normalized query
  has no indexable terms, use the existing escaped `ILIKE` fallback.
- Denormalized counters such as likes, comments, views, and reports must be
  updated through their owning services. Report counts use
  `src/utils/report-count.ts` to avoid drift and preserve `updatedAt`.
- An author's own `/users/me/stats/stories` (per-story lifetime totals) and
  `/users/me/stories/:id/stats` (day-bucketed views/likes/comments trend, via
  `StoriesService.getAuthorStoryBreakdown`/`.getStoryDailyStats`) reuse
  existing timestamped rows — `analytics_event` (views) and `story_like`/
  `comment`'s own `createdAt` (likes/comments) — rather than a new table, so
  history only goes back as far as those rows already do. The per-story
  endpoint is strictly self-scoped (author id must match the session, 404
  otherwise, no admin bypass) — it is not the site-wide admin analytics view.
- Public visibility is status-based. Author/admin access to non-approved work
  goes through the existing visibility service methods rather than ad hoc
  controller checks.
- Stories, users, and series each carry a `slug` (`src/utils/slug.ts`'s
  `buildSlug`: slugified title/name + a short random id fragment,
  LinkedIn/Medium-style — not Tag's bare-unique-with-409 pattern, since
  titles/names collide far more than tag names do). The public single-item
  GET route for each (`GET /stories/:slug`, `GET /users/:slug`
  [`+ /:slug/stories`], `GET /series/:slug`) resolves by slug only — a clean
  cutover, not a dual id-or-slug lookup, so a raw uuid 404s there. Every
  other route on those controllers (mutations, admin, `/users/me/...`) stays
  UUID-based via `ParseUUIDPipe`, unaffected. A story's slug regenerates
  when its title changes (`StoriesService.update`); a user's when their name
  changes (`UsersService._applyUserUpdates`) — both explicitly guarded on
  the incoming value actually differing from current, not a blanket
  `@BeforeUpdate` hook, since the slug's random suffix would otherwise
  reshuffle the public URL on any unrelated save. A series has no rename
  path, so its slug is assigned once at creation and never regenerates.

## Accounts and moderation

- Registration is OTP-gated. A real `User` and session are created only after
  confirmation. Password-reset and registration secrets are stored only as
  hashes, have bounded lifetimes, and retain anti-enumeration responses.
- Password reset invalidates all active sessions through
  `SessionRegistryService`. Login/session changes must keep that registry's TTL
  at least as long as the longest tracked session.
- Self-deletion releases identity fields before soft deletion; admin deletion
  leaves them locked. Preserve this distinction.
- Story approval, upload permissions, and digest delivery are controlled by
  `SiteSettings` and must be enforced server-side. Existing stored content is
  not retroactively changed when a toggle flips.
- Story, comment, and user reports are separate from publication/account status.
  Resolving reports clears reports without silently approving, unflagging, or
  restoring the target unless the endpoint explicitly promises that action.
- Profanity validation applies to public identity fields, not horror story or
  comment prose. Content moderation for prose uses approval and reporting.

## Membership (Patron / Founding Patron)

- `User.membershipTier` (`Free|Patron|FoundingPatron`) has two grant sources
  that both funnel through one shared core in `UsersService`: an admin's
  `PATCH /admin/users/:id` (mirroring how `role`/`isVerified` already work),
  and a real LemonSqueezy self-serve subscription via `src/billing/`. Never
  branch membership-grant logic per source — add to
  `_resolveMembershipGrant`/`_resolveGrantedTier` (private) or
  `applyMembershipChange` (the webhook's public entry point), not around them.
- `SiteSettings.membershipFeaturesEnabled` (default `false`) is the site-wide
  kill switch. Every membership-gated behavior checks both
  `membershipTier !== Free` AND `SettingsService.isMembershipFeaturesEnabled()`
  — a tier staged on an account before rollout has no effect until the toggle
  flips. **This toggle only gates starting a new checkout** (`BillingController`
  returns 403); it never gates the webhook. A subscriber who already paid keeps
  their recorded tier/status regardless of the toggle — gating the webhook on
  it would drop paid state on the floor, and pausing the LemonSqueezy store
  itself (not this toggle) is the only real stop switch for new charges.
- `User.premiumSince`, not the current `membershipTier`, is the "has this
  account ever been a member" signal. It is stamped once, on a genuine first
  grant, and never cleared by a later lapse-then-re-grant — checking the
  current tier instead would make a re-grant after a lapse indistinguishable
  from a true first grant, since a lapsed member's tier also resets to `Free`.
- Founding Patron is auto-assigned in `UsersService._resolveGrantedTier`: a
  genuine first-ever grant to `Patron` while fewer than
  `MEMBERSHIP_FOUNDING_LIMIT` (100) accounts have ever held Patron+ is
  upgraded to `FoundingPatron` instead. `User.foundingPatronSince` is the
  latch that carries this forward — checked *first*, before any other rule,
  so a lapsed Founding Patron who resubscribes (self-serve checkout can only
  ever request plain `Patron`, never `FoundingPatron` directly) comes back
  Founding rather than losing the status permanently. The cap itself is
  counted off `foundingPatronSince` (`count({where: {foundingPatronSince: Not(IsNull())}})`),
  not the current tier — counting current holders would let a churned
  Founding Patron's slot silently be reissued, exceeding the lifetime cap.
  An explicit grant of `Free` (an admin revoke, or the webhook's
  `subscription_expired` handler) always wins over the latch — "once granted,
  never lost" means a later re-grant restores it, not that the tier can never
  become `Free` while lapsed. Explicitly requesting `FoundingPatron` directly
  is always honored as-is, without recomputing eligibility.
- LemonSqueezy billing (`src/billing/`, monthly-cadence Patron only — there is
  no self-serve Founding tier): `LemonSqueezyService` is the outbound client
  (`createCheckout`, `getCustomerPortalUrl` — the portal URL is a pre-signed,
  24h-valid link fetched on demand and never cached); `enabled` gates on all of
  `LEMONSQUEEZY_API_KEY`/`STORE_ID`/`PATRON_VARIANT_ID` being configured
  (`app.module.ts` validates these four vars as all-or-nothing — a partially
  configured group throws at boot). `LemonSqueezyWebhookController`/`Service`
  verify `X-Signature` (HMAC-SHA256 over the **raw** body — `rawBody: true` in
  `main.ts`, and `crypto.timingSafeEqual` after a length check, since it
  throws rather than returning false on a length mismatch) and resolve the
  account via `meta.custom_data.user_id` (UUID-shape validated before it ever
  reaches a query — a malformed literal would otherwise throw a Postgres
  driver error, which LemonSqueezy would retry forever) falling back to
  `lemonSqueezyCustomerId`. `User.lemonSqueezySubscriptionId` (unique) is also
  the **stale-event guard**: a webhook only applies a change when the
  payload's subscription id matches it (or the account has none yet, or the
  event is `subscription_created`) — otherwise a late/retried terminal event
  for an already-superseded subscription (cancel → resubscribe → old sub's
  expiry arrives late) could downgrade a currently-paying member.
  `subscription_cancelled` mirrors status only — LemonSqueezy access
  continues through period end, so the tier is untouched; `subscription_expired`
  is the actual downgrade to `Free`. `subscription_payment_failed` is a
  deliberate no-op (LemonSqueezy, the Merchant of Record, runs its own
  dunning; `past_due` already arrives via `subscription_updated`). Every
  handler is declarative and idempotent by construction — a byte-identical
  replay produces the same call — so there is no webhook-event dedupe table.
- Guardrails that must hold for any future membership feature: never paywall
  story content itself; membership must never buy a better spot in organic
  trending/search rankings; the priority moderation queue changes queue
  *position* only, never moderation standards (same rules, just reviewed
  sooner).
- Gated behaviors, all resolved from the author's own `membershipTier`, never
  a request-supplied one:
  - `StoriesService._assertWithinPublishLimit` — the `FREE_PUBLISH_LIMIT` (10)
    publish cap is skipped entirely for Patron+.
  - `StoriesService._assertWithinDraftLimit` — a separate `FREE_DRAFT_LIMIT`
    (10) cap on private drafts, also skipped for Patron+. Independent from the
    publish cap (a Free author can have up to 10 drafts and 10 pipeline
    stories at once, 20 total) since drafts are still rows in the database.
  - `StoriesService.findAll`'s pending-queue branch — a raw SQL `CASE`
    expression orders Patron+ authors' stories first, then oldest-first
    within each tier. A 3-value string enum can't express this priority order
    via TypeORM's plain find-options `order` object (alphabetical order
    doesn't line up with priority order), so this path uses a query builder
    instead. The `CASE` expression must be registered via `addSelect` (with an
    alias) before being referenced in `orderBy`/`addOrderBy` — a bare raw
    expression passed straight to `addOrderBy` throws at query time
    (`"CASE WHEN author" alias was not found`), a failure only the real
    Postgres driver surfaces, not the mocked query builder in unit tests.
  - `StoriesService.getStoryDailyStats` — the 7/30/90-day range extends to
    180/365 for Patron+; a stale/tampered client requesting a wider range is
    silently clamped back to 90, not rejected.
  - `UsersService.recordActivity` — grants a monthly streak-freeze token
    (`streakFreezeCount`, max 1) to Patron+ and spends one automatically to
    protect `currentStreak` across a single missed day, computed lazily on the
    next activity (no scheduler exists for streaks or anything else in this
    codebase).
  - `achievements.ts`'s `unlockedTier` — a 4th tier is reachable only once
    real progress clears its threshold AND the account is Patron+; a Free
    member who already clears it stays capped at tier 3, preserving
    earned-status integrity.

## Database and TypeScript rules

- Migrations own the schema; `synchronize` stays off. After changing an entity,
  generate a migration and register it in
  `src/database/migrations/index.ts`.
- Keep `src/database/data-source.ts` aligned with `app.module.ts`, especially
  the entity and migration lists. Seed through services so hooks, hashing, and
  moderation rules execute.
- PostgreSQL email lookups must normalize to lowercase just like entity hooks.
  Use `ILIKE` when case-insensitive matching is intended.
- Import DTO classes as runtime values, never with `import type`, because Nest
  validation and Swagger metadata depend on them at runtime.
- The existing directory and filenames under `src/common/gaurds/` are
  misspelled. Match their spelling in import paths unless performing a complete,
  verified rename.
- For CommonJS `export =` packages, follow the existing default-import style.
  Trust the repository's `npm run typecheck` over editor TypeScript versions.

## Testing and verification

- Unit tests (`src/**/*.spec.ts`) use mocked dependencies and require no
  infrastructure.
- Integration tests (`test/integration/*.integration.spec.ts`) boot the real
  application against test PostgreSQL and Redis. `cleanDatabase` must continue
  refusing non-test database names.
- Behavior changes should include or update an integration test when SQL,
  sessions, CSRF, entity hooks, migrations, or cascades are involved.
- Before handing off a change, run the narrowest relevant tests, then
  `npm run typecheck` and `npm run lint`. Run `npm run build` for changes that
  affect startup, packaging, decorators, or generated output.

## Git

- Use conventional commits with one concern per commit.
- Do not add `Co-Authored-By` trailers.
- Work on the currently checked-out branch; do not assume a branch name from
  documentation.
