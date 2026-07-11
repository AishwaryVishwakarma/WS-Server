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

describe('Tags (integration)', () => {
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

  const createTag = async (admin: Agent, name: string) => {
    const token = await getCsrfToken(admin);
    return admin.post('/admin/tags').set('x-csrf-token', token).send({name});
  };

  describe('POST /admin/tags', () => {
    it('rejects non-admin users with 403', async () => {
      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);

      await client
        .post('/admin/tags')
        .set('x-csrf-token', token)
        .send({name: 'horror'})
        .expect(403);
    });

    it('normalizes the tag name via entity hooks', async () => {
      const admin = await seedAdmin(testApp);

      const response = await createTag(admin, '  HoRRoR  ');

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('horror');
    });

    it('rejects duplicate names with 409 (real unique constraint)', async () => {
      const admin = await seedAdmin(testApp);

      await createTag(admin, 'horror');
      const duplicate = await createTag(admin, 'HORROR '); // normalizes to the same name

      expect(duplicate.status).toBe(409);
    });
  });

  describe('GET /tags', () => {
    it('lists tags for any logged-in user with pagination metadata', async () => {
      const admin = await seedAdmin(testApp);
      await createTag(admin, 'horror');
      await createTag(admin, 'paranormal');

      const client = agent();
      await registerUser(client);

      const response = await client.get('/tags').expect(200);

      expect(response.body.total).toBe(2);
      const names = response.body.data.map((tag: {name: string}) => tag.name);
      expect(names).toEqual(expect.arrayContaining(['horror', 'paranormal']));
    });

    it('rejects unauthenticated requests', async () => {
      await agent().get('/tags').expect(401);
    });
  });

  describe('DELETE /admin/tags/:id', () => {
    it('deletes an unused tag', async () => {
      const admin = await seedAdmin(testApp);
      const tag = await createTag(admin, 'horror');
      const token = await getCsrfToken(admin);

      await admin
        .delete(`/admin/tags/${tag.body.id}`)
        .set('x-csrf-token', token)
        .expect(204);
    });

    it('refuses to delete a tag attached to a story', async () => {
      const admin = await seedAdmin(testApp);
      const tag = await createTag(admin, 'horror');

      const client = agent();
      await registerUser(client);
      const userToken = await getCsrfToken(client);
      await client
        .post('/stories')
        .set('x-csrf-token', userToken)
        .send({title: 'Tagged story', content: 'Boo!', tags: [tag.body.id]})
        .expect(201);

      const token = await getCsrfToken(admin);
      await admin
        .delete(`/admin/tags/${tag.body.id}`)
        .set('x-csrf-token', token)
        .expect(409);
    });
  });
});
