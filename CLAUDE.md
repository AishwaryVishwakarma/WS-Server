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
`?tag=<slug>&search=&scareLevel=&sort=newest|oldest|most-commented|most-read|most-liked|trending`.
It is **dual-mode paging**: an explicit `?page=` returns the numbered offset
envelope (`{data,total,page,totalPages}`) for the tag/author shelves, while
*omitting* `page` returns a keyset page (`{data,nextCursor,total?}`) for the
infinite feed — an opaque `?cursor=` seeks past the last row via `(sortKey, id)`
instead of a growing OFFSET, and `total` rides only the first page. See
`src/stories/story-cursor.ts` and `StoriesService.findApprovedFeed`.
**Trending** (`sort=trending`) ranks approved stories from the last
`TRENDING_WINDOW_DAYS` (14) by an engagement blend
(`likeCount*3 + commentCount*4 + viewCount`). Recency is the fixed window, not a
decaying score, so the ordering key stays a stable integer — keyset-pageable
like the count sorts (a decaying score would drift between fetches and duplicate
the boundary row). Ordered by the score under a SELECT alias (`trendingScore`),
never the raw `(story.…)` expression, which TypeORM mis-parses as a join alias.
The home "Trending" strip reuses this via `sort=trending&page=1`.
**Feed search** (`?search=`) is a MySQL FULLTEXT match over `story(title,
excerpt)` (index `IDX_story_fulltext`): `StoriesService` runs `MATCH … AGAINST
(… IN BOOLEAN MODE)` as a *filter only* (the active sort/keyset ordering is
untouched). `story-search.ts::toBooleanFulltextQuery` turns the query into
`+word*` prefix terms (AND), dropping stopwords and sub-3-char tokens; when
nothing indexable remains (too short / all stopwords) it returns null and the
service falls back to the escaped substring `LIKE`. This is word/prefix-based,
so "host" no longer matches "ghost" — searches match whole words or their
prefixes. (Admin/`/me` list search still uses `LIKE` — low volume.)

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
  `notifications`, `bookmarks`, `follows`, `likes`, `series`. Most domains
  split controllers by audience (`public-*`, `private-*` (`/me`), `admin-*`);
  a few (bookmarks, follows, likes, series) instead use one `@Controller()`
  with no shared prefix and fully-qualified paths per method, mixing public
  and gated `/users/me/*` routes on the same controller.
- **Likes**: a `StoryLike` (table `story_like` — `like` is a MySQL reserved
  word; unique `(user, story)`, both cascade-delete) is a member liking a
  story. Gated `LikesController`: `PUT`/`DELETE /stories/:id/like` (idempotent;
  like validates visibility) and `GET /users/me/likes/ids` (button state).
  `story.likeCount` is a denormalized counter maintained by `LikesService` on
  like/unlike (increment/decrement, mirroring `commentCount`), exposed on the
  story DTO and drives the `most-liked` sort (see the `COUNT_SORT_COLUMN` map in
  `StoriesService`, backed by a `(status, likeCount)` index).
- **Follows**: a `Follow` (unique `(follower, following)`, both cascade-delete)
  is one member following another. `FollowsController` mixes gated and public
  routes via method-level guards: `PUT`/`DELETE /users/:id/follow` (idempotent;
  follow rejects self-follows and validates the target exists),
  `GET /users/me/following/ids` (button state), `GET /users/me/feed` (the
  Following feed — approved stories by followed authors, via
  `StoriesService.findApprovedByAuthorIds`), and the self-only people lists
  `GET /users/me/following` / `GET /users/me/followers` (paginated
  `UserPreviewResponseDto`). **Privacy stance**: the detailed graph (who
  follows whom, by name) is private — only the owner sees their own lists;
  what's *public* is the aggregate `GET /users/:id/follow-stats`
  (`{followers, following}` counts). A new follow fires a `follow` notification
  to the author (see Notifications).
- **Bookmarks (reading list)**: a `Bookmark` (unique `(user, story)`, both
  cascade-delete) is a member saving a story. All routes are gated
  (`BookmarksController`, SessionAuthGuard): `PUT`/`DELETE /stories/:id/bookmark`
  (idempotent add/remove — add validates visibility via
  `StoriesService.findOneVisible`, so you can only save what you can see),
  `GET /users/me/bookmarks` (the list — approved stories only, newest-saved
  first, serialized like the public feed), and `GET /users/me/bookmarks/ids`
  (the id set, fetched once so the web client shows bookmark state on cards/
  reader without the hot feed query joining per-viewer).
- **Read counts**: `Story.viewCount` is a denormalized counter bumped by
  `StoriesService.recordView` via `POST /stories/:id/view` — public and
  **CSRF-exempt** (anonymous browsers can't hold a token, and it's a harmless
  counter, not a real mutation; exemption is in `app.module` alongside the auth
  routes). Deduped per browser session (`session.viewedStoryIds`, capped);
  approved stories only, and the author's own views don't count. The count
  rides `StoryPreviewResponseDto`, so it shows on cards and the reader.
