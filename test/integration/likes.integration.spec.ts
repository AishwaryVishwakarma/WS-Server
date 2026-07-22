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

describe('Likes (integration)', () => {
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

  const approvedStory = async () => {
    const author = agent();
    await registerUser(author, {email: 'author@test.com', name: 'author'});
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

    return {story, author, authorToken, admin, adminToken};
  };

  const reader = async (email = 'reader@test.com') => {
    const client = agent();
    await registerUser(client, {email});
    const token = await getCsrfToken(client);
    return {client, token};
  };

  it('likes a story, tracking the count and the id-set', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/like`)
      .set('x-csrf-token', token)
      .expect(204);

    const detail = await agent().get(`/stories/${story.id}`).expect(200);
    expect(detail.body.likeCount).toBe(1);

    const ids = await client.get('/users/me/likes/ids').expect(200);
    expect(ids.body).toEqual([story.id]);
  });

  it('is idempotent — a repeat like keeps the count at one', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    const like = () =>
      client.put(`/stories/${story.id}/like`).set('x-csrf-token', token);
    await like().expect(204);
    await like().expect(204);

    const detail = await agent().get(`/stories/${story.id}`).expect(200);
    expect(detail.body.likeCount).toBe(1);
  });

  it('unlikes (decrementing), and a repeat unlike is a no-op', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/like`)
      .set('x-csrf-token', token)
      .expect(204);

    const unlike = () =>
      client.delete(`/stories/${story.id}/like`).set('x-csrf-token', token);
    await unlike().expect(204);
    await unlike().expect(204);

    const detail = await agent().get(`/stories/${story.id}`).expect(200);
    expect(detail.body.likeCount).toBe(0);
    const ids = await client.get('/users/me/likes/ids').expect(200);
    expect(ids.body).toEqual([]);
  });

  it('counts likes from distinct members and sorts by most-liked', async () => {
    // Reuse the admin from the first story (seedAdmin can only create the one
    // admin account — calling it twice would collide on the email).
    const {story: quiet, admin, adminToken} = await approvedStory();

    // A second approved story, by a different author.
    const author2 = agent();
    await registerUser(author2, {email: 'author2@test.com'});
    const token2 = await getCsrfToken(author2);
    const {body: popular} = await author2
      .post('/stories')
      .set('x-csrf-token', token2)
      .send({...STORY_PAYLOAD, title: 'The Popular One'})
      .expect(201);
    await admin
      .patch(`/admin/stories/${popular.id}/status`)
      .set('x-csrf-token', adminToken)
      .send({status: StoryStatus.Approved})
      .expect(200);

    const r1 = await reader('r1@test.com');
    const r2 = await reader('r2@test.com');
    await r1.client
      .put(`/stories/${popular.id}/like`)
      .set('x-csrf-token', r1.token)
      .expect(204);
    await r2.client
      .put(`/stories/${popular.id}/like`)
      .set('x-csrf-token', r2.token)
      .expect(204);
    await r1.client
      .put(`/stories/${quiet.id}/like`)
      .set('x-csrf-token', r1.token)
      .expect(204);

    const feed = await agent().get('/stories?sort=most-liked').expect(200);
    expect(feed.body.data[0].id).toBe(popular.id);
    expect(feed.body.data[0].likeCount).toBe(2);
  });

  it('notifies the author when their story is liked (once, not on self/repeat)', async () => {
    const {story, author, authorToken} = await approvedStory();

    // The author liking their own story does not notify.
    await author
      .put(`/stories/${story.id}/like`)
      .set('x-csrf-token', authorToken)
      .expect(204);

    // A reader likes it twice — one notification, no duplicate.
    const {client, token} = await reader();
    const like = () =>
      client.put(`/stories/${story.id}/like`).set('x-csrf-token', token);
    await like().expect(204);
    await like().expect(204);

    const notifs = await author.get('/users/me/notifications').expect(200);
    const likes = notifs.body.data.filter(
      (n: {type: string}) => n.type === 'like'
    );
    expect(likes).toHaveLength(1);
    expect(likes[0].storyId).toBe(story.id);
    expect(likes[0].actorId).toBeTruthy();
  });

  it('cannot like a story that is not visible (404), and gates anonymous', async () => {
    // Pending story — invisible to a non-author.
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
      .put(`/stories/${pending.id}/like`)
      .set('x-csrf-token', token)
      .expect(404);

    const anon = agent();
    await anon.put(`/stories/${pending.id}/like`).expect(403); // CSRF before auth
    await anon.get('/users/me/likes/ids').expect(401);
  });
});
