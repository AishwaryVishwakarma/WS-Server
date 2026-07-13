# CLAUDE.md

Guidance for working in this repository.

## Project

**Whispering Shadows** — backend API for a story-sharing site. Authors publish
stories, tag them, and comment; an admin moderation layer approves/rejects/flags
content. NestJS 11 (TypeScript) + TypeORM (MySQL) + Redis-backed sessions.

The frontend lives in the sibling repo `../ws-web` (Next.js + SCSS). It proxies
`/api/*` to this server so the session cookie stays first-party — this API needs
no CORS config. **Reading is public, participating is not**: story/tag/author
GETs use `OptionalSessionAuthGuard` (anonymous allowed; a valid session still
identifies the viewer, and stale/revoked sessions degrade to anonymous), while
every mutation sits behind `SessionAuthGuard`. Public reads carry a 60/min
`@Throttle` override on top of the global 10/min ThrottlerGuard. Tags carry a
URL `slug` generated in the entity hook, and `GET /stories` accepts
`?tag=<slug>&search=&scareLevel=&sort=newest|oldest`.

## Commands

```bash
npm run start:dev          # watch-mode dev server
npm run build              # nest build → dist/
npm run typecheck          # tsc --noEmit (use this, not just build — it also checks tests)
npm run lint               # eslint --fix over {src,test}
npm run seed               # seed the DB in .env (through the app); add `-- --fresh` to wipe first

npm run migration:generate -- src/database/migrations/<Name>  # diff entities vs DB
npm run migration:run      # apply pending migrations (also happens on app boot)
npm run migration:revert   # roll back the last one

npm test                   # unit tests (mocked, no infrastructure needed)
npm run test:cov           # unit tests + coverage

# Integration tests need Docker running:
npm run test:infra:up      # start test MySQL (:3307) + Redis (:6380)
npm run test:integration   # boots the real app against them
npm run test:infra:down    # tear down + remove volumes

npm run dev:infra:up       # dockerized dev MySQL (:3308) + Redis (:6381)
npm run dev:infra:down
```

`.env.example` defaults point at the dockerized dev infra, so
`cp .env.example .env && npm run dev:infra:up && npm run seed` works out of the box.

## Architecture

- **Per-domain modules**: `auth`, `users`, `stories`, `tags`, `comments`. Each
  domain splits controllers by audience: `public-*`, `private-*` (`/me`), `admin-*`.
- **Response DTO tiers** (via `plainToInstance(dto, entity, {excludeExtraneousValues: true})`):
  `*PreviewResponseDto` (public) → `*PrivateResponseDto` (self, adds email) →
  `*ResponseDto` (admin, adds role/flags). Follow this when adding fields.
- **`src/app.setup.ts`** applies the global `ValidationPipe`, CSRF filter, Redis
  client, and session middleware. It is shared by `main.ts` **and** the
  integration test harness — put app-level wiring here, not in `main.ts`, so
  tests exercise the same stack. It returns the Redis client.
- **Auth is session-based, not JWT.** `express-session` + `connect-redis`.
  `SessionAuthGuard` reloads the user from the DB on every request (so blocking
  or deleting a user invalidates live sessions and refreshes their role).
  `RolesGuard` + `@Roles(Role.Admin)` for admin routes.
- **CSRF**: `csrf-csrf` double-submit (`src/middlewares/csrf.ts`), token in the
  `x-csrf-token` header + a first-party cookie, bound to the session id via
  `getSessionIdentifier`. Needs `cookie-parser` (wired in `app.setup.ts`).
  Excluded for login/logout/register. `session.regenerate()` on login/register
  changes the session id, so clients must re-fetch `GET /auth/csrf-token`
  *after* authenticating. Anonymous (session-less) requests can't hold a valid
  token, so mutations without a session fail CSRF (403) before the auth guard.
- **Moderation**: stories default to `pending`; admins transition via
  `PATCH /admin/stories/:id/status`. `StoriesService.findOneVisible()` gates
  non-approved reads to author/admin. A non-admin editing a moderated story
  resets it to `pending`. `isFlagged` mirrors `status === flagged`.
