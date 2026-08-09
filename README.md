# Whispering Shadows — Server

Backend API for **Whispering Shadows**, a web application for sharing and
discussing stories. Authors publish stories, tag them, and comment; an admin
moderation layer approves, rejects, or flags content before it goes public.

## Tech stack

- **NestJS 11** (TypeScript) on Express
- **PostgreSQL** via **TypeORM**
- **Redis**-backed sessions (`express-session` + `connect-redis`)
- **bcrypt** password hashing, **csurf** CSRF protection, **@nestjs/throttler** rate limiting

## Features

- Session-based auth (register / login / logout) with server-side sessions in Redis
- Role-based access control (`user` / `admin`) via guards and a `@Roles()` decorator
- Public / private (`/me`) / admin controller tiers per resource, with response DTOs scoped to each tier
- Story moderation workflow: `pending → approved / rejected / flagged`; editing an approved story sends it back for review
- CSRF protection on all mutating routes; per-route rate limiting

## Getting started

```bash
npm install
cp .env.example .env        # defaults target the dockerized dev infra below
npm run dev:infra:up        # start Postgres + Redis (or use your own — see below)
npm run start:dev
```

### Environment variables

| Variable         | Required | Description                                    |
| ---------------- | :------: | ---------------------------------------------- |
| `SESSION_SECRET` |    ✔     | Session signing secret (min 16 chars)          |
| `REDIS_URL`      |    ✔     | Redis connection URL                           |
| `DB_HOST`        |    ✔     | Postgres host                                  |
| `DB_PORT`        |    ✔     | Postgres port                                  |
| `DB_USERNAME`    |    ✔     | Postgres user                                  |
| `DB_PASSWORD`    |    ✔     | Postgres password                              |
| `DB_NAME`        |    ✔     | Postgres database name                         |
| `PORT`           |          | HTTP port (default `8000`)                     |
| `SALT_ROUNDS`    |          | bcrypt cost (default `10`)                     |
| `NODE_ENV`       |          | `development` \| `test` \| `production`        |

The app fails to start if a required variable is missing or `SESSION_SECRET`
is weak.

## Development database

The app needs Postgres and Redis. The `.env.example` defaults point at the
dockerized dev infrastructure, which runs on alternate ports (Postgres `3310`,
Redis `6380`) so it coexists with any natively installed instances:

```bash
# start dev Postgres + Redis (data persists in a named volume)
npm run dev:infra:up

# stop them (add `docker compose -f docker-compose.dev.yml down -v` for a full reset)
npm run dev:infra:down
```

To use your own Postgres/Redis instead, edit the `DB_*` / `REDIS_URL` values in
`.env`.

### Seed data

```bash
# populate the database configured in .env with demo data
npm run seed

# wipe and reseed
npm run seed -- --fresh
```

Seeds an admin, four writers (one blocked), five tags, eight stories across
every moderation status, and comments. Logins:

| Account | Email                                                 | Password         |
| ------- | ----------------------------------------------------- | ---------------- |
| Admin   | `admin@whisperingshadows.dev`                         | `Adm1n!Shadows`  |
| Writers | `alice`/`bob`/`carol`/`dave` `@whisperingshadows.dev` | `Wr1ter!Shadows` |

(`dave` is blocked — useful for testing the blocked-login path.)

## Tests

```bash
# unit tests (no infrastructure required)
npm run test

# coverage
npm run test:cov
```

### Integration tests

