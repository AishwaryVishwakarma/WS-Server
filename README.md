# Whispering Shadows — Server

Backend API for **Whispering Shadows**, a web application for sharing and
discussing stories. Authors publish stories, tag them, and comment; an admin
moderation layer approves, rejects, or flags content before it goes public.

## Tech stack

- **NestJS 11** (TypeScript) on Express
- **MySQL** via **TypeORM**
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
cp .env.example .env   # then fill in the values
npm run start:dev
```

### Environment variables

| Variable         | Required | Description                                    |
| ---------------- | :------: | ---------------------------------------------- |
| `SESSION_SECRET` |    ✔     | Session signing secret (min 16 chars)          |
| `REDIS_URL`      |    ✔     | Redis connection URL                           |
| `DB_HOST`        |    ✔     | MySQL host                                     |
| `DB_PORT`        |    ✔     | MySQL port                                     |
| `DB_USERNAME`    |    ✔     | MySQL user                                     |
| `DB_PASSWORD`    |    ✔     | MySQL password                                 |
| `DB_NAME`        |    ✔     | MySQL database name                            |
| `PORT`           |          | HTTP port (default `8000`)                     |
| `SALT_ROUNDS`    |          | bcrypt cost (default `10`)                     |
| `NODE_ENV`       |          | `development` \| `test` \| `production`        |

The app fails to start if a required variable is missing or `SESSION_SECRET`
is weak.

## Development database

The app needs MySQL and Redis. Either run them natively, or use the dockerized
dev infrastructure — it runs on alternate ports (MySQL `3308`, Redis `6381`)
so it coexists with native installs:

```bash
# start dev MySQL + Redis (data persists in a named volume)
npm run dev:infra:up

# stop them (add `docker compose -f docker-compose.dev.yml down -v` for a full reset)
npm run dev:infra:down
```

To use it, point `.env` at the containers (values in `.env.example`).

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

Integration tests boot the real application against a dedicated MySQL and
Redis, provisioned via Docker Compose (requires [Docker Desktop](https://www.docker.com/products/docker-desktop/)).
They run on separate ports (MySQL `3307`, Redis `6380`), so they never touch
your dev databases. Configuration lives in `.env.test`.

```bash
npm run test:infra:up      # start the test MySQL + Redis containers
npm run test:integration   # run the integration suite
npm run test:infra:down    # stop the containers and remove their volumes
```

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