- **Shared utils**: `src/utils/pagination.ts` (`paginate`, `getPaginatedResponse`
  — the `{message,data,total,page,limit,totalPages}` envelope) and
  `handle-query-error.ts` (maps MySQL duplicate → 409).

## Conventions & gotchas

- **Import DTOs as values, never `import type`.** A `type` import erases the
  runtime metadata NestJS needs, silently disabling `ValidationPipe` for that
  param. This has bitten pagination validation before.
- **Directory is misspelled `src/common/gaurds/`** with files `roles.gaurd.ts`,
  `session-auth.gaurd.ts`, and `roles.decorators.ts`. Class names are spelled
  correctly (`RolesGuard`). Match the existing (mis)spelling in import paths.
- **Config is fail-closed.** `ConfigModule.validate` in `app.module.ts` requires
  `DB_*`, `SESSION_SECRET` (≥16 chars, known example values rejected when
  `NODE_ENV=production`), and `REDIS_URL`; validates `NODE_ENV`. No silent
  fallbacks — add new required env vars here.
- **Migrations own the schema** (`synchronize` is off everywhere). They live in
  `src/database/migrations/` and run automatically on boot (`migrationsRun`).
  After changing an entity: `npm run migration:generate -- src/database/migrations/<Name>`
  (needs the dev DB reachable), then **register the new class in
  `src/database/migrations/index.ts`** — the registry is an explicit array so
  ts-jest and dist builds load identically. The CLI uses the compiled
  `dist/database/data-source.ts`; keep its options in sync with
  `app.module.ts`. Don't write raw SQL that hardcodes table/column names in
  app code, and seed **through the services** (`src/database/seed.ts`) so
  hashing, entity hooks (tag normalization/slugs, word counts), and moderation
  stay correct.
- **Editor vs CLI TypeScript**: VS Code may bundle a newer TS than the project's
  5.9. `tsconfig.json` is written to be valid under both (uses `esModuleInterop`,
  `paths` not `baseUrl`, explicit `strict: false` + `strictNullChecks`). Modules
  with CJS `export =` (express-session, csurf, supertest) use **default imports**.
  `npm run typecheck` uses the project TS — trust it over editor squiggles.

## Testing

- **Unit** (`src/**/*.spec.ts`): mocked repositories/services, no infra. Fast.
- **Integration** (`test/integration/*.integration.spec.ts`): boot the real
  `AppModule` via `createTestApp()` against dockerized MySQL/Redis. Helpers in
  `test/integration/test-utils.ts`: `createTestApp`/`closeTestApp`,
  `cleanDatabase` (refuses to run unless the DB name ends in `_test`),
  `registerUser`, `seedAdmin` (admins can't be made via the public API),
  `getCsrfToken`. Run serially (`--runInBand`).
- ESLint disables the `no-unsafe-*` rules for `*.spec.ts` / `test/**` (mocks are
  inherently `any`-shaped). Keep production code strict.
- When changing behavior, add/adjust an integration test — mocked tests won't
  catch SQL constraints, entity hooks, cascades, or session/CSRF issues.

## Git

- Conventional commits, one concern per commit. End messages with
  `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Work happens directly on `master`. The GitHub repo was renamed to `WS-Server`;
  the local remote still says `ws-server` and redirects (harmless).

## Known gaps (not yet addressed)

The main known gaps are closed: migrations, graceful shutdown with Redis
`quit()`, the throttle-exempt `GET /health` probe, GitHub Actions CI, a global
`AllExceptionsFilter` + request-logging interceptor (wired in `app.setup.ts`),
production Dockerfiles for both repos, Swagger docs at `/docs` (via the
`@nestjs/swagger` CLI plugin in `nest-cli.json`, mounted in `main.ts`), and
`csurf` replaced by the maintained `csrf-csrf`. Rate limiting is tiered (`src/common/constants/throttle.ts`): a per-user
default (100/min, tracked by session id via `SessionThrottlerGuard` so it
survives the shared-proxy IP), a strict 10/min on login/register
(brute-force), and a 120/min public-read override; `trust proxy` is set for
the anonymous IP fallback. Remaining nice-to-haves: no request-id correlation,
no metrics.
