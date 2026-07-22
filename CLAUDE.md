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
`?tag=<slug>&search=&scareLevel=&sort=newest|oldest|most-commented`. It is
**dual-mode paging**: an explicit `?page=` returns the numbered offset envelope
(`{data,total,page,totalPages}`) for the tag/author shelves, while *omitting*
`page` returns a keyset page (`{data,nextCursor,total?}`) for the infinite feed
— an opaque `?cursor=` seeks past the last row via `(sortKey, id)` instead of a
growing OFFSET, and `total` rides only the first page. See
`src/stories/story-cursor.ts` and `StoriesService.findApprovedFeed`.

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
npm run test:infra:up      # start test MySQL (:3311) + Redis (:6381)
npm run test:integration   # boots the real app against them
npm run test:infra:down    # tear down + remove volumes

npm run dev:infra:up       # dockerized dev MySQL (:3310) + Redis (:6380)
npm run dev:infra:down
```

`.env.example` defaults point at the dockerized dev infra, so
`cp .env.example .env && npm run dev:infra:up && npm run seed` works out of the box.

## Architecture

- **Per-domain modules**: `auth`, `users`, `stories`, `tags`, `comments`,
  `notifications`, `bookmarks`. Each domain splits controllers by audience:
  `public-*`, `private-*` (`/me`), `admin-*`.
- **Bookmarks (reading list)**: a `Bookmark` (unique `(user, story)`, both
  cascade-delete) is a member saving a story. All routes are gated
  (`BookmarksController`, SessionAuthGuard): `PUT`/`DELETE /stories/:id/bookmark`
  (idempotent add/remove — add validates visibility via
  `StoriesService.findOneVisible`, so you can only save what you can see),
  `GET /users/me/bookmarks` (the list — approved stories only, newest-saved
  first, serialized like the public feed), and `GET /users/me/bookmarks/ids`
  (the id set, fetched once so the web client shows bookmark state on cards/
  reader without the hot feed query joining per-viewer).
- **Notifications**: commenting creates a `Notification`, fired from
  `CommentsService.create` via `NotificationsService.createNotification`. Two
  `type`s: a **reply** notifies the parent thread's author (carrying `parentId`,
  the top-level thread, so the reader can expand it before scrolling); a
  top-level **comment** notifies the story's author. Both skip self-actions and
  removed recipients. The row denormalizes its display fields (`actorName`,
  `storyId/Title`, `commentId`, `parentId`) so the `/users/me/notifications`
  feed needs no joins and survives later deletes. Endpoints: list, `unread-count`,
  `PATCH :id/read`, `PATCH read` (all), `DELETE :id` (one), `DELETE read`
  (clear read — no auto-delete), and `GET :id/../stream` — a live `@Sse` feed.
  `createNotification` publishes `{userId, storyId}` to a Redis channel; a
  dedicated subscriber (wired in `app.setup`, closed in
  `NotificationsStream.onModuleDestroy`) fans events into the per-user SSE
  stream, so a notification on any instance reaches the recipient's open
  connection — and the `storyId` lets a reader viewing that story refresh its
  thread live. The client bell uses it live and polls as a fallback.
- **Response DTO tiers** (via `plainToInstance(dto, entity, {excludeExtraneousValues: true})`):
  `*PreviewResponseDto` (public) → `*PrivateResponseDto` (self, adds email) →
  `*ResponseDto` (admin, adds role/flags). Follow this when adding fields.
  `StoryPreviewResponseDto` carries a `UserPreviewResponseDto author` for the
  public listing byline; it's populated only when the query loads the relation
  (`GET /stories` does; an author's own `GET /users/:id/stories` omits it as
  redundant) and is null for a soft-deleted author.
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
- **Free publish limit**: an author may have at most `FREE_PUBLISH_LIMIT` (10)
  stories in the publication pipeline (`pending`/`approved`/`flagged`) at once
  — enforced in `StoriesService` on create-non-draft and `submitDraft` (403
  when exceeded). Drafts and rejected stories don't count, so authors can keep
  writing; it's a fair-use cap and basic spam protection.
- **Honeypot**: `LoginInfoDto` and `RegisterUserDto` carry an `@IsEmpty()`
  `website` field. Real forms leave the hidden input blank; a bot that fills
  every field trips `ValidationPipe` (400) before any credential/DB work.
  **Comments** have no approval gate; instead members report them
  (`POST /comments/:id/report`, one per member via a unique `(user, comment)`
  on `comment_report`). A report sets `Comment.isFlagged` and recomputes
  `reportCount` from the rows (orderable, drift-free). The admin queue is
  `GET /admin/comments?flagged=true` (reported only, most-reported first);
  `PATCH /admin/comments/:id/resolve` drops the reports and clears the flag,
  while `DELETE /comments/:id` removes an abusive comment outright.
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

- Conventional commits, one concern per commit. No `Co-Authored-By` trailer.
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
the anonymous IP fallback. Request-id correlation is in place
(`src/middlewares/request-id.ts`, wired first in `app.setup.ts`): each request
gets a `req.requestId` (a validated upstream `X-Request-Id` or a generated
UUID), echoed on the response header and logged by the interceptor and
`AllExceptionsFilter` (which also returns it in the error bodies it owns).
Prometheus metrics are exposed at `GET /metrics` (`src/metrics/`): a
bearer-token-protected (`METRICS_TOKEN`, required in production), throttle-exempt
scrape target owning a private `prom-client` registry — Node runtime defaults,
HTTP counter/histogram/in-flight (recorded by `src/middlewares/http-metrics.ts`,
labelled by route *template* to bound cardinality), on-scrape moderation gauges
(`ws_stories_by_status`, `ws_flagged_comments`), and `ws_db_up`/`ws_redis_up`
health. Per-event counters are intentionally omitted where derivable from the
HTTP route+status series. The main known gaps are now all closed.
