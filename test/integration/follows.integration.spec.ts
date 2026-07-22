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

describe('Follows (integration)', () => {
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

  // A registered member with a CSRF token, plus their id.
  const member = async (email: string) => {
    const client = agent();
    const {body} = await registerUser(client, {email, name: email.split('@')[0]});
    const token = await getCsrfToken(client);
    return {client, token, id: body.id as string};
  };

  // An author with one approved story.
  const authorWithStory = async (email: string) => {
    const author = await member(email);
    const {body: story} = await author.client
      .post('/stories')
      .set('x-csrf-token', author.token)
      .send(STORY_PAYLOAD)
      .expect(201);

    const admin = await seedAdmin(testApp);
    const adminToken = await getCsrfToken(admin);
    await admin
      .patch(`/admin/stories/${story.id}/status`)
      .set('x-csrf-token', adminToken)
      .send({status: StoryStatus.Approved})
      .expect(200);

    return {...author, story};
  };

  it('follows an author, reflecting it in ids and public stats', async () => {
    const author = await authorWithStory('author@test.com');
    const {client, token} = await member('reader@test.com');

    await client
      .put(`/users/${author.id}/follow`)
      .set('x-csrf-token', token)
      .expect(204);

    const ids = await client.get('/users/me/following/ids').expect(200);
    expect(ids.body).toEqual([author.id]);

    // Stats are public — readable without a session.
    const stats = await agent()
      .get(`/users/${author.id}/follow-stats`)
      .expect(200);
    expect(stats.body).toEqual({followers: 1, following: 0});
  });

  it('is idempotent and unfollow is a no-op when absent', async () => {
    const author = await authorWithStory('author@test.com');
    const {client, token} = await member('reader@test.com');

    const follow = () =>
      client.put(`/users/${author.id}/follow`).set('x-csrf-token', token);
    await follow().expect(204);
    await follow().expect(204);

    const stats = await agent()
      .get(`/users/${author.id}/follow-stats`)
      .expect(200);
    expect(stats.body.followers).toBe(1);

    // Two unfollows — the second is a no-op.
    const unfollow = () =>
      client.delete(`/users/${author.id}/follow`).set('x-csrf-token', token);
    await unfollow().expect(204);
    await unfollow().expect(204);

    const after = await client.get('/users/me/following/ids').expect(200);
    expect(after.body).toEqual([]);
  });

  it('rejects following yourself with 400', async () => {
    const {client, token, id} = await member('self@test.com');

    await client
      .put(`/users/${id}/follow`)
      .set('x-csrf-token', token)
      .expect(400);
  });

  it('surfaces followed authors’ approved stories in the feed', async () => {
    const author = await authorWithStory('author@test.com');
    const {client, token} = await member('reader@test.com');

    // Empty before following anyone.
    const empty = await client.get('/users/me/feed').expect(200);
    expect(empty.body.total).toBe(0);

    await client
      .put(`/users/${author.id}/follow`)
      .set('x-csrf-token', token)
      .expect(204);

    const feed = await client.get('/users/me/feed').expect(200);
    expect(feed.body.total).toBe(1);
    expect(feed.body.data[0].id).toBe(author.story.id);
    expect(feed.body.data[0].author.id).toBe(author.id);
  });

  it('notifies the followed author (follow type, no story context)', async () => {
    const author = await authorWithStory('author@test.com');
    const {client, token} = await member('reader@test.com');

    await client
      .put(`/users/${author.id}/follow`)
      .set('x-csrf-token', token)
      .expect(204);

    const notifs = await author.client
      .get('/users/me/notifications')
      .expect(200);
    const follow = notifs.body.data.find(
      (n: {type: string}) => n.type === 'follow'
    );
    expect(follow).toBeDefined();
    expect(follow.actorId).toBeTruthy();
    expect(follow.actorName).toBe('reader');
    // A follow has no story/comment context.
    expect(follow.storyId).toBeNull();
    expect(follow.commentId).toBeNull();
  });

  it('does not notify again on a repeat (idempotent) follow', async () => {
    const author = await authorWithStory('author@test.com');
    const {client, token} = await member('reader@test.com');

    const follow = () =>
      client.put(`/users/${author.id}/follow`).set('x-csrf-token', token);
    await follow().expect(204);
    await follow().expect(204);

    const notifs = await author.client
      .get('/users/me/notifications')
      .expect(200);
    const follows = notifs.body.data.filter(
      (n: {type: string}) => n.type === 'follow'
    );
    expect(follows).toHaveLength(1);
  });

  it('lists who you follow and who follows you (self-only, no emails)', async () => {
    const author = await authorWithStory('author@test.com');
    const {client, token, id: readerId} = await member('reader@test.com');

    await client
      .put(`/users/${author.id}/follow`)
      .set('x-csrf-token', token)
      .expect(204);

    // The reader's own "following" list contains the author.
    const following = await client.get('/users/me/following').expect(200);
    expect(following.body.total).toBe(1);
    expect(following.body.data[0].id).toBe(author.id);
    // Preview tier — no email leaks into the people list.
    expect(following.body.data[0].email).toBeUndefined();

    // The author's own "followers" list contains the reader.
    const followers = await author.client
      .get('/users/me/followers')
      .expect(200);
    expect(followers.body.total).toBe(1);
    expect(followers.body.data[0].id).toBe(readerId);
  });

  it('requires a session for the gated routes', async () => {
    const author = await authorWithStory('author@test.com');
    const anon = agent();

    await anon.put(`/users/${author.id}/follow`).expect(403); // CSRF before auth
    await anon.get('/users/me/following/ids').expect(401);
    await anon.get('/users/me/feed').expect(401);
    await anon.get('/users/me/following').expect(401);
    await anon.get('/users/me/followers').expect(401);
    // Stats stay public.
    await anon.get(`/users/${author.id}/follow-stats`).expect(200);
  });
});
