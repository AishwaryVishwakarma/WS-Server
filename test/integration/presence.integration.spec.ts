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

describe('Presence (integration)', () => {
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

  const heartbeat = async (client: Agent, storyId: string, tabId: string) => {
    const token = await getCsrfToken(client);
    return client
      .put(`/stories/${storyId}/presence`)
      .set('x-csrf-token', token)
      .send({tabId});
  };

  // Deliberately no CSRF token — sendBeacon (the real caller) can't attach
  // one, so this route must work without it.
  const leave = (client: Agent, storyId: string, tabId: string) =>
    client.post(`/stories/${storyId}/presence/leave`).send({tabId});

  const createApprovedStory = async (): Promise<string> => {
    const admin = await seedAdmin(testApp);
    const author = agent();
    await registerUser(author, {email: 'author@test.com'});
    const authorToken = await getCsrfToken(author);

    const created = await author
      .post('/stories')
      .set('x-csrf-token', authorToken)
      .send({title: 'A Story', content: 'Boo'.repeat(50)})
      .expect(201);

    const adminToken = await getCsrfToken(admin);
    await admin
      .patch(`/admin/stories/${created.body.id}/status`)
      .set('x-csrf-token', adminToken)
      .send({status: 'approved'})
      .expect(200);

    return created.body.id as string;
  };

  it('allows anonymous visitors and returns 0 for a lone heartbeat', async () => {
    const storyId = await createApprovedStory();
    const client = agent();

    const response = await heartbeat(client, storyId, 'tab-1');

    expect(response.status).toBe(200);
    expect(response.body.readerCount).toBe(0);
  });

  it('two distinct tabs on the same story each see the other', async () => {
    const storyId = await createApprovedStory();
    const readerA = agent();
    const readerB = agent();

    // A joins alone (sees 0), B joins and immediately sees A (1), then A
    // heartbeats again and now sees B too (1) — each excludes only itself.
    await heartbeat(readerA, storyId, 'tab-a');
    const responseB = await heartbeat(readerB, storyId, 'tab-b');
    const responseA = await heartbeat(readerA, storyId, 'tab-a');

    expect(responseA.body.readerCount).toBe(1);
    expect(responseB.body.readerCount).toBe(1);
  });

  it('returns 404 for a story that does not exist', async () => {
    const client = agent();

    await heartbeat(
      client,
      '00000000-0000-0000-0000-000000000000',
      'tab-1'
    ).then((response) => expect(response.status).toBe(404));
  });

  it('returns 0 for a story still pending review, without erroring', async () => {
    const author = agent();
    await registerUser(author, {email: 'author2@test.com'});
    const authorToken = await getCsrfToken(author);
    const created = await author
      .post('/stories')
      .set('x-csrf-token', authorToken)
      .send({title: 'Pending Story', content: 'Boo'.repeat(50)})
      .expect(201);

    const response = await heartbeat(
      agent(),
      created.body.id as string,
      'tab-1'
    );

    expect(response.status).toBe(200);
    expect(response.body.readerCount).toBe(0);
  });

  it('leave succeeds without a CSRF token, and drops the tab immediately', async () => {
    const storyId = await createApprovedStory();
    const readerA = agent();
    const readerB = agent();

    await heartbeat(readerA, storyId, 'tab-a');
    const beforeLeave = await heartbeat(readerB, storyId, 'tab-b');
    expect(beforeLeave.body.readerCount).toBe(1);

    await leave(readerA, storyId, 'tab-a').expect(204);

    const afterLeave = await heartbeat(readerB, storyId, 'tab-b');
    expect(afterLeave.body.readerCount).toBe(0);
  });
});
