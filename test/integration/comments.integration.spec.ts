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

describe('Comments (integration)', () => {
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

  // Author + story fixture shared by most tests
  const createStoryFixture = async () => {
    const client = agent();
    const {body: author} = await registerUser(client);
    const token = await getCsrfToken(client);

    const story = await client
      .post('/stories')
      .set('x-csrf-token', token)
      .send({title: 'A story to discuss', content: 'Something spooky'})
      .expect(201);

    return {client, token, author, story: story.body};
  };

  it('lets an admin search all comments by content', async () => {
    const {client, token, story} = await createStoryFixture();
    await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({content: 'The attic scene was chilling', storyId: story.id})
      .expect(201);
    await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({content: 'Lovely pacing throughout', storyId: story.id})
      .expect(201);

    const admin = await seedAdmin(testApp);
    const response = await admin
      .get('/admin/comments?search=chilling')
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0].content).toContain('attic');
  });

  it('creates a comment on a story', async () => {
    const {client, token, story} = await createStoryFixture();

    const response = await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({content: 'Terrifying!', storyId: story.id})
      .expect(201);

    expect(response.body.content).toBe('Terrifying!');
  });

  it('lists a story’s comments with pagination', async () => {
    const {client, token, story} = await createStoryFixture();

    for (let i = 1; i <= 3; i++) {
      await client
        .post('/comments')
        .set('x-csrf-token', token)
        .send({content: `Comment ${i}`, storyId: story.id})
        .expect(201);
    }

    const page = await client
      .get(`/stories/${story.id}/comments`)
      .query({page: 1, limit: 2})
      .expect(200);

    expect(page.body.total).toBe(3);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.totalPages).toBe(2);
  });

  it('lists the current user’s own comments', async () => {
    const {client, token, story} = await createStoryFixture();

    await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({content: 'Mine', storyId: story.id})
      .expect(201);

    const response = await client.get('/users/me/comments').expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0].content).toBe('Mine');
  });

  it('returns /me comments as an activity feed with story context and reply engagement', async () => {
    const {client, token, story} = await createStoryFixture();

    const mine = await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({content: 'A thread I started', storyId: story.id})
      .expect(201);

    // Someone else replies to my comment (author can see their own pending story).
    await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({
        content: 'A reply to my own thread',
        storyId: story.id,
        parentId: mine.body.id,
      })
      .expect(201);

    const response = await client.get('/users/me/comments').expect(200);
    expect(response.body.total).toBe(2);

    const started = response.body.data.find(
      (c: {id: string}) => c.id === mine.body.id
    );
    const reply = response.body.data.find(
      (c: {content: string}) => c.content === 'A reply to my own thread'
    );

    // The started comment carries engagement + embedded story context.
    expect(started.replyCount).toBe(1);
    expect(started.parentId).toBeNull();
    expect(started.story.id).toBe(story.id);
    expect(started.story.title).toBe('A story to discuss');

    // The reply points back at its parent.
    expect(reply.parentId).toBe(mine.body.id);
    expect(reply.replyCount).toBe(0);
  });

  it('does not leak moderation fields on /me comments', async () => {
    const {client, token, story} = await createStoryFixture();
    const mine = await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({content: 'Report me', storyId: story.id})
      .expect(201);

    // A different member reports it, so the raw entity now has isFlagged/reportCount.
    const reporter = agent();
    await registerUser(reporter, {email: 'nosy@test.com'});
    const reporterToken = await getCsrfToken(reporter);
    await reporter
      .post(`/comments/${mine.body.id}/report`)
      .set('x-csrf-token', reporterToken)
      .expect(204);

    const response = await client.get('/users/me/comments').expect(200);
    const item = response.body.data[0];
    expect(item).not.toHaveProperty('reportCount');
    expect(item).not.toHaveProperty('isFlagged');
    expect(item).not.toHaveProperty('user');
  });

  it('allows the author to update and delete their comment', async () => {
    const {client, token, story} = await createStoryFixture();

    const comment = await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({content: 'First draft', storyId: story.id})
      .expect(201);

    const updated = await client
      .patch(`/comments/${comment.body.id}`)
      .set('x-csrf-token', token)
      .send({content: 'Second draft'})
      .expect(200);
    expect(updated.body.content).toBe('Second draft');

    await client
      .delete(`/comments/${comment.body.id}`)
      .set('x-csrf-token', token)
      .expect(204);
  });

  it('rejects comment updates from another user with 403', async () => {
    const {client, token, story} = await createStoryFixture();

    const comment = await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({content: 'Original', storyId: story.id})
      .expect(201);

    const otherClient = agent();
    await registerUser(otherClient, {email: 'other@test.com'});
    const otherToken = await getCsrfToken(otherClient);

    await otherClient
      .patch(`/comments/${comment.body.id}`)
      .set('x-csrf-token', otherToken)
      .send({content: 'Hijacked'})
      .expect(403);
  });

  it('rejects commenting on a story the user cannot see', async () => {
    // createStoryFixture leaves the story pending and owned by its author
    const {story} = await createStoryFixture();

    const intruder = agent();
    await registerUser(intruder, {email: 'intruder@test.com'});
    const token = await getCsrfToken(intruder);

    await intruder
      .post('/comments')
      .set('x-csrf-token', token)
      .send({content: 'Can I see this?', storyId: story.id})
      .expect(404);
  });

  it('creates a reply and keeps it out of the top-level list', async () => {
    const {client, token, story} = await createStoryFixture();

    const parent = await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({content: 'The ending got me', storyId: story.id})
      .expect(201);

    await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({
        content: 'Right? I did not see it coming',
        storyId: story.id,
        parentId: parent.body.id,
      })
      .expect(201);

    // Top-level list shows only the parent, annotated with its reply count.
    const topLevel = await client
      .get(`/stories/${story.id}/comments`)
      .expect(200);
    expect(topLevel.body.total).toBe(1);
    expect(topLevel.body.data[0].id).toBe(parent.body.id);
    expect(topLevel.body.data[0].replyCount).toBe(1);

    // The dedicated replies route returns the child.
    const replies = await client
      .get(`/stories/${story.id}/comments/${parent.body.id}/replies`)
      .expect(200);
    expect(replies.body.total).toBe(1);
    expect(replies.body.data[0].content).toContain('see it coming');
  });

  it('re-roots a reply-to-a-reply onto the top-level parent (one level deep)', async () => {
    const {client, token, story} = await createStoryFixture();

    const parent = await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({content: 'Top level', storyId: story.id})
      .expect(201);

    const reply = await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({content: 'A reply', storyId: story.id, parentId: parent.body.id})
      .expect(201);

    // Replying to the reply should attach to the same top-level parent.
    await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({
        content: 'Reply to the reply',
        storyId: story.id,
        parentId: reply.body.id,
      })
      .expect(201);

    const replies = await client
      .get(`/stories/${story.id}/comments/${parent.body.id}/replies`)
      .expect(200);
    expect(replies.body.total).toBe(2);
  });

  it('rejects replying to a comment from a different story', async () => {
    const {client, token, story} = await createStoryFixture();
    const parent = await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({content: 'Parent here', storyId: story.id})
      .expect(201);

    const other = await client
      .post('/stories')
      .set('x-csrf-token', token)
      .send({title: 'A different tale', content: 'Elsewhere'})
      .expect(201);

    await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({
        content: 'Wrong story',
        storyId: other.body.id,
        parentId: parent.body.id,
      })
      .expect(400);
  });

  it('cascades reply deletion and keeps the story comment count correct', async () => {
    const {client, token, story} = await createStoryFixture();

    const parent = await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({content: 'Parent', storyId: story.id})
      .expect(201);
    for (let i = 1; i <= 2; i++) {
      await client
        .post('/comments')
        .set('x-csrf-token', token)
        .send({
          content: `Reply ${i}`,
          storyId: story.id,
          parentId: parent.body.id,
        })
        .expect(201);
    }

    const before = await client.get(`/stories/${story.id}`).expect(200);
    expect(before.body.commentCount).toBe(3);

    // Deleting the parent cascades its two replies; the count sheds all three.
    await client
      .delete(`/comments/${parent.body.id}`)
      .set('x-csrf-token', token)
      .expect(204);

    const after = await client.get(`/stories/${story.id}`).expect(200);
    expect(after.body.commentCount).toBe(0);

    const topLevel = await client
      .get(`/stories/${story.id}/comments`)
      .expect(200);
    expect(topLevel.body.total).toBe(0);
  });

  it('exposes all comments to admins only', async () => {
    const {client, token, story} = await createStoryFixture();

    await client
      .post('/comments')
      .set('x-csrf-token', token)
      .send({content: 'Visible to admins', storyId: story.id})
      .expect(201);

    await client.get('/admin/comments').expect(403);

    const admin = await seedAdmin(testApp);
    const response = await admin.get('/admin/comments').expect(200);
    expect(response.body.total).toBe(1);
  });

  describe('moderation via member reports', () => {
    // An authored comment plus a second member ready to report it.
    const reportFixture = async () => {
      const {client, token, story} = await createStoryFixture();
      const comment = await client
        .post('/comments')
        .set('x-csrf-token', token)
        .send({content: 'Something objectionable', storyId: story.id})
        .expect(201);

      const reporter = agent();
      await registerUser(reporter, {email: 'reporter@test.com'});
      const reporterToken = await getCsrfToken(reporter);

      return {
        commentId: comment.body.id as string,
        reporter,
        reporterToken,
      };
    };

    it('flags a reported comment into the admin queue and resolves it', async () => {
      const {commentId, reporter, reporterToken} = await reportFixture();

      await reporter
        .post(`/comments/${commentId}/report`)
        .set('x-csrf-token', reporterToken)
        .expect(204);

      const admin = await seedAdmin(testApp);

      // The queue surfaces only reported comments, annotated with the count.
      const queue = await admin.get('/admin/comments?flagged=true').expect(200);
      expect(queue.body.total).toBe(1);
      expect(queue.body.data[0].id).toBe(commentId);
      expect(queue.body.data[0].isFlagged).toBe(true);
      expect(queue.body.data[0].reportCount).toBe(1);

      // Resolving clears the flag, emptying the queue but keeping the comment.
      const adminToken = await getCsrfToken(admin);
      await admin
        .patch(`/admin/comments/${commentId}/resolve`)
        .set('x-csrf-token', adminToken)
        .expect(200);

      const afterQueue = await admin
        .get('/admin/comments?flagged=true')
        .expect(200);
      expect(afterQueue.body.total).toBe(0);

      const fullList = await admin.get('/admin/comments').expect(200);
      expect(fullList.body.total).toBe(1);
    });

    it('rejects a duplicate report from the same member with 409', async () => {
      const {commentId, reporter, reporterToken} = await reportFixture();

      await reporter
        .post(`/comments/${commentId}/report`)
        .set('x-csrf-token', reporterToken)
        .expect(204);

      await reporter
        .post(`/comments/${commentId}/report`)
        .set('x-csrf-token', reporterToken)
        .expect(409);

      const admin = await seedAdmin(testApp);
      const queue = await admin.get('/admin/comments?flagged=true').expect(200);
      expect(queue.body.data[0].reportCount).toBe(1);
    });

    it('forbids reporting your own comment', async () => {
      const {client, token, story} = await createStoryFixture();
      const comment = await client
        .post('/comments')
        .set('x-csrf-token', token)
        .send({content: 'My own words', storyId: story.id})
        .expect(201);

      await client
        .post(`/comments/${comment.body.id}/report`)
        .set('x-csrf-token', token)
        .expect(400);
    });

    it('orders the queue by report count, most-reported first', async () => {
      const {client, token, story} = await createStoryFixture();
      const lightly = await client
        .post('/comments')
        .set('x-csrf-token', token)
        .send({content: 'Mildly disliked', storyId: story.id})
        .expect(201);
      const heavily = await client
        .post('/comments')
        .set('x-csrf-token', token)
        .send({content: 'Widely reported', storyId: story.id})
        .expect(201);

      // Two members pile onto the second comment; one reports the first.
      for (const email of ['a@test.com', 'b@test.com']) {
        const reporter = agent();
        await registerUser(reporter, {email});
        const rt = await getCsrfToken(reporter);
        await reporter
          .post(`/comments/${heavily.body.id}/report`)
          .set('x-csrf-token', rt)
          .expect(204);
      }
      const solo = agent();
      await registerUser(solo, {email: 'c@test.com'});
      const soloToken = await getCsrfToken(solo);
      await solo
        .post(`/comments/${lightly.body.id}/report`)
        .set('x-csrf-token', soloToken)
        .expect(204);

      const admin = await seedAdmin(testApp);
      const queue = await admin.get('/admin/comments?flagged=true').expect(200);
      expect(queue.body.total).toBe(2);
      expect(queue.body.data[0].id).toBe(heavily.body.id);
      expect(queue.body.data[0].reportCount).toBe(2);
      expect(queue.body.data[1].id).toBe(lightly.body.id);
    });
  });
});
