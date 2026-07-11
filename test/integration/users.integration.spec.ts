import request from 'supertest';
import {User} from 'src/users/entities/user.entity';
import {Role} from 'src/users/enums/role';
import {
  ADMIN_USER,
  cleanDatabase,
  closeTestApp,
  createTestApp,
  DEFAULT_USER,
  getCsrfToken,
  registerUser,
  seedAdmin,
  type TestApp,
} from './test-utils';

describe('Users (integration)', () => {
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

  describe('GET /users/me', () => {
    it('returns the private profile including email', async () => {
      const client = agent();
      await registerUser(client);

      const response = await client.get('/users/me').expect(200);

      expect(response.body.email).toBe(DEFAULT_USER.email);
      expect(response.body.name).toBe(DEFAULT_USER.name);
      expect(response.body.password).toBeUndefined();
    });

    it('rejects unauthenticated requests', async () => {
      await agent().get('/users/me').expect(401);
    });
  });

  describe('PATCH /users/me', () => {
    it('updates profile fields', async () => {
      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);

      const response = await client
        .patch('/users/me')
        .set('x-csrf-token', token)
        .send({bio: 'I write scary stories'})
        .expect(200);

      expect(response.body.bio).toBe('I write scary stories');
    });

    it('cannot escalate privileges (regression)', async () => {
      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);

      await client
        .patch('/users/me')
        .set('x-csrf-token', token)
        .send({role: 'admin', isBlocked: false, isVerified: true, bio: 'x'})
        .expect(200);

      const dbUser = await userRepository().findOneByOrFail({
        email: DEFAULT_USER.email,
      });

      expect(dbUser.role).toBe(Role.User);
      expect(dbUser.isVerified).toBe(false);
      expect(dbUser.bio).toBe('x');
    });
  });

  describe('DELETE /users/me', () => {
    it('soft-deletes the user and destroys the session', async () => {
      const client = agent();
      const {body} = await registerUser(client);
      const token = await getCsrfToken(client);

      await client.delete('/users/me').set('x-csrf-token', token).expect(204);

      // Session is gone
      await client.get('/users/me').expect(401);

      // Row is soft-deleted, not gone
      const dbUser = await userRepository().findOne({
        where: {id: body.id},
        withDeleted: true,
      });
      expect(dbUser).not.toBeNull();
      expect(dbUser!.deletedAt).not.toBeNull();

      // Soft-deleted users can no longer log in
      await agent()
        .post('/auth/login')
        .send({email: DEFAULT_USER.email, password: DEFAULT_USER.password})
        .expect(401);
    });
  });

  describe('admin endpoints', () => {
    it('rejects a regular user with 403', async () => {
      const client = agent();
      await registerUser(client);

      await client.get('/admin/users').expect(403);
    });

    it('lists all users including soft-deleted ones for an admin', async () => {
      const client = agent();
      const {body} = await registerUser(client);
      const token = await getCsrfToken(client);
      await client.delete('/users/me').set('x-csrf-token', token).expect(204);

      const adminAgent = await seedAdmin(testApp);
      const response = await adminAgent.get('/admin/users').expect(200);

      const emails = response.body.data.map((user: User) => user.email);
      expect(emails).toContain(DEFAULT_USER.email);
      expect(emails).toContain(ADMIN_USER.email);

      const deleted = response.body.data.find(
        (user: User) => user.id === body.id
      );
      expect(deleted.deletedAt).not.toBeNull();
    });

    it('restores a soft-deleted user who can then log in again', async () => {
      const client = agent();
      const {body} = await registerUser(client);
      const token = await getCsrfToken(client);
      await client.delete('/users/me').set('x-csrf-token', token).expect(204);

      const adminAgent = await seedAdmin(testApp);
      const adminToken = await getCsrfToken(adminAgent);

      await adminAgent
        .patch(`/admin/users/${body.id}/restore`)
        .set('x-csrf-token', adminToken)
        .expect(204);

      await agent()
        .post('/auth/login')
        .send({email: DEFAULT_USER.email, password: DEFAULT_USER.password})
        .expect(201);
    });
  });

  describe('GET /users/:id (public profile)', () => {
    it('returns the preview profile without email', async () => {
      const client = agent();
      const {body} = await registerUser(client);

      const response = await client.get(`/users/${body.id}`).expect(200);

      expect(response.body.name).toBe(DEFAULT_USER.name);
      expect(response.body.email).toBeUndefined();
    });
  });
});
