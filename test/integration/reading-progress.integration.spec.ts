import request from 'supertest';
import {StoryStatus} from 'src/stories/enums/story-status.enum';
import {SeasonalEvent} from 'src/seasonal-events/entities/seasonal-event.entity';
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

describe('Reading progress (integration)', () => {
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
  // Accepts an already-seeded admin so a test approving several stories
  // doesn't call seedAdmin (which always creates, not upserts) more than once.
  const approvedStory = async (
    title = STORY_PAYLOAD.title,
    existingAdmin?: {
      admin: Awaited<ReturnType<typeof seedAdmin>>;
      adminToken: string;
    },
    tags: string[] = []
  ) => {
    const author = agent();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await registerUser(author, {email: `author-${slug}@test.com`});
    const authorToken = await getCsrfToken(author);
    const {body: story} = await author
      .post('/stories')
      .set('x-csrf-token', authorToken)
      .send({...STORY_PAYLOAD, title, tags})
      .expect(201);

    const admin = existingAdmin?.admin ?? (await seedAdmin(testApp));
    const adminToken = existingAdmin?.adminToken ?? (await getCsrfToken(admin));
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

  it('records progress within the trackable range and lists it', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 42})
      .expect(204);

    const list = await client.get('/users/me/reading-progress').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].story.id).toBe(story.id);
    expect(list.body[0].percent).toBe(42);
    // Serialized like the public feed — author byline, no content.
    expect(list.body[0].story.author).toBeDefined();
    expect(list.body[0].story.content).toBeUndefined();
  });

  it('does not record a barely-started read', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 2})
      .expect(204);

    const list = await client.get('/users/me/reading-progress').expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('leaves an existing row alone on a brief scroll back near the top', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 40})
      .expect(204);
    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 2})
      .expect(204);

    const list = await client.get('/users/me/reading-progress').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].percent).toBe(40);
  });

  it('explicitly clears progress when a reader starts from the beginning', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 40})
      .expect(204);
    await client
      .delete(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .expect(204);

    const list = await client.get('/users/me/reading-progress').expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('moves an effectively finished read into history', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 60})
      .expect(204);
    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 97})
      .expect(204);

    const list = await client.get('/users/me/reading-progress').expect(200);
    expect(list.body).toHaveLength(0);

    const history = await client.get('/users/me/reading-history').expect(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].story.id).toBe(story.id);
    expect(history.body[0].completedAt).toBeDefined();
  });

  it('permanently records an event completion as achievement progress', async () => {
    const admin = await seedAdmin(testApp);
    const adminToken = await getCsrfToken(admin);
    const tagResponse = await admin
      .post('/admin/tags')
      .set('x-csrf-token', adminToken)
      .send({name: 'event-horror'})
      .expect(201);
    const tag = tagResponse.body as {id: string; name: string; slug: string};
    const {story} = await approvedStory('Event Story', {admin, adminToken}, [
      tag.id,
    ]);
    const now = Date.now();
    await testApp.dataSource.getRepository(SeasonalEvent).save({
      title: 'The Midnight Trial',
      description: 'Finish one story before the door closes.',
      goal: 1,
      startsAt: new Date(now - 24 * 60 * 60_000),
      endsAt: new Date(now + 24 * 60 * 60_000),
      isPublished: true,
      tags: [tag],
    });
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 100})
      .expect(204);

    await client
      .get('/users/me/seasonal-event')
      .expect(200)
      .expect(({body}) => expect(body).toMatchObject({completed: 1, goal: 1}));
    const achievements = await client.get('/users/me/achievements').expect(200);
    expect(
      achievements.body.find(
        (achievement: {key: string}) => achievement.key === 'event-seeker'
      )
    ).toMatchObject({progress: 1, highestUnlockedTier: 1});
  });

  it('upserts — a second write in range updates the same row', async () => {
    const {story} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 20})
      .expect(204);
    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 55})
      .expect(204);

    const list = await client.get('/users/me/reading-progress').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].percent).toBe(55);
  });

  it('orders the list by most-recently-read first', async () => {
    const admin = await seedAdmin(testApp);
    const adminToken = await getCsrfToken(admin);
    const {story: first} = await approvedStory('First Story', {
      admin,
      adminToken,
    });
    const {story: second} = await approvedStory('Second Story', {
      admin,
      adminToken,
    });
    const {client, token} = await reader();

    await client
      .put(`/stories/${first.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 30})
      .expect(204);
    await client
      .put(`/stories/${second.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 30})
      .expect(204);

    const list = await client.get('/users/me/reading-progress').expect(200);
    expect(list.body.map((row: {story: {id: string}}) => row.story.id)).toEqual(
      [second.id, first.id]
    );
  });

  it('drops a story from the list once it is no longer approved', async () => {
    const {story, admin, adminToken} = await approvedStory();
    const {client, token} = await reader();

    await client
      .put(`/stories/${story.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 30})
      .expect(204);

    await admin
      .patch(`/admin/stories/${story.id}/status`)
      .set('x-csrf-token', adminToken)
      .send({status: StoryStatus.Flagged})
      .expect(200);

    const list = await client.get('/users/me/reading-progress').expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('cannot record progress on a story not visible to the reader (404)', async () => {
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
      .put(`/stories/${pending.id}/reading-progress`)
      .set('x-csrf-token', token)
      .send({percent: 30})
      .expect(404);
  });

  it('requires a session for every reading-progress route', async () => {
    const {story} = await approvedStory();
    const anon = agent();

    // No session → no CSRF token can be held, so the write 403s before the
    // auth guard; the read 401s.
    await anon
      .put(`/stories/${story.id}/reading-progress`)
      .send({percent: 30})
      .expect(403);
    await anon.delete(`/stories/${story.id}/reading-progress`).expect(403);
    await anon.get('/users/me/reading-progress').expect(401);
    await anon.get('/users/me/reading-history').expect(401);
    await anon.get('/users/me/reading-goal').expect(401);
    await anon.patch('/users/me/reading-goal').send({goal: 5}).expect(403);
    await anon.get('/users/me/seasonal-event').expect(401);
  });

  it('reads and updates the weekly reading goal', async () => {
    const {client, token} = await reader();

    const initial = await client.get('/users/me/reading-goal').expect(200);
    expect(initial.body).toMatchObject({goal: 3, completed: 0});

    const updated = await client
      .patch('/users/me/reading-goal')
      .set('x-csrf-token', token)
      .send({goal: 7})
      .expect(200);
    expect(updated.body).toMatchObject({goal: 7, completed: 0});

    await client
      .patch('/users/me/reading-goal')
      .set('x-csrf-token', token)
      .send({goal: 15})
      .expect(400);
  });
});
