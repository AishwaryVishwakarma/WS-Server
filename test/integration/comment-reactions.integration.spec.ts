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

describe('Comment reactions (integration)', () => {
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

  // An approved story with one top-level comment on it, posted by the author.
  const approvedStoryWithComment = async () => {
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

    const {body: comment} = await author
      .post('/comments')
      .set('x-csrf-token', authorToken)
      .send({content: 'Terrifying!', storyId: story.id})
      .expect(201);

    return {story, author, authorToken, comment};
  };

  const reader = async (email = 'reader@test.com') => {
    const client = agent();
    await registerUser(client, {email});
    const token = await getCsrfToken(client);
    return {client, token};
  };

  it('reacts to a comment, tracking the count (surfaced on the listing) and the id-set', async () => {
    const {story, comment} = await approvedStoryWithComment();
    const {client, token} = await reader();

    await client
      .put(`/comments/${comment.id}/react`)
      .set('x-csrf-token', token)
      .expect(204);

    const list = await agent().get(`/stories/${story.id}/comments`).expect(200);
    expect(list.body.data[0].reactionCount).toBe(1);

    const ids = await client.get('/users/me/comment-reactions/ids').expect(200);
    expect(ids.body).toEqual([comment.id]);
  });

  it('is idempotent — a repeat reaction keeps the count at one', async () => {
    const {story, comment} = await approvedStoryWithComment();
    const {client, token} = await reader();

    const react = () =>
      client.put(`/comments/${comment.id}/react`).set('x-csrf-token', token);
    await react().expect(204);
    await react().expect(204);

    const list = await agent().get(`/stories/${story.id}/comments`).expect(200);
    expect(list.body.data[0].reactionCount).toBe(1);
  });

  it('unreacts (decrementing), and a repeat unreact is a no-op', async () => {
    const {story, comment} = await approvedStoryWithComment();
    const {client, token} = await reader();

    await client
      .put(`/comments/${comment.id}/react`)
      .set('x-csrf-token', token)
      .expect(204);

    const unreact = () =>
      client.delete(`/comments/${comment.id}/react`).set('x-csrf-token', token);
    await unreact().expect(204);
    await unreact().expect(204);

    const list = await agent().get(`/stories/${story.id}/comments`).expect(200);
    expect(list.body.data[0].reactionCount).toBe(0);
    const ids = await client.get('/users/me/comment-reactions/ids').expect(200);
    expect(ids.body).toEqual([]);
  });

  it('does not notify the comment author (unlike a like)', async () => {
    const {author, comment} = await approvedStoryWithComment();
    const {client, token} = await reader();

    await client
      .put(`/comments/${comment.id}/react`)
      .set('x-csrf-token', token)
      .expect(204);

    const notifs = await author.get('/users/me/notifications').expect(200);
    expect(notifs.body.data).toHaveLength(0);
  });

  it('404s for an unknown comment', async () => {
    const {client, token} = await reader();

    await client
      .put('/comments/00000000-0000-0000-0000-000000000000/react')
      .set('x-csrf-token', token)
      .expect(404);
  });

  it('cannot react to a comment whose story is not visible (404), and gates anonymous', async () => {
    // A pending story — invisible to a non-author — with a comment posted by
    // the author (who can always see their own story).
    const author = agent();
    await registerUser(author, {email: 'author@test.com'});
    const authorToken = await getCsrfToken(author);
    const {body: pending} = await author
      .post('/stories')
      .set('x-csrf-token', authorToken)
      .send(STORY_PAYLOAD)
      .expect(201);
    const {body: comment} = await author
      .post('/comments')
      .set('x-csrf-token', authorToken)
      .send({content: 'Only I can see this', storyId: pending.id})
      .expect(201);

    const {client, token} = await reader();
    await client
      .put(`/comments/${comment.id}/react`)
      .set('x-csrf-token', token)
      .expect(404);

    const anon = agent();
    await anon.put(`/comments/${comment.id}/react`).expect(403); // CSRF before auth
    await anon.get('/users/me/comment-reactions/ids').expect(401);
  });
});
