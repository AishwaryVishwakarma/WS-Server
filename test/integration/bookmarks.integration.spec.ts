import request from 'supertest';
import {StoryStatus} from 'src/stories/enums/story-status.enum';
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

const STORY_PAYLOAD = {
  title: 'The Whispering Shadow',
  content: 'x'.repeat(500),
  scareLevel: 4,
};

describe('Bookmarks (integration)', () => {
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
  const approvedStory = async () => {
    const author = agent();
    await registerUser(author, {email: 'author@test.com'});
    const authorToken = await getCsrfToken(author);
    const {body: story} = await author
      .post('/stories')
      .set('x-csrf-token', authorToken)
      .send(STORY_PAYLOAD)
      .expect(201);

    const admin = await seedAdmin(testApp);
    const adminToken = await getCsrfToken(admin);
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

  it('saves a story, lists it, and reports its id', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/bookmark`)
      .set('x-csrf-token', token)
      .expect(204);

    const list = await client.get('/users/me/bookmarks').expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.data[0].id).toBe(story.id);
    // Serialized like the public feed — author byline, no content.
    expect(list.body.data[0].author).toBeDefined();
    expect(list.body.data[0].content).toBeUndefined();

    const ids = await client.get('/users/me/bookmarks/ids').expect(200);
    expect(ids.body).toEqual([story.id]);
  });

  it('is idempotent — bookmarking twice keeps a single row', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/bookmark`)
      .set('x-csrf-token', token)
      .expect(204);
    await client
      .put(`/stories/${story.id}/bookmark`)
      .set('x-csrf-token', token)
      .expect(204);

    const list = await client.get('/users/me/bookmarks').expect(200);
    expect(list.body.total).toBe(1);
  });

  it('removes a bookmark, and DELETE is a no-op when absent', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    // No-op delete before it was ever saved.
    await client
      .delete(`/stories/${story.id}/bookmark`)
      .set('x-csrf-token', token)
      .expect(204);

    await client
      .put(`/stories/${story.id}/bookmark`)
      .set('x-csrf-token', token)
      .expect(204);
    await client
      .delete(`/stories/${story.id}/bookmark`)
      .set('x-csrf-token', token)
      .expect(204);

    const ids = await client.get('/users/me/bookmarks/ids').expect(200);
    expect(ids.body).toEqual([]);
  });

  it('drops a story from the reading list once it is no longer approved', async () => {
    const {story, admin, adminToken} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/bookmark`)
      .set('x-csrf-token', token)
      .expect(204);

    // Admin flags the story — it leaves the public feed and the reading list.
    await admin
      .patch(`/admin/stories/${story.id}/status`)
      .set('x-csrf-token', adminToken)
      .send({status: StoryStatus.Flagged})
      .expect(200);

    const list = await client.get('/users/me/bookmarks').expect(200);
    expect(list.body.total).toBe(0);
    // The id set only reflects rows, not visibility — the row still exists.
    const ids = await client.get('/users/me/bookmarks/ids').expect(200);
    expect(ids.body).toEqual([story.id]);
  });

  it('cannot bookmark a story that is not visible to the reader (404)', async () => {
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
      .put(`/stories/${pending.id}/bookmark`)
      .set('x-csrf-token', token)
      .expect(404);
  });

  it('requires a session for every bookmark route', async () => {
    const {story} = await approvedStory();
    const anon = agent();

    // No session → no CSRF token can be held, so mutations 403 before the
    // auth guard; the reads 401.
    await anon.put(`/stories/${story.id}/bookmark`).expect(403);
    await anon.get('/users/me/bookmarks').expect(401);
    await anon.get('/users/me/bookmarks/ids').expect(401);
  });
});
