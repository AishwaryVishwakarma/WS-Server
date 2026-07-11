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
});
