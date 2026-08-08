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

  const setImageSettings = async (
    admin: Agent,
    values: {allowProfileImageUpload?: boolean; allowStoryCoverImage?: boolean}
  ) => {
    const token = await getCsrfToken(admin);
    return admin
      .patch('/admin/settings')
      .set('x-csrf-token', token)
      .send(values);
  };

  describe('GET /admin/settings', () => {
    it('rejects non-admin users with 403', async () => {
      const client = agent();
      await registerUser(client);

      await client.get('/admin/settings').expect(403);
    });

    it('defaults to requiring approval, with image uploads off', async () => {
      const admin = await seedAdmin(testApp);

      const response = await admin.get('/admin/settings').expect(200);

      expect(response.body.requireStoryApproval).toBe(true);
      expect(response.body.allowProfileImageUpload).toBe(false);
      expect(response.body.allowStoryCoverImage).toBe(false);
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

    it('persists the two image-upload toggles together in one request', async () => {
      const admin = await seedAdmin(testApp);

      const response = await setImageSettings(admin, {
        allowProfileImageUpload: true,
        allowStoryCoverImage: true,
      });

      expect(response.status).toBe(200);
      expect(response.body.allowProfileImageUpload).toBe(true);
      expect(response.body.allowStoryCoverImage).toBe(true);
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

  describe('profile image upload follows the setting', () => {
    it('drops profileImageUrl on registration by default', async () => {
      const client = agent();

      const {body} = await registerUser(client, {
        profileImageUrl: 'https://example.com/me.png',
      } as Record<string, unknown>);

      expect(body.profileImageUrl).toBeNull();
    });

    it('keeps profileImageUrl on registration once the setting is on', async () => {
      const admin = await seedAdmin(testApp);
      await setImageSettings(admin, {allowProfileImageUpload: true});

      const client = agent();
      const {body} = await registerUser(client, {
        profileImageUrl: 'https://example.com/me.png',
      } as Record<string, unknown>);

      expect(body.profileImageUrl).toBe('https://example.com/me.png');
    });

    it('always accepts avatarIcon regardless of the setting', async () => {
      const client = agent();

      const {body} = await registerUser(client, {
        avatarIcon: 'ghost',
      } as Record<string, unknown>);

      expect(body.avatarIcon).toBe('ghost');
    });

    it('rejects an avatarIcon value outside the curated set', async () => {
      const client = agent();

      await client
        .post('/auth/register')
        .send({
          name: 'Test User',
          email: 'user@test.com',
          password: 'S3cret!Password',
          avatarIcon: 'not-a-real-icon',
        })
        .expect(400);
    });

    it('always accepts avatarColor regardless of the setting', async () => {
      const client = agent();

      const {body} = await registerUser(client, {
        avatarColor: 'blood',
      } as Record<string, unknown>);

      expect(body.avatarColor).toBe('blood');
    });

    it('rejects an avatarColor value outside the curated set', async () => {
      const client = agent();

      await client
        .post('/auth/register')
        .send({
          name: 'Test User',
          email: 'user@test.com',
          password: 'S3cret!Password',
          avatarColor: 'not-a-real-color',
        })
        .expect(400);
    });
  });

  describe('story cover image follows the setting', () => {
    it('drops coverImageUrl on story creation by default', async () => {
      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);

      const response = await client
        .post('/stories')
        .set('x-csrf-token', token)
        .send({
          title: 'A Story',
          content: 'Boo'.repeat(50),
          coverImageUrl: 'https://example.com/cover.png',
        })
        .expect(201);

      expect(response.body.coverImageUrl).toBeNull();
    });

    it('keeps coverImageUrl on story creation once the setting is on', async () => {
      const admin = await seedAdmin(testApp);
      await setImageSettings(admin, {allowStoryCoverImage: true});

      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);

      const response = await client
        .post('/stories')
        .set('x-csrf-token', token)
        .send({
          title: 'A Story',
          content: 'Boo'.repeat(50),
          coverImageUrl: 'https://example.com/cover.png',
        })
        .expect(201);

      expect(response.body.coverImageUrl).toBe('https://example.com/cover.png');
    });
  });
});