- **Notifications**: four `type`s. A **reply** notifies the parent thread's
  author (carrying `parentId`, the top-level thread, so the reader can expand it
  before scrolling); a top-level **comment** notifies the story's author (both
  fired from `CommentsService.create`); a **follow** notifies the followed
  author (fired from `FollowsService.follow`, only on a genuinely new follow);
  a **like** notifies the story's author (fired from `LikesService.like`, only
  on a genuinely new like, links to the story). All skip self-actions and
  removed recipients. The row denormalizes its display
  fields (`actorName`, `actorId`, `storyId/Title`, `commentId`, `parentId`) so
  the `/users/me/notifications` feed needs no joins and survives later deletes;
  the story/comment fields are **nullable** (a follow has none — it links to the
  actor's profile via `actorId`). Endpoints: list, `unread-count`,
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
  `RolesGuard` + `@Roles(Role.Admin)` for admin routes. Sessions default to a
  1-day cookie (`SESSION_MAX_AGE_MS`, `src/session/session.constants.ts`);
  `POST /auth/login`'s optional `rememberMe: true` swaps in a 30-day one
  (`REMEMBER_ME_MAX_AGE_MS`) by setting `req.session.cookie.maxAge` after
  `session.regenerate()` — register/Google sign-in don't take this option.
  `SessionRegistryService.track` mirrors whichever maxAge was used into the
  `user-sessions:<userId>` index's own TTL (see Password reset below), always
  raising it to cover the longest-lived session currently tracked and never
  shrinking it — otherwise a later plain login for the same user could
  truncate the index out from under an still-live remembered session,
  hiding it from a subsequent password-reset logout-everywhere.
- **Google sign-in** (`POST /auth/google`, CSRF-exempt like login): the web
  sends the Google Identity Services **ID token**; `GoogleAuthService.verify`
  (google-auth-library, audience = `GOOGLE_CLIENT_ID`) checks it, then
  `UsersService.findOrCreateGoogleUser` resolves the account — by `googleId`,
  else **links** it onto a same-email password account (safe: Google-verified
  email required), else creates a password-less account (`password` is nullable;
  `validateUser` treats a null hash as "no password login"). Then the same
  session dance as login. `GOOGLE_CLIENT_ID` is **optional** — unset → the
  endpoint 503s (feature disabled), so dev/CI boot without it. It needs no
  client *secret* (no code exchange). Unit tests cover verify + link/create;
  integration covers the 400/503 wiring (a real token can't be minted in tests).
- **Auto-verification** (`src/users/auto-verify.ts`): an account earns
  `isVerified` automatically once it's ≥30 days old (`AUTO_VERIFY_MIN_ACCOUNT_AGE_MS`)
  and has ever had a story reach `approved` — `User.hasPublishedStory` latches
  once in `StoriesService.updateStatus` and is never cleared, so later
  deleting that (hard-deleted, no `@DeleteDateColumn` on `Story`) story has no
  effect. There's no scheduler in this codebase, so `shouldAutoVerify` is
  checked lazily inside `SessionAuthGuard`'s existing per-request user reload
  rather than adding one just for this — it fires on the account's own next
  gated request, not necessarily the instant the 30-day mark passes.
  `shouldAutoVerify` is a **plain predicate function**, not a `UsersService`
  method — the guard only has `DataSource` injected (it's used across nearly
  every module, so it can't depend on a service that isn't guaranteed
  available everywhere), so it reads/writes the `User` repository directly.
  `User.verificationLocked` means "isVerified has already been decided, one
  way or the other" — set by the auto-check firing once, **or** by an admin
  explicitly including `isVerified` in `PATCH /admin/users/:id`
  (`UsersService.update`) — so an admin's later un-verify (or early manual
  verify) is never silently overwritten the next time the auto-check runs.
  Self-service profile updates can never set `isVerified` in the first place
  (`UpdateProfileDto` has no such field; `ValidationPipe`'s whitelist strips
  it), so the lock only ever engages from a genuine admin action.
- **Password reset** (`POST /auth/forgot-password`, `POST /auth/reset-password`,
  both CSRF-exempt like login — no session exists at either step): a reset
  link's token is 256 bits of randomness (`crypto.randomBytes`), only ever
  stored as its SHA-256 hash (`PasswordResetToken.tokenHash`) — mirrors why
  `User.password` is bcrypt-hashed, never reversible even if the row leaks.
  `PasswordResetService` keeps at most one live token per user: requesting a
  fresh link or consuming one deletes the rest, so an old link can never be
  replayed alongside a newer one, and it expires after an hour regardless.
  `forgot-password` always resolves the same way (204, no body) whether or
  not the email is registered — a differing response would let an attacker
  enumerate accounts. Delivery goes through `MailService`
  (`src/mail/mail.service.ts`), optional like Google sign-in: unset
  `SMTP_HOST` doesn't fail anything, it just logs the message instead of
  sending it, so the flow is fully exercisable in dev/CI (grab the link from
  the console) without real mail credentials. `FRONTEND_URL` (optional,
  defaults to `http://localhost:3000`) builds the link the email points at.
  Consuming a link also **logs out every active session for the account** via
  `SessionRegistryService` (`src/session/session-registry.service.ts`): a
  Redis SET `user-sessions:<userId>` of session ids, updated alongside
  `express-session`'s own store (`SADD`/`EXPIRE` on login/register/Google
  sign-in, `SREM` on logout) since connect-redis has no built-in per-user
  lookup. `resetPassword` reads that set and `DEL`s each `sess:<sid>` key
  directly — there's no "current" session to exempt here (the flow is
  unauthenticated), unlike a hypothetical authenticated change-password.
