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
- Public visibility is status-based. Author/admin access to non-approved work
  goes through the existing visibility service methods rather than ad hoc
  controller checks.

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
