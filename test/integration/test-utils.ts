import {INestApplication} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import type {RedisClientType} from 'redis';
import request from 'supertest';
import {App} from 'supertest/types';
import {DataSource} from 'typeorm';
import {AppModule} from 'src/app.module';
import {setupApp} from 'src/app.setup';
import {CreateUserDto} from 'src/users/dto/create-user.dto';
import {UserPreviewResponseDto} from 'src/users/dto/user-response.dto';
import {Role} from 'src/users/enums/role';
import {UsersService} from 'src/users/users.service';
import {MailService} from 'src/mail/mail.service';

export type Agent = ReturnType<typeof request.agent>;

// supertest's Response.body is typed `any` — a minimal shape for endpoints
// whose response tests only ever need the id back (creation endpoints
// serialized through a response DTO's `id` field). Annotating at these
// boundaries keeps `any` from leaking into every downstream call site that
// consumes it (e.g. passing an id on to another request as a typed param).
export interface IdBody {
  id: string;
}

export interface TestApp {
  app: INestApplication<App>;
  dataSource: DataSource;
  redisClient: RedisClientType;
}

export const DEFAULT_USER = {
  name: 'Test User',
  email: 'user@test.com',
  password: 'S3cret!Password',
  acceptedTerms: true,
};

export const ADMIN_USER = {
  name: 'Test Admin',
  email: 'admin@test.com',
  password: 'Adm1n!S3cret',
};

// registerUser needs the app's MailService instance to pull the emailed OTP
// code back out (see below) but only receives an `agent`, not the TestApp —
// changing its signature would touch every one of its ~140 call sites across
// the suite. Each spec file creates exactly one TestApp in its own
// `beforeAll`, so stashing it here (module state is per-test-file, since Jest
// gives each spec file its own module registry) is a self-contained shortcut
// rather than a real cross-test global.
let currentTestApp: TestApp | undefined;

// Boots the real AppModule with the same pipes/filters/session middleware
// as production (via setupApp), against the docker-compose test services.
export async function createTestApp(): Promise<TestApp> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  const redisClient = await setupApp(app);
  await app.init();

  currentTestApp = {app, dataSource: app.get(DataSource), redisClient};
  return currentTestApp;
}

export async function closeTestApp({app, redisClient}: TestApp) {
  await app.close();
  await redisClient.quit();
}

// Truncates every table in the connected database. Guarded so it can never
// run against a dev/prod database by accident.
export async function cleanDatabase(dataSource: DataSource) {
  const dbName = dataSource.options.database as string;

  if (!dbName?.endsWith('_test')) {
    throw new Error(
      `Refusing to clean database "${dbName}" — integration tests must run against a database whose name ends in "_test"`
    );
  }

  const tables: {table_name: string}[] = await dataSource.query(
    'SELECT table_name AS table_name FROM information_schema.tables WHERE table_schema = current_schema()'
  );

  for (const {table_name} of tables) {
    // The migrations ledger must survive cleaning — truncating it would make
    // the next app boot re-run migrations against existing tables. Also
    // preserve typeorm_metadata (records the searchVector generated-column
    // expression) so a later migration:generate doesn't see it as missing
    // and propose a spurious change.
    if (table_name === 'migrations' || table_name === 'typeorm_metadata') {
      continue;
    }

    // CASCADE truncates dependent tables transitively — Postgres has no
    // MySQL-style FK-check toggle, and truncating an already-cascaded table
    // later in this same loop is a harmless no-op.
    await dataSource.query(`TRUNCATE TABLE "${table_name}" CASCADE`);
  }
}

// Registers a user through the real two-step OTP endpoints (start, then
// confirm with the mailed code) so the agent ends up with a real session
// cookie, exactly like the old one-call register used to. Spies on the app's
// MailService for just long enough to pull the code back out of the body —
// mirrors password-reset.integration.spec.ts's own spyOnMail/token-extraction
// helper, restoring itself immediately so it never leaks into a test's own
// later spy on the same singleton (e.g. requesting a password reset next).
export async function registerUser(
  agent: Agent,
  overrides: Partial<typeof DEFAULT_USER> = {}
) {
  if (!currentTestApp) {
    throw new Error('registerUser called before createTestApp');
  }
  const payload = {...DEFAULT_USER, ...overrides};

  const mailService = currentTestApp.app.get(MailService);
  const sendSpy = jest.spyOn(mailService, 'send').mockResolvedValue(undefined);

  await agent.post('/auth/register').send(payload).expect(204);

  const call = sendSpy.mock.calls.at(-1);
  sendSpy.mockRestore();
  const code = call && /code is (\d{6})/.exec(call[2])?.[1];
  if (!code) throw new Error('No verification code found in the mailed body');

  const response = await agent
    .post('/auth/register/confirm')
    .send({email: payload.email, code})
    .expect(201);

  return {payload, body: response.body as UserPreviewResponseDto};
}

// Admins cannot be created through the public API (by design), so seed one
// directly via the service layer, then log in over HTTP for a real session.
export async function seedAdmin(testApp: TestApp): Promise<Agent> {
  const usersService = testApp.app.get(UsersService);

  await usersService.create({
    ...ADMIN_USER,
    role: Role.Admin,
  } as CreateUserDto);

  const agent = request.agent(testApp.app.getHttpServer());
  await agent
    .post('/auth/login')
    .send({email: ADMIN_USER.email, password: ADMIN_USER.password})
    .expect(201);

  return agent;
}

// The CSRF token is bound to the session id (csrf-csrf double-submit), so it
// is only valid for the same agent. Fetch it AFTER register/login — the
// session is regenerated on auth, which changes the id the token is tied to.
export async function getCsrfToken(agent: Agent): Promise<string> {
  const response = await agent.get('/auth/csrf-token').expect(200);
  return response.body.csrfToken as string;
}