- **Two account-deletion paths, deliberately different** — both soft-delete
  (`deletedAt`), but only self-deletion releases the unique identifiers:
  - `DELETE /users/me` → `UsersService.deactivateSelf`: nulls `googleId` and
    rewrites `email` to `deleted-<id>@deleted.invalid` (`.invalid` is a
    reserved TLD; the id makes it collision-proof) *before* soft-deleting —
    "fresh start", so the same person can register/sign in again (password or
    Google) without hitting the old row's unique constraints. `findOrCreateGoogleUser`
    checks a `withDeleted` lookup before creating; a hit there means an *admin*
    removal (see below), and it 403s rather than letting the unique index
    reject the insert as an opaque 409.
  - `DELETE /admin/users/:id` → `UsersService.remove`: soft-deletes only —
    identifiers stay locked, so a moderated user can't dodge removal by
    re-registering under the same email/Google identity. `PATCH
    /admin/users/:id/restore` is for **this** path (undoing an admin mistake);
    restoring a self-deleted row does not (and cannot, since the original
    email is deliberately discarded) recover the original identity.
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
- **Story reports** (mirrors comment reports): members flag a story via
  `POST /stories/:id/report` (gated; one per member via a unique
  `(user, story)` on `story_report`; can't report your own, and only a story
  you can see — non-approved 404s). A report recomputes the denormalized
  `Story.reportCount` from the rows (orderable, drift-free) but — unlike an
  admin status change — **does not touch the public `status`**; it only
  surfaces the story for review. The admin queue is a separate axis from the
  status filter: `GET /admin/stories?reported=true` (reportCount > 0,
  most-reported first, any status), and `PATCH /admin/stories/:id/resolve`
  drops the reports and zeroes the count without changing status.
- **Free publish limit**: an author may have at most `FREE_PUBLISH_LIMIT` (10)
  stories in the publication pipeline (`pending`/`approved`/`flagged`) at once
  — enforced in `StoriesService` on create-non-draft and `submitDraft` (403
  when exceeded). Drafts and rejected stories don't count, so authors can keep
  writing; it's a fair-use cap and basic spam protection.
- **Random story** (`GET /stories/random`, public, throttled like every other
  read): `StoriesService.findRandomApprovedId` does a plain `ORDER BY RAND()`
  over approved stories and returns just `{id}` — the client redirects to
  `/stories/:id` rather than this endpoint returning the full story, so the
  normal reader route still does the real fetch/render. Registered *before*
  `GET /stories/:id` in `PublicStoriesController` (route order matters — Nest
  would otherwise match the literal path `random` as that route's `:id`).
  `ORDER BY RAND()` scans the whole approved set to shuffle; fine at today's
  scale, would want an offset/gap-sampling scheme on a much bigger table.
- **Series** (`src/series/`): an author's own ordered grouping of their
  stories (e.g. serialized fiction posted as "Part 1", "Part 2"). Unmoderated
  and author-owned — no admin gate, unlike tags — because it's just a label,
  the same trust level as a story's own title (`Series.title` still runs
  through `@IsClean()`). One series per story at most: `Story.series` (nullable
  FK, `SET NULL` on delete — there's no delete-series endpoint in v1, but the
  FK stays defensive) + `Story.seriesPosition` (nullable int, assigned once on
  attach, never renumbered on removal — gaps are fine since display only needs
  relative order). No separate "create a series" call: `CreateStoryDto`/
  `UpdateStoryDto`'s `seriesTitle: string | null` field is find-or-create by
  (author, title) — `null` explicitly detaches, an **omitted key** on update
  leaves an existing assignment untouched (the one case `@IsOptional()` doesn't
  already give you for free, since it treats `null` as pass-through too).
  Reassigning to a *different* title picks a fresh position (current max + 1
  for that series); resaving under the *same* title is a no-op, so editing
  unrelated fields never reshuffles an existing story's spot. Endpoints:
  `GET /series/:id` (public — the series' own metadata plus its **approved**
  stories in position order, composed at the controller layer from
  `SeriesService.findOne` + `StoriesService.findApprovedBySeriesId`, mirroring
  how the story controller composes in `CommentsService`) and
  `GET /users/me/series` (gated — the editor's own "you already have" hints).
  `StoryPreviewResponseDto.series` (id/title/position) is populated only when
  the query eager-loads the `series` relation — the single-story detail fetch
  and the series listing do; the bulk feed/tag/author listings deliberately
  don't, to keep that hot path join-free.
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
- **Text moderation** (`src/common/moderation/`): `isProfane` (`text-moderation.ts`)
  wraps `obscenity`'s stock English profanity/slur matcher (normalizes
  leetspeak/repeats/simple separators; a floor, not a ceiling — see below).
  The `@IsClean()` class-validator decorator (400 on a hit) is applied **only**
  to public, ungated identity fields: `RegisterUserDto.name`/`.bio` (inherited
  by `UpdateProfileDto`/`CreateUserDto`/`UpdateUserDto` via `PartialType`/
  extension) and `CreateTagDto.name` (inherited by `UpdateTagDto`).
  **Deliberately NOT applied to story or comment text** — this is a horror
  site, so "blood"/"kill"/"corpse"/"ghost" etc. must stay allowed, and that
  content already sits behind the admin approval queue or the report flow
  below.
