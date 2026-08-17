import request from 'supertest';
import {User} from 'src/users/entities/user.entity';
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

describe('Reading streaks (integration)', () => {
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
  const userRepository = () => testApp.dataSource.getRepository(User);

  const readerWithApprovedStory = async () => {
    const author = agent();
    const {body: authorBody} = await registerUser(author, {
      email: 'author@test.com',
    });
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

    const reader = agent();
    await registerUser(reader, {email: 'reader@test.com'});

    return {
      reader,
      authorId: authorBody.id,
      authorSlug: authorBody.slug,
      story,
    };
  };

  it('starts a 1-day streak on the first story view', async () => {
    const {reader, story} = await readerWithApprovedStory();

    await reader.post(`/stories/${story.id}/view`).expect(200);

    const me = await reader.get('/users/me').expect(200);
    expect(me.body.currentStreak).toBe(1);
    expect(me.body.longestStreak).toBe(1);
  });

  it('does not double-count a repeat view the same day', async () => {
    const {reader, story} = await readerWithApprovedStory();

    await reader.post(`/stories/${story.id}/view`).expect(200);
    await reader.post(`/stories/${story.id}/view`).expect(200);

    const me = await reader.get('/users/me').expect(200);
    expect(me.body.currentStreak).toBe(1);
  });

  it('extends the streak on a consecutive day', async () => {
    const {reader, story} = await readerWithApprovedStory();

    await reader.post(`/stories/${story.id}/view`).expect(200);

    // Real multi-day streaks aren't practical to exercise without waiting a
    // real day — back-date lastActiveDate directly to yesterday (relative
    // to whenever this test actually runs), mirroring how other suites
    // reach into the DB for state a real flow can't produce quickly.
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await userRepository().update(
      {email: 'reader@test.com'},
      {
        lastActiveDate: yesterday.toISOString().slice(0, 10),
        currentStreak: 5,
        longestStreak: 5,
      }
    );
    await reader.post(`/stories/${story.id}/view`).expect(200);

    const me = await reader.get('/users/me').expect(200);
    expect(me.body.currentStreak).toBe(6);
    expect(me.body.longestStreak).toBe(6);
  });

  it('surfaces streak-milestone badges once longestStreak crosses 7/30', async () => {
    const {authorId, authorSlug} = await readerWithApprovedStory();
    const anon = agent();

    await userRepository().update({id: authorId}, {longestStreak: 7});
    const week = await anon.get(`/users/${authorSlug}`).expect(200);
    expect(week.body.badges).toContain('week-streak');
    expect(week.body.badges).not.toContain('month-streak');

    await userRepository().update({id: authorId}, {longestStreak: 30});
    const month = await anon.get(`/users/${authorSlug}`).expect(200);
    expect(month.body.badges).toContain('month-streak');
  });
});
