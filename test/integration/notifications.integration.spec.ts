import request from 'supertest';
import {
  cleanDatabase,
  closeTestApp,
  createTestApp,
  getCsrfToken,
  registerUser,
  seedAdmin,
  type TestApp,
} from './test-utils';

describe('Notifications (integration)', () => {
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

  // An approved story by author A with A's own top-level comment on it, so
  // other members can read the story and reply.
  const setup = async () => {
    const author = agent();
    await registerUser(author, {email: 'author@test.com'});
    const authorToken = await getCsrfToken(author);

    const {body: story} = await author
      .post('/stories')
      .set('x-csrf-token', authorToken)
      .send({title: 'Discuss me', content: 'Something spooky'})
      .expect(201);

    const admin = await seedAdmin(testApp);
    const adminToken = await getCsrfToken(admin);
    await admin
      .patch(`/admin/stories/${story.id}/status`)
      .set('x-csrf-token', adminToken)
      .send({status: 'approved'})
      .expect(200);

    const {body: parentComment} = await author
      .post('/comments')
      .set('x-csrf-token', authorToken)
      .send({content: 'My own comment', storyId: story.id})
      .expect(201);

    return {author, authorToken, story, parentComment};
  };

  const replyAs = async (email: string, storyId: string, parentId: string) => {
    const replier = agent();
    await registerUser(replier, {email});
    const token = await getCsrfToken(replier);
    await replier
      .post('/comments')
      .set('x-csrf-token', token)
      .send({content: 'A reply', storyId, parentId})
      .expect(201);
    return replier;
  };

  it('notifies the parent author when another member replies', async () => {
    const {author, story, parentComment} = await setup();
    await replyAs('replier@test.com', story.id, parentComment.id);

    const list = await author.get('/users/me/notifications').expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.data[0]).toMatchObject({
      type: 'reply',
      storyId: story.id,
      isRead: false,
    });
    expect(list.body.data[0].actorName).toBeTruthy();

    const count = await author
      .get('/users/me/notifications/unread-count')
      .expect(200);
    expect(count.body.count).toBe(1);
  });

  it('does not notify on a self-reply', async () => {
    const {author, authorToken, story, parentComment} = await setup();
    await author
      .post('/comments')
      .set('x-csrf-token', authorToken)
      .send({
        content: 'Replying to myself',
        storyId: story.id,
        parentId: parentComment.id,
      })
      .expect(201);

    const count = await author
      .get('/users/me/notifications/unread-count')
      .expect(200);
    expect(count.body.count).toBe(0);
  });

  it('does not notify the actor, only the recipient', async () => {
    const {story, parentComment} = await setup();
    const replier = await replyAs('replier@test.com', story.id, parentComment.id);

    const list = await replier.get('/users/me/notifications').expect(200);
    expect(list.body.total).toBe(0);
  });

  it('marks a notification read', async () => {
    const {author, authorToken, story, parentComment} = await setup();
    await replyAs('replier@test.com', story.id, parentComment.id);

    const list = await author.get('/users/me/notifications').expect(200);
    const id = list.body.data[0].id;

    await author
      .patch(`/users/me/notifications/${id}/read`)
      .set('x-csrf-token', authorToken)
      .expect(204);

    const count = await author
      .get('/users/me/notifications/unread-count')
      .expect(200);
    expect(count.body.count).toBe(0);
  });

  it('404s when marking a notification that does not exist', async () => {
    const {author, authorToken} = await setup();

    await author
      .patch(
        '/users/me/notifications/00000000-0000-0000-0000-000000000000/read'
      )
      .set('x-csrf-token', authorToken)
      .expect(404);
  });

  it("404s when marking another member's notification", async () => {
    const {author, story, parentComment} = await setup();
    const replier = await replyAs(
      'replier@test.com',
      story.id,
      parentComment.id
    );

    // The notification belongs to the author.
    const list = await author.get('/users/me/notifications').expect(200);
    const id = list.body.data[0].id;

    // A different member can't mark it read — it's not theirs, so it 404s
    // rather than silently succeeding.
    const replierToken = await getCsrfToken(replier);
    await replier
      .patch(`/users/me/notifications/${id}/read`)
      .set('x-csrf-token', replierToken)
      .expect(404);

    // It stays unread for the real recipient.
    const count = await author
      .get('/users/me/notifications/unread-count')
      .expect(200);
    expect(count.body.count).toBe(1);
  });

  it('marks all notifications read', async () => {
    const {author, authorToken, story, parentComment} = await setup();
    await replyAs('one@test.com', story.id, parentComment.id);
    await replyAs('two@test.com', story.id, parentComment.id);

    await author
      .patch('/users/me/notifications/read')
      .set('x-csrf-token', authorToken)
      .expect(204);

    const count = await author
      .get('/users/me/notifications/unread-count')
      .expect(200);
    expect(count.body.count).toBe(0);
  });
});