- **User reports** (mirrors story/comment reports): members flag another
  member's profile (name/bio/avatar — content the text filter can't fully
  catch, and can't see at all for images) via `POST /users/:id/report` (gated;
  one per reporter via a unique `(reporter, reportedUser)` on `user_report`;
  can't report yourself). Recomputes the denormalized `User.reportCount` from
  the rows (orderable, drift-free); does not block/delete the account. Admin
  queue: `GET /admin/users?reported=true` (reportCount > 0, most-reported
  first, a separate axis from the plain register/search), and
  `PATCH /admin/users/:id/resolve` drops the reports and zeroes the count.
  Admins action a genuinely bad profile with the existing block/delete/edit
  endpoints. Each report carries a required predefined `reason`
  (`ReportReason`: spam/harassment/inappropriate_image/impersonation/other,
  `src/users/enums/report-reason.enum.ts`) plus an optional free-text
  `details` (≤100 chars) — `reportCount` alone doesn't say *why* someone was
  flagged. The individual reports (not just the aggregate count) are exposed
  only on the admin single-user fetch (`GET /admin/users/:id`,
  `UsersService.findOneWithReports`) — the paginated register list stays lean.
  A pattern reusable for story/comment reports later.
- **Achievement badges** (`src/users/enums/badge.enum.ts`): five milestone
  badges on the public profile (`published`, `prolific`, `fan-favorite`,
  `conversation-starter`, `series-author`), computed on read by
  `UsersService.computeBadges` — not stored, not recomputed on a trigger.
  Only `GET /users/:id` calls it (`PublicUsersController.findOne` attaches
  `user.badges` before serializing); `UserPreviewResponseDto.badges` is
  optional and stays unpopulated everywhere else the DTO is reused (admin
  lists, a comment's `user`, etc.) to avoid the aggregate query on every row
  of a bulk listing — the same "populated only when loaded here" idea as
  `story.author`/`story.series`. Thresholds: `Published` at 1 approved
  story, `Prolific` at 10 (mirrors `FREE_PUBLISH_LIMIT`), `FanFavorite`/
  `ConversationStarter` at 25 likes/comments summed across approved stories,
  `SeriesAuthor` on having created any series. `computeBadges` reads the
  `Story`/`Series` repositories directly rather than injecting
  `StoriesService`/`SeriesService` — both of those already depend on
  `UsersService`, so injecting either back would be a genuine circular
  *provider* dependency (not just a circular module import, which
  `forwardRef` already handles elsewhere in this graph).
- **Shared utils**: `src/utils/pagination.ts` (`paginate`, `getPaginatedResponse`
  — the `{message,data,total,page,limit,totalPages}` envelope),
  `handle-query-error.ts` (maps MySQL duplicate → 409), and `report-count.ts`
  (`syncReportCount` — persists a recomputed `reportCount` via a targeted
  update that preserves the entity's existing `updatedAt`; used by all three
  report/resolve pairs — stories, comments, users — so none of them can
  forget the updatedAt-preservation trick).

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
  fallbacks — add new required env vars here. `DB_POOL_SIZE` (optional, mysql2
  `connectionLimit`, default 10) is validated the same way but stays optional —
  raise it only once `ws_db_pool_connections{state="free"}` in `/metrics` shows
  the pool actually running dry under load, not preemptively.
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
