import * as bcrypt from 'bcrypt';
import request from 'supertest';
import {Role} from 'src/users/enums/role';
import {User} from 'src/users/entities/user.entity';
import {
  cleanDatabase,
  closeTestApp,
  createTestApp,
  DEFAULT_USER,
  registerUser,
  type TestApp,
} from './test-utils';

describe('Auth (integration)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(testApp.dataSource);
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  const agent = () => request.agent(testApp.app.getHttpServer());
  const userRepository = () => testApp.dataSource.getRepository(User);

  describe('POST /auth/register', () => {
    it('creates the user, hashes the password, and starts a session', async () => {
      const client = agent();
      const {body} = await registerUser(client);

      expect(body.id).toBeDefined();
      expect(body.name).toBe(DEFAULT_USER.name);

      const dbUser = await userRepository()
        .createQueryBuilder('user')
        .addSelect('user.password')
        .where('user.email = :email', {email: DEFAULT_USER.email})
        .getOne();

      expect(dbUser).not.toBeNull();
      expect(dbUser!.password).not.toBe(DEFAULT_USER.password);
      expect(
        await bcrypt.compare(DEFAULT_USER.password, dbUser!.password)
      ).toBe(true);

      // The session cookie from registration authenticates follow-up requests
      await client.get('/users/me').expect(200);
    });

    it('ignores privileged fields in the payload (privilege escalation regression)', async () => {
      await agent()
        .post('/auth/register')
        .send({...DEFAULT_USER, role: 'admin', isVerified: true})
        .expect(201);

      const dbUser = await userRepository().findOneByOrFail({
        email: DEFAULT_USER.email,
      });

      expect(dbUser.role).toBe(Role.User);
      expect(dbUser.isVerified).toBe(false);
    });

    it('rejects a duplicate email with 409 (real unique constraint)', async () => {
      await registerUser(agent());

      await agent().post('/auth/register').send(DEFAULT_USER).expect(409);
    });

    it('rejects weak passwords with 400', async () => {
      await agent()
        .post('/auth/register')
        .send({...DEFAULT_USER, password: 'weak'})
        .expect(400);
    });

    it('rejects registration while already logged in', async () => {
      const client = agent();
      await registerUser(client);

      await client
        .post('/auth/register')
        .send({...DEFAULT_USER, email: 'second@test.com'})
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await registerUser(agent());
    });

    it('logs in with valid credentials and starts a session', async () => {
      const client = agent();

      await client
        .post('/auth/login')
        .send({email: DEFAULT_USER.email, password: DEFAULT_USER.password})
        .expect(201);

      await client.get('/users/me').expect(200);
    });

    it('rejects a wrong password with 401', async () => {
      await agent()
        .post('/auth/login')
        .send({email: DEFAULT_USER.email, password: 'Wr0ng!Password'})
        .expect(401);
    });

    it('rejects an unknown email with 401', async () => {
      await agent()
        .post('/auth/login')
        .send({email: 'nobody@test.com', password: DEFAULT_USER.password})
        .expect(401);
    });

    it('rejects a blocked user with 401', async () => {
      await userRepository().update(
        {email: DEFAULT_USER.email},
        {isBlocked: true}
      );

      const response = await agent()
        .post('/auth/login')
        .send({email: DEFAULT_USER.email, password: DEFAULT_USER.password})
        .expect(401);

      expect(response.body.message).toBe('User is blocked');
    });
  });

  describe('POST /auth/logout', () => {
    it('destroys the session', async () => {
      const client = agent();
      await registerUser(client);

      await client.post('/auth/logout').expect(204);

      // The old session cookie is no longer valid
      await client.get('/users/me').expect(401);
    });

    it('rejects logout without a session', async () => {
      await agent().post('/auth/logout').expect(401);
    });
  });
});
