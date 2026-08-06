import request from 'supertest';
import {
  cleanDatabase,
  closeTestApp,
  createTestApp,
  getCsrfToken,
  registerUser,
  seedAdmin,
  type Agent,
  type TestApp,
} from './test-utils';

describe('Settings (integration)', () => {
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

  const setRequireApproval = async (admin: Agent, value: boolean) => {
    const token = await getCsrfToken(admin);
    return admin
      .patch('/admin/settings')
      .set('x-csrf-token', token)
      .send({requireStoryApproval: value});
  };

  describe('GET /admin/settings', () => {
    it('rejects non-admin users with 403', async () => {
      const client = agent();
      await registerUser(client);

      await client.get('/admin/settings').expect(403);
    });

    it('defaults to requiring approval', async () => {
      const admin = await seedAdmin(testApp);

      const response = await admin.get('/admin/settings').expect(200);

      expect(response.body.requireStoryApproval).toBe(true);
    });
  });

  describe('GET /settings (public)', () => {
    it('is readable by an anonymous visitor', async () => {
      const response = await agent().get('/settings').expect(200);

      expect(response.body.requireStoryApproval).toBe(true);
    });

    it('reflects the current value and omits admin-only fields', async () => {
      const admin = await seedAdmin(testApp);
      await setRequireApproval(admin, false);

      const response = await agent().get('/settings').expect(200);

      expect(response.body.requireStoryApproval).toBe(false);
      expect(response.body.updatedAt).toBeUndefined();
    });
  });

  describe('PATCH /admin/settings', () => {
    it('rejects non-admin users with 403', async () => {
      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);

      await client
        .patch('/admin/settings')
        .set('x-csrf-token', token)
        .send({requireStoryApproval: false})
        .expect(403);
    });

    it('persists the new value', async () => {
      const admin = await seedAdmin(testApp);

      const response = await setRequireApproval(admin, false);

      expect(response.status).toBe(200);
      expect(response.body.requireStoryApproval).toBe(false);

      const refetched = await admin.get('/admin/settings').expect(200);
      expect(refetched.body.requireStoryApproval).toBe(false);
    });
  });

  describe('story creation follows the setting', () => {
    it('leaves new stories pending by default', async () => {
      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);

      const response = await client
        .post('/stories')
        .set('x-csrf-token', token)
        .send({title: 'A Story', content: 'Boo'.repeat(50)})
        .expect(201);

      expect(response.body.status).toBe('pending');
    });

    it('publishes new stories immediately once approval is turned off', async () => {
      const admin = await seedAdmin(testApp);
      await setRequireApproval(admin, false);

      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);

      const response = await client
        .post('/stories')
        .set('x-csrf-token', token)
        .send({title: 'A Story', content: 'Boo'.repeat(50)})
        .expect(201);

      expect(response.body.status).toBe('approved');
    });
  });
});
