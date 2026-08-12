# Whispering Shadows — Server

NestJS API for **Whispering Shadows**. It provides session-based accounts,
story publishing and moderation, reader interactions, notifications, and
background email delivery for the sibling [WS-Web](../WS-Web) application.

## Stack

- NestJS 11 and TypeScript
- PostgreSQL with TypeORM migrations
- Redis-backed sessions and cross-instance coordination
- BullMQ background jobs
- Jest unit and integration tests

## Local development

Docker is the quickest way to provide PostgreSQL and Redis:

```bash
npm install
cp .env.example .env
npm run dev:infra:up
npm run migration:run
npm run seed          # optional demo data
npm run start:dev
```

The API runs at `http://localhost:8000`. Interactive OpenAPI documentation is
available at [`http://localhost:8000/docs`](http://localhost:8000/docs); use it
as the endpoint, payload, authentication, and response reference.

### Configuration

Start from `.env.example`, which documents every supported variable. The main
groups are:

- `DB_*` for PostgreSQL
- `REDIS_URL` for sessions, streams, and queues
- `SESSION_SECRET` and `SALT_ROUNDS` for authentication
- `FRONTEND_URL` for email links
- `RESEND_API_KEY` and `MAIL_FROM` for optional email delivery
- `GOOGLE_CLIENT_ID` for optional Google sign-in
- `METRICS_TOKEN` for protected Prometheus metrics

Configuration is validated at startup. Production rejects missing or unsafe
security settings.

## Commands

```bash
npm run start:dev          # development server
npm run build              # compile to dist/
npm run start:prod         # run the compiled application
npm run typecheck          # TypeScript validation
npm run lint               # ESLint
npm test                   # unit tests
npm run test:cov           # unit tests with coverage
npm run seed               # seed the configured database
npm run seed -- --fresh    # reset and reseed
```

### Infrastructure and integration tests

```bash
npm run dev:infra:up
npm run dev:infra:down

npm run test:infra:up
npm run test:integration
npm run test:infra:down
```

Integration tests use dedicated disposable PostgreSQL and Redis services and
refuse to clean a database whose name does not end in `_test`.

### Migrations

```bash
npm run migration:generate -- src/database/migrations/DescriptiveName
npm run migration:run
npm run migration:revert
```

Schema changes must use migrations; TypeORM synchronization is disabled.

## Architecture

Domain modules live under `src/` (for example `auth`, `users`, `stories`,
`comments`, `notifications`, and `jobs`). Controllers are separated by public,
authenticated/self-service, and admin audiences where practical.

Authentication uses Redis-backed server sessions rather than JWTs. Mutations
require CSRF protection, and admin operations additionally require role-based
authorization. Public, private, and admin response DTOs intentionally expose
different fields.

Application-wide middleware, session configuration, validation, and filters
are defined in `src/app.setup.ts`, shared by production startup and the
integration harness.

## Operations and deployment

The production `Dockerfile` and `railway.json` define the Railway deployment
and health check. Provide managed PostgreSQL and Redis, set the production
variables documented in `.env.example`, and point `FRONTEND_URL` at the public
web origin. Migrations run automatically when the application starts.

Operational endpoints:

- `GET /health` — deployment health check
- `GET /metrics` — Prometheus metrics, protected by `METRICS_TOKEN`
- `GET /docs` — Swagger UI and OpenAPI reference

## License

Private / unlicensed.