Integration tests boot the real application against a dedicated Postgres and
Redis, provisioned via Docker Compose (requires [Docker Desktop](https://www.docker.com/products/docker-desktop/)).
They run on separate ports (Postgres `3311`, Redis `6381`), so they never touch
your dev databases. Configuration lives in `.env.test`.

```bash
npm run test:infra:up      # start the test Postgres + Redis containers
npm run test:integration   # run the integration suite
npm run test:infra:down    # stop the containers and remove their volumes
```

## Deployment

Deploys to [Railway](https://railway.app) from the existing production
`Dockerfile` (`railway.json` points Railway at it and configures the `/health`
probe above as the deploy healthcheck).

1. **Create the project and add two plugins**: Postgres and Redis (Railway's
   own managed offerings — "New" → "Database" → pick each). Then add this repo
   as a third service ("New" → "GitHub Repo").
2. **Set the app service's environment variables.** Reference the plugins'
   own variables with Railway's `${{ServiceName.VAR}}` syntax rather than
   copying values by hand — they rotate if a plugin is ever redeployed:

   | Variable | Value |
   | --- | --- |
   | `DB_HOST` | `${{Postgres.PGHOST}}` |
   | `DB_PORT` | `${{Postgres.PGPORT}}` |
   | `DB_USERNAME` | `${{Postgres.PGUSER}}` |
   | `DB_PASSWORD` | `${{Postgres.PGPASSWORD}}` |
   | `DB_NAME` | `${{Postgres.PGDATABASE}}` |
   | `REDIS_URL` | `${{Redis.REDIS_URL}}` |
   | `NODE_ENV` | `production` |
   | `SESSION_SECRET` | a unique random string, ≥16 chars (config fails to boot on a known example value in production) |
   | `METRICS_TOKEN` | a unique random string (required in production — `/metrics` fail-closes without it) |
   | `FRONTEND_URL` | `https://whisperingshadows.net` |
   | `GOOGLE_CLIENT_ID` | same value as the web's `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, if Google sign-in is enabled |
   | `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM` | Resend credentials, if outgoing email is enabled |

   `PORT` needs no manual entry — Railway injects its own (`8080`), and
   `main.ts` already reads `process.env.PORT` rather than the Dockerfile's
   `EXPOSE 8000`.
3. **Migrations run automatically on boot** (`migrationsRun` in
   `app.module.ts`), so a fresh Postgres plugin gets its schema on the app's
   first deploy with no separate migration step.
4. Once the app service has a public domain (Railway assigns one, or attach
   `api.whisperingshadows.net` under the service's Settings → Networking),
   point the web deployment's `API_URL` at it. **Set that domain's Target
   Port to `8080`, not `8000`** — Railway's injected `PORT` wins over the
   Dockerfile's `EXPOSE`, so the app actually listens on `8080`; a Target
   Port of `8000` looks reasonable but produces a `502 Application failed to
   respond` since nothing is listening there.

## API overview

All routes require an authenticated session except registration and login.
Mutating requests require a CSRF token (fetched from `GET /auth/csrf-token`)
sent in the `x-csrf-token` header. `admin/*` routes require the `admin` role.

| Area     | Endpoints                                                                         |
| -------- | --------------------------------------------------------------------------------- |
| Auth     | `GET /auth/csrf-token`, `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` |
| Users    | `GET/PATCH/DELETE /users/me`, `GET /users/me/stories`, `GET /users/me/comments`, `GET /users/:id`, `GET /users/:id/stories` |
| Stories  | `GET /stories`, `POST /stories`, `GET /stories/:id`, `GET /stories/:id/comments`, `PATCH/DELETE /stories/:id` |
| Tags     | `GET /tags`, `GET /tags/:id`                                                       |
| Comments | `POST /comments`, `PATCH/DELETE /comments/:id`                                     |
| Admin    | `admin/users`, `admin/stories` (incl. `PATCH /admin/stories/:id/status`), `admin/tags`, `admin/comments` |

## Project structure

```
src/
  auth/          register / login / logout, CSRF token
  users/         accounts, profiles, admin user management
  stories/       stories + moderation workflow
  tags/          story tags
  comments/      comments on stories
  common/        guards, decorators, filters, shared DTOs
  session/       session lifecycle helper
  database/      seed script
  app.setup.ts   pipes, filters, Redis session middleware (shared by app + tests)
```

## License

Private / unlicensed.
