import * as bcrypt from 'bcrypt';
import request from 'supertest';
import {Role} from 'src/users/enums/role';
import {User} from 'src/users/entities/user.entity';
import {UsersService} from 'src/users/users.service';
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
        await bcrypt.compare(DEFAULT_USER.password, dbUser!.password!)
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

    it('rejects a registration that fills the honeypot (bot) with 400', async () => {
      await agent()
        .post('/auth/register')
        .send({
          ...DEFAULT_USER,
          email: 'bot@test.com',
          website: 'http://spam.example',
        })
        .expect(400);
    });

    it('rejects weak passwords with 400', async () => {
      await agent()
        .post('/auth/register')
        .send({...DEFAULT_USER, password: 'weak'})
        .expect(400);
    });

    it('rejects a profane display name with 400', async () => {
      await agent()
        .post('/auth/register')
        .send({...DEFAULT_USER, name: 'fuck face'})
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

    it('rejects a login that fills the honeypot (bot) with 400', async () => {
      await agent()
        .post('/auth/login')
        .send({
          email: DEFAULT_USER.email,
          password: DEFAULT_USER.password,
          website: 'http://spam.example',
        })
        .expect(400);
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

  describe('POST /auth/google', () => {
    it('rejects a missing credential with 400 (and is CSRF-exempt)', async () => {
      // No CSRF token is sent; getting 400 (validation) rather than 403 (CSRF)
      // confirms the route is exempt like login/register.
      await agent().post('/auth/google').send({}).expect(400);
    });

    it('returns 503 when Google sign-in is not configured', async () => {
      // .env.test sets no GOOGLE_CLIENT_ID, so token verification is disabled;
      // a real credential can't be minted in tests, so this documents the
      // graceful-disable path. The find/link/create + verify logic is covered
      // by the AuthService/UsersService unit tests.
      await agent()
        .post('/auth/google')
        .send({credential: 'any-token'})
        .expect(503);
    });
  });

  // A real Google ID token can't be minted in tests (GoogleAuthService.verify
  // is unit-tested), so these exercise UsersService directly — against the
  // real database, so the unique constraints and soft-delete filtering are
  // real, not mocked — the same way seedAdmin bypasses the HTTP layer.
  describe('account deletion and Google re-registration', () => {
    const profile = {
      googleId: 'g-integration-1',
      email: 'aria@gmail.com',
      name: 'Aria',
    };

    it('lets the same Google identity register fresh after self-deletion', async () => {
      const usersService = testApp.app.get(UsersService);

      const first = await usersService.findOrCreateGoogleUser(profile);
      await usersService.deactivateSelf(first.id);

      // Same googleId AND email as before — must not collide with the
      // now-anonymized row.
      const second = await usersService.findOrCreateGoogleUser(profile);

      expect(second.id).not.toBe(first.id);
      expect(second.email).toBe(profile.email);
      expect(second.googleId).toBe(profile.googleId);

      const oldRow = await userRepository().findOne({
        where: {id: first.id},
        withDeleted: true,
      });
      expect(oldRow!.deletedAt).not.toBeNull();
      expect(oldRow!.email).not.toBe(profile.email);
      expect(oldRow!.googleId).toBeNull();
    });

    it('refuses re-registration under an admin-removed identity', async () => {
      const usersService = testApp.app.get(UsersService);

      const first = await usersService.findOrCreateGoogleUser(profile);
      // Admin removal — unlike deactivateSelf, identifiers stay locked.
      await usersService.remove(first.id);

      await expect(
        usersService.findOrCreateGoogleUser(profile)
      ).rejects.toThrow('This account has been removed');
    });
  });
});
