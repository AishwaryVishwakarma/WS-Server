import request from 'supertest';
import {filter, firstValueFrom, timeout} from 'rxjs';
import {NotificationsStream} from 'src/notifications/notifications-stream.service';
import {
  cleanDatabase,
  closeTestApp,
  createTestApp,
  getCsrfToken,
  registerUser,
  seedAdmin,
  type TestApp,
} from './test-utils';

const eventType = (event: {data: unknown}) =>
  (event.data as {type: string}).type;

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

  // A fresh member posts a top-level comment (no parentId) on the story.
  const commentAs = async (email: string, storyId: string) => {
    const commenter = agent();
    await registerUser(commenter, {email});
    const token = await getCsrfToken(commenter);
    const {body: comment} = await commenter
      .post('/comments')
      .set('x-csrf-token', token)
      .send({content: 'A fresh whisper', storyId})
      .expect(201);
    return {commenter, comment};
  };

  it('notifies the parent author when another member replies', async () => {
    const {author, story, parentComment} = await setup();
    await replyAs('replier@test.com', story.id, parentComment.id);

    const list = await author.get('/users/me/notifications').expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.data[0]).toMatchObject({
      type: 'reply',
      storyId: story.id,
      // A reply carries the top-level thread id so the reader can expand it.
      parentId: parentComment.id,
      isRead: false,
    });
    expect(list.body.data[0].actorName).toBeTruthy();

    const count = await author
      .get('/users/me/notifications/unread-count')
      .expect(200);
    expect(count.body.count).toBe(1);
  });

  it('notifies the story author on a new top-level comment', async () => {
    const {author, story} = await setup();
    await commentAs('commenter@test.com', story.id);

    const list = await author.get('/users/me/notifications').expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.data[0]).toMatchObject({
      type: 'comment',
      storyId: story.id,
      // A top-level comment is itself the target — no parent thread.
      parentId: null,
      isRead: false,
    });
  });

  it('does not notify the author commenting on their own story', async () => {
    // setup() already posts the author's own top-level comment; it must not
    // notify them.
    const {author} = await setup();

    const count = await author
      .get('/users/me/notifications/unread-count')
      .expect(200);
    expect(count.body.count).toBe(0);
  });

  it('a reply notifies only the parent author, not the story author too', async () => {
    // The author is both the story author and the parent-comment author here,
    // so a reply produces exactly one notification (the reply), never a
    // duplicate comment-on-story one.
    const {author, story, parentComment} = await setup();
    await replyAs('replier@test.com', story.id, parentComment.id);

    const list = await author.get('/users/me/notifications').expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.data[0].type).toBe('reply');
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
    const replier = await replyAs(
      'replier@test.com',
      story.id,
      parentComment.id
    );

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

  it('deletes a single notification', async () => {
    const {author, authorToken, story, parentComment} = await setup();
    await replyAs('replier@test.com', story.id, parentComment.id);

    const list = await author.get('/users/me/notifications').expect(200);
    const id = list.body.data[0].id;

    await author
      .delete(`/users/me/notifications/${id}`)
      .set('x-csrf-token', authorToken)
      .expect(204);

    const after = await author.get('/users/me/notifications').expect(200);
    expect(after.body.total).toBe(0);
  });

  it("404s when deleting another member's notification", async () => {
    const {author, story, parentComment} = await setup();
    const replier = await replyAs(
      'replier@test.com',
      story.id,
      parentComment.id
    );

    const list = await author.get('/users/me/notifications').expect(200);
    const id = list.body.data[0].id;

    const replierToken = await getCsrfToken(replier);
    await replier
      .delete(`/users/me/notifications/${id}`)
      .set('x-csrf-token', replierToken)
      .expect(404);

    // It survives for the real recipient.
    const after = await author.get('/users/me/notifications').expect(200);
    expect(after.body.total).toBe(1);
  });

  it('clears read notifications and keeps unread ones', async () => {
    const {author, authorToken, story, parentComment} = await setup();
    await replyAs('one@test.com', story.id, parentComment.id);
    await replyAs('two@test.com', story.id, parentComment.id);

    // Mark the first of the two read, then clear read.
    const list = await author.get('/users/me/notifications').expect(200);
    expect(list.body.total).toBe(2);
    await author
      .patch(`/users/me/notifications/${list.body.data[0].id}/read`)
      .set('x-csrf-token', authorToken)
      .expect(204);

    await author
      .delete('/users/me/notifications/read')
      .set('x-csrf-token', authorToken)
      .expect(204);

    const after = await author.get('/users/me/notifications').expect(200);
    expect(after.body.total).toBe(1);
    expect(after.body.data[0].isRead).toBe(false);
  });

  it('streams a live event to the recipient over Redis pub/sub', async () => {
    const stream = testApp.app.get(NotificationsStream);
    const userId = 'stream-user-1';

    // Grab the first real notification event (ignore heartbeats).
    const received = firstValueFrom(
      stream.streamFor(userId).pipe(
        filter((event) => eventType(event) === 'notification'),
        timeout({first: 3000})
      )
    );

    await stream.publish(userId, 'story-123');

    const event = await received;
    expect(eventType(event)).toBe('notification');
    // The frame carries the story so an open reader can refresh its thread.
    expect((event.data as {storyId?: string}).storyId).toBe('story-123');
  });

  it("does not deliver a user's event to another user's stream", async () => {
    const stream = testApp.app.get(NotificationsStream);

    const outcome = firstValueFrom(
      stream.streamFor('stream-user-a').pipe(
        filter((event) => eventType(event) === 'notification'),
        timeout({first: 800})
      )
    )
      .then(() => 'received')
      .catch(() => 'none');

    await stream.publish('stream-user-b');

    expect(await outcome).toBe('none');
  });
});
