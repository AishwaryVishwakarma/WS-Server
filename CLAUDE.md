# CLAUDE.md

Guidance for working in this repository.

## Project

**Whispering Shadows** — backend API for a story-sharing site. Authors publish
stories, tag them, and comment; an admin moderation layer approves/rejects/flags
content. NestJS 11 (TypeScript) + TypeORM (MySQL) + Redis-backed sessions.

## Commands

```bash
npm run start:dev          # watch-mode dev server
npm run build              # nest build → dist/
npm run typecheck          # tsc --noEmit (use this, not just build — it also checks tests)
npm run lint               # eslint --fix over {src,test}
npm run seed               # seed the DB in .env (through the app); add `-- --fresh` to wipe first

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
- **CSRF**: `csurf` in session mode (`cookie: false`, token in `x-csrf-token`
  header). Excluded for login/logout/register. `session.regenerate()` on
  login/register wipes the csrf secret, so clients must re-fetch
  `GET /auth/csrf-token` *after* authenticating.
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
- **TypeORM `synchronize` owns the schema** (on when `NODE_ENV !== 'production'`);
  there are **no migrations**. Entities are the single source of truth. Don't
  write raw SQL that hardcodes table/column names, and seed **through the
  services** (`src/database/seed.ts`) so hashing, entity hooks (tag
  normalization, excerpts), and moderation stay correct.
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

No migrations, no graceful shutdown / Redis `quit()` on SIGTERM, no `/health`
endpoint, no global exception filter or request logging, no CI, no app
Dockerfile, no Swagger/OpenAPI, and `csurf` is deprecated. Tackle the
migrations + graceful-shutdown + health-check trio before any real deployment.
