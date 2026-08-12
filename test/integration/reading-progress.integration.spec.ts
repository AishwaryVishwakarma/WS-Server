import request from 'supertest';
import {StoryStatus} from 'src/stories/enums/story-status.enum';
import {
  cleanDatabase,
  closeTestApp,
  createTestApp,
  getCsrfToken,
  registerUser,
  seedAdmin,
  type TestApp,
} from './test-utils';

const STORY_PAYLOAD = {
  title: 'The Whispering Shadow',
  content: 'x'.repeat(500),
  scareLevel: 4,
};

describe('Reading progress (integration)', () => {
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

  // Register an author, create a story, and have an admin approve it. Returns
  // the approved story plus the admin agent (so tests can re-moderate it).
  // Accepts an already-seeded admin so a test approving several stories
  // doesn't call seedAdmin (which always creates, not upserts) more than once.
  const approvedStory = async (
    title = STORY_PAYLOAD.title,
    existingAdmin?: {
      admin: Awaited<ReturnType<typeof seedAdmin>>;
      adminToken: string;
    }
  ) => {
    const author = agent();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await registerUser(author, {email: `author-${slug}@test.com`});
    const authorToken = await getCsrfToken(author);
    const {body: story} = await author
      .post('/stories')
      .set('x-csrf-token', authorToken)
      .send({...STORY_PAYLOAD, title})
      .expect(201);

    const admin = existingAdmin?.admin ?? (await seedAdmin(testApp));
    const adminToken = existingAdmin?.adminToken ?? (await getCsrfToken(admin));
    await admin
      .patch(`/admin/stories/${story.id}/status`)
      .set('x-csrf-token', adminToken)
      .send({status: StoryStatus.Approved})
      .expect(200);

    return {story, admin, adminToken};
  };

  // A signed-in reader (not the author).
  const reader = async (email = 'reader@test.com') => {
    const client = agent();
    await registerUser(client, {email});
    const token = await getCsrfToken(client);
    return {client, token};
  };

  it('records progress within the trackable range and lists it', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 42})
      .expect(204);

    const list = await client.get('/users/me/reading-progress').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].story.id).toBe(story.id);
    expect(list.body[0].percent).toBe(42);
    // Serialized like the public feed — author byline, no content.
    expect(list.body[0].story.author).toBeDefined();
    expect(list.body[0].story.content).toBeUndefined();
  });

  it('does not record a barely-started read', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 2})
      .expect(204);

    const list = await client.get('/users/me/reading-progress').expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('leaves an existing row alone on a brief scroll back near the top', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 40})
      .expect(204);
    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 2})
      .expect(204);

    const list = await client.get('/users/me/reading-progress').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].percent).toBe(40);
  });

  it('moves an effectively finished read into history', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 60})
      .expect(204);
    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 97})
      .expect(204);

    const list = await client.get('/users/me/reading-progress').expect(200);
    expect(list.body).toHaveLength(0);

    const history = await client.get('/users/me/reading-history').expect(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].story.id).toBe(story.id);
    expect(history.body[0].completedAt).toBeDefined();
  });

  it('upserts — a second write in range updates the same row', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 20})
      .expect(204);
    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 55})
      .expect(204);

    const list = await client.get('/users/me/reading-progress').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].percent).toBe(55);
  });

  it('orders the list by most-recently-read first', async () => {
    const admin = await seedAdmin(testApp);
    const adminToken = await getCsrfToken(admin);
    const {story: first} = await approvedStory('First Story', {
      admin,
      adminToken,
    });
    const {story: second} = await approvedStory('Second Story', {
      admin,
      adminToken,
    });
    const {client, token} = await reader();

    await client
      .put(`/stories/${first.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 30})
      .expect(204);
    await client
      .put(`/stories/${second.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 30})
      .expect(204);

    const list = await client.get('/users/me/reading-progress').expect(200);
    expect(list.body.map((row: {story: {id: string}}) => row.story.id)).toEqual(
      [second.id, first.id]
    );
  });

  it('drops a story from the list once it is no longer approved', async () => {
    const {story, admin, adminToken} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 30})
      .expect(204);

    await admin
      .patch(`/admin/stories/${story.id}/status`)
      .set('x-csrf-token', adminToken)
      .send({status: StoryStatus.Flagged})
      .expect(200);

    const list = await client.get('/users/me/reading-progress').expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('cannot record progress on a story not visible to the reader (404)', async () => {
    // A pending story (never approved) is invisible to a non-author.
    const author = agent();
    await registerUser(author, {email: 'author@test.com'});
    const authorToken = await getCsrfToken(author);
    const {body: pending} = await author
      .post('/stories')
      .set('x-csrf-token', authorToken)
      .send(STORY_PAYLOAD)
      .expect(201);

    const {client, token} = await reader();
    await client
      .put(`/stories/${pending.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 30})
      .expect(404);
  });

  it('requires a session for every reading-progress route', async () => {
    const {story} = await approvedStory();
    const anon = agent();

    // No session → no CSRF token can be held, so the write 403s before the
    // auth guard; the read 401s.
    await anon
      .put(`/stories/${story.id}/reading-progress`)
      .send({percent: 30})
      .expect(403);
    await anon.get('/users/me/reading-progress').expect(401);
    await anon.get('/users/me/reading-history').expect(401);
  });
});
