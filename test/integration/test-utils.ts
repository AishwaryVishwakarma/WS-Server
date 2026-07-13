import {INestApplication} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import type {RedisClientType} from 'redis';
import request from 'supertest';
import {App} from 'supertest/types';
import {DataSource} from 'typeorm';
import {AppModule} from 'src/app.module';
import {setupApp} from 'src/app.setup';
import {CreateUserDto} from 'src/users/dto/create-user.dto';
import {Role} from 'src/users/enums/role';
import {UsersService} from 'src/users/users.service';

export type Agent = ReturnType<typeof request.agent>;

export interface TestApp {
  app: INestApplication<App>;
  dataSource: DataSource;
  redisClient: RedisClientType;
}

export const DEFAULT_USER = {
  name: 'Test User',
  email: 'user@test.com',
  password: 'S3cret!Password',
};

export const ADMIN_USER = {
  name: 'Test Admin',
  email: 'admin@test.com',
  password: 'Adm1n!S3cret',
};

// Boots the real AppModule with the same pipes/filters/session middleware
// as production (via setupApp), against the docker-compose test services.
export async function createTestApp(): Promise<TestApp> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  const redisClient = await setupApp(app);
  await app.init();

  return {app, dataSource: app.get(DataSource), redisClient};
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
    'SELECT table_name AS table_name FROM information_schema.tables WHERE table_schema = DATABASE()'
  );

  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const {table_name} of tables) {
      // The migrations ledger must survive cleaning — truncating it would
      // make the next app boot re-run migrations against existing tables
      if (table_name === 'migrations') continue;

      await dataSource.query(`TRUNCATE TABLE \`${table_name}\``);
    }
  } finally {
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}

// Registers a user through the real endpoint; the agent keeps the session
// cookie so subsequent requests on it are authenticated.
export async function registerUser(
  agent: Agent,
  overrides: Partial<typeof DEFAULT_USER> = {}
) {
  const payload = {...DEFAULT_USER, ...overrides};
  const response = await agent.post('/auth/register').send(payload).expect(201);

  return {payload, body: response.body};
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

// csurf stores its secret in the session, so the token is only valid for
// requests made by the same agent. Fetch it AFTER register/login — the
// session is regenerated on auth, which discards any earlier secret.
export async function getCsrfToken(agent: Agent): Promise<string> {
  const response = await agent.get('/auth/csrf-token').expect(200);
  return response.body.csrfToken as string;
}
