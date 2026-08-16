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
npm run seed          # reset and load optional demo data
npm run start:dev
```

The API runs at `http://localhost:8000`. In non-production environments,
interactive OpenAPI documentation is available at
[`http://localhost:8000/docs`](http://localhost:8000/docs); use it
as the endpoint, payload, authentication, and response reference.

### Local metrics

The development infrastructure also starts Prometheus at
[`http://localhost:9090`](http://localhost:9090). Start the API with the
default `METRICS_TOKEN` from `.env.example`, then check the `ws-server` target
at [`http://localhost:9090/targets`](http://localhost:9090/targets).

Prometheus runs inside Docker and scrapes the host API at
`host.docker.internal:8000` every 30 seconds. Its local time-series data is
retained for 15 days in the `ws-prometheus-dev-data` Docker volume. If you
change `METRICS_TOKEN` locally, update the development-only credential in
`observability/prometheus.dev.yml` to match and restart Prometheus:

```bash
docker compose -f docker-compose.dev.yml restart prometheus-dev
```

For production, do not reuse or commit the development token. Mount the token
into the Prometheus container and replace `authorization.credentials` with:

```yaml
authorization:
  type: Bearer
  credentials_file: /run/secrets/ws_metrics_token
```

### Configuration

Start from `.env.example`, which documents every supported variable. The main
groups are:

- `DB_*` for PostgreSQL
- `REDIS_URL` for sessions, streams, and queues
- `SESSION_SECRET` and `SALT_ROUNDS` for authentication
- `FRONTEND_URL` and `BACKEND_URL` for email and unsubscribe links
- `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and `MAIL_FROM` for email delivery
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
npm run format             # Prettier
npm run lint               # ESLint
npm test                   # unit tests
npm run test:cov           # unit tests with coverage
npm run seed               # wipe and reseed the configured development database
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

Approximate session locations use the local GeoLite2 City database. Set
`MAXMIND_ACCOUNT_ID` and `MAXMIND_LICENSE_KEY` in production; the container
downloads the current database at startup. Local development can instead set
`GEOIP_DATABASE_PATH` to an existing `GeoLite2-City.mmdb` file.

For production email suppression, configure Resend to send `bounced`,
`complained`, and `suppressed` events to `POST /webhooks/resend`, then set its
signing secret as `RESEND_WEBHOOK_SECRET`. Email and digest work is processed
through Redis-backed queues with retries and dead-letter recording.

Operational endpoints:

- `GET /health` — deployment health check
- `GET /metrics` — Prometheus metrics, protected by `METRICS_TOKEN`
- `GET /docs` — Swagger UI and OpenAPI reference (non-production only)

## License

Private / unlicensed.
