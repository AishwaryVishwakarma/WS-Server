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

describe('Mutes (integration)', () => {
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

  const member = async (email: string) => {
    const client = agent();
    const {body} = await registerUser(client, {
      email,
      name: email.split('@')[0],
    });
    const token = await getCsrfToken(client);
    return {client, token, id: body.id};
  };

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

  it('mutes an author, reflected only in the muter’s own id set', async () => {
    const author = await authorWithStory('author@test.com');
    const {client, token} = await member('reader@test.com');

    await client
      .put(`/users/${author.id}/mute`)
      .set('x-csrf-token', token)
      .expect(204);

    const ids = await client.get('/users/me/muted/ids').expect(200);
    expect(ids.body).toEqual([author.id]);

    // No public trace at all — not even on the author's own side.
    const authorIds = await author.client
      .get('/users/me/muted/ids')
      .expect(200);
    expect(authorIds.body).toEqual([]);
  });

  it('is idempotent and unmute is a no-op when absent', async () => {
    const author = await authorWithStory('author@test.com');
    const {client, token} = await member('reader@test.com');

    const mute = () =>
      client.put(`/users/${author.id}/mute`).set('x-csrf-token', token);
    await mute().expect(204);
    await mute().expect(204);

    const ids = await client.get('/users/me/muted/ids').expect(200);
    expect(ids.body).toEqual([author.id]);

    const unmute = () =>
      client.delete(`/users/${author.id}/mute`).set('x-csrf-token', token);
    await unmute().expect(204);
    await unmute().expect(204);

    const after = await client.get('/users/me/muted/ids').expect(200);
    expect(after.body).toEqual([]);
  });

  it('rejects muting yourself with 400', async () => {
    const {client, token, id} = await member('self@test.com');

    await client
      .put(`/users/${id}/mute`)
      .set('x-csrf-token', token)
      .expect(400);
  });

  it('rejects muting an unknown user with 404', async () => {
    const {client, token} = await member('reader@test.com');

    await client
      .put('/users/00000000-0000-0000-0000-000000000000/mute')
      .set('x-csrf-token', token)
      .expect(404);
  });

  it('creates no notification for a mute', async () => {
    const author = await authorWithStory('author@test.com');
    const {client, token} = await member('reader@test.com');

    await client
      .put(`/users/${author.id}/mute`)
      .set('x-csrf-token', token)
      .expect(204);

    const notifs = await author.client
      .get('/users/me/notifications')
      .expect(200);
    expect(notifs.body.data).toHaveLength(0);
  });

  it('lists muted authors with full previews (self-only)', async () => {
    const author = await authorWithStory('author@test.com');
    const {client, token} = await member('reader@test.com');

    await client
      .put(`/users/${author.id}/mute`)
      .set('x-csrf-token', token)
      .expect(204);

    const muted = await client.get('/users/me/muted').expect(200);
    expect(muted.body.total).toBe(1);
    expect(muted.body.data[0].id).toBe(author.id);
    expect(muted.body.data[0].email).toBeUndefined();
  });

  it('requires a session for every route', async () => {
    const author = await authorWithStory('author@test.com');
    const anon = agent();

    await anon.put(`/users/${author.id}/mute`).expect(403); // CSRF before auth
    await anon.get('/users/me/muted/ids').expect(401);
    await anon.get('/users/me/muted').expect(401);
  });
});
