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

describe('Scare ratings (integration)', () => {
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

    return {story, author, authorToken};
  };

  const reader = async (email = 'reader@test.com') => {
    const client = agent();
    await registerUser(client, {email});
    const token = await getCsrfToken(client);
    return {client, token};
  };

  it('casts a vote, reflected in the aggregate and the my-votes map', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/scare-rating`)
      .set('x-csrf-token', token)
      .send({value: 4})
      .expect(204);

    const detail = await agent().get(`/stories/${story.id}`).expect(200);
    expect(detail.body.scareRatingAverage).toBe(4);
    expect(detail.body.scareRatingCount).toBe(1);

    const mine = await client.get('/users/me/scare-ratings').expect(200);
    expect(mine.body).toEqual({[story.id]: 4});
  });

  it('averages votes from distinct members', async () => {
    const {story} = await approvedStory();
    const r1 = await reader('r1@test.com');
    const r2 = await reader('r2@test.com');

    await r1.client
      .put(`/stories/${story.id}/scare-rating`)
      .set('x-csrf-token', r1.token)
      .send({value: 5})
      .expect(204);
    await r2.client
      .put(`/stories/${story.id}/scare-rating`)
      .set('x-csrf-token', r2.token)
      .send({value: 2})
      .expect(204);

    const detail = await agent().get(`/stories/${story.id}`).expect(200);
    expect(detail.body.scareRatingAverage).toBe(3.5);
    expect(detail.body.scareRatingCount).toBe(2);
  });

  it('changing a vote adjusts the average without changing the count', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    const cast = (value: number) =>
      client
        .put(`/stories/${story.id}/scare-rating`)
        .set('x-csrf-token', token)
        .send({value})
        .expect(204);

    await cast(2);
    await cast(5);

    const detail = await agent().get(`/stories/${story.id}`).expect(200);
    expect(detail.body.scareRatingAverage).toBe(5);
    expect(detail.body.scareRatingCount).toBe(1);
  });

  it('removes a vote, restoring the prior average', async () => {
    const {story} = await approvedStory();
    const r1 = await reader('r1@test.com');
    const r2 = await reader('r2@test.com');

    await r1.client
      .put(`/stories/${story.id}/scare-rating`)
      .set('x-csrf-token', r1.token)
      .send({value: 5})
      .expect(204);
    await r2.client
      .put(`/stories/${story.id}/scare-rating`)
      .set('x-csrf-token', r2.token)
      .send({value: 1})
      .expect(204);

    await r2.client
      .delete(`/stories/${story.id}/scare-rating`)
      .set('x-csrf-token', r2.token)
      .expect(204);

    const detail = await agent().get(`/stories/${story.id}`).expect(200);
    expect(detail.body.scareRatingAverage).toBe(5);
    expect(detail.body.scareRatingCount).toBe(1);

    const mine = await r2.client.get('/users/me/scare-ratings').expect(200);
    expect(mine.body).toEqual({});
  });

  it('rejects an out-of-range value with 400', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/scare-rating`)
      .set('x-csrf-token', token)
      .send({value: 6})
      .expect(400);
  });

  it('cannot vote on a story that is not visible (404), and gates anonymous', async () => {
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
      .put(`/stories/${pending.id}/scare-rating`)
      .set('x-csrf-token', token)
      .send({value: 3})
      .expect(404);

    const anon = agent();
    await anon
      .put(`/stories/${pending.id}/scare-rating`)
      .send({value: 3})
      .expect(403); // CSRF before auth
    await anon.get('/users/me/scare-ratings').expect(401);
  });
});
