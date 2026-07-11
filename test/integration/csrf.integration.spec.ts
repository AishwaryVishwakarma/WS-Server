import request from 'supertest';
import {
  cleanDatabase,
  closeTestApp,
  createTestApp,
  getCsrfToken,
  registerUser,
  type TestApp,
} from './test-utils';

const STORY_PAYLOAD = {
  title: 'A CSRF-protected story',
  content: 'Something is lurking in the request headers...',
};

describe('CSRF protection (integration)', () => {
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

  it('rejects a mutating request without a CSRF token', async () => {
    const client = agent();
    await registerUser(client);

    await client.post('/stories').send(STORY_PAYLOAD).expect(403);
  });

  it('accepts a mutating request with a valid token from the same session', async () => {
    const client = agent();
    await registerUser(client);
    const token = await getCsrfToken(client);

    await client
      .post('/stories')
      .set('x-csrf-token', token)
      .send(STORY_PAYLOAD)
      .expect(201);
  });

  it('rejects a token issued to a different session', async () => {
    const client = agent();
    await registerUser(client);

    const otherClient = agent();
    await registerUser(otherClient, {email: 'other@test.com'});
    const foreignToken = await getCsrfToken(otherClient);

    await client
      .post('/stories')
      .set('x-csrf-token', foreignToken)
      .send(STORY_PAYLOAD)
      .expect(403);
  });

  it('issues a token via GET /auth/csrf-token', async () => {
    const response = await agent().get('/auth/csrf-token').expect(200);

    expect(typeof response.body.csrfToken).toBe('string');
    expect(response.body.csrfToken.length).toBeGreaterThan(0);
  });
});
