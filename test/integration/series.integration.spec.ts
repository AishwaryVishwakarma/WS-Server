import request from 'supertest';
import {StoryResponseDto} from 'src/stories/dto/story-response.dto';
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

describe('Series (integration)', () => {
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

  const createStory = async (
    payload: object = STORY_PAYLOAD,
    client?: Agent,
    email?: string
  ) => {
    const author = client ?? agent();
    if (!client) await registerUser(author, email ? {email} : {});
    const token = await getCsrfToken(author);

    const response = await author
      .post('/stories')
      .set('x-csrf-token', token)
      .send(payload)
      .expect(201);

    return {client: author, token, story: response.body as StoryResponseDto};
  };

  const approveStory = async (storyId: string, adminAgent?: Agent) => {
    const admin = adminAgent ?? (await seedAdmin(testApp));
    const adminToken = await getCsrfToken(admin);

    await admin
      .patch(`/admin/stories/${storyId}/status`)
      .set('x-csrf-token', adminToken)
      .send({status: StoryStatus.Approved})
      .expect(200);

    return admin;
  };

  describe('POST /stories with seriesTitle', () => {
    it('creates a series and assigns position 1 to the first story', async () => {
      const {story} = await createStory({
        ...STORY_PAYLOAD,
        seriesTitle: 'Hollow Lane',
      });

      expect(story.series).toEqual({
        id: expect.any(String),
        title: 'Hollow Lane',
        position: 1,
      });
    });

    it('reuses the same series and increments position for the same author', async () => {
      const {client, story: first} = await createStory({
        ...STORY_PAYLOAD,
        title: 'Part One',
        seriesTitle: 'Hollow Lane',
      });
      const {story: second} = await createStory(
        {...STORY_PAYLOAD, title: 'Part Two', seriesTitle: 'Hollow Lane'},
        client
      );

      expect(second.series!.id).toBe(first.series!.id);
      expect(second.series!.position).toBe(2);
    });

    it('scopes series by author — a same-named series for another author is separate', async () => {
      const {story: aliceStory} = await createStory(
        {...STORY_PAYLOAD, seriesTitle: 'Hollow Lane'},
        undefined,
        'alice@test.com'
      );
      const {story: bobStory} = await createStory(
        {...STORY_PAYLOAD, seriesTitle: 'Hollow Lane'},
        undefined,
        'bob@test.com'
      );

      expect(bobStory.series!.id).not.toBe(aliceStory.series!.id);
      expect(bobStory.series!.position).toBe(1);
    });

    it('leaves the story out of any series when seriesTitle is omitted', async () => {
      const {story} = await createStory();

      expect(story.series).toBeUndefined();
    });
  });

  describe('PATCH /stories/:id seriesTitle', () => {
    it('detaches the story from its series when set to null', async () => {
      const {client, token, story} = await createStory({
        ...STORY_PAYLOAD,
        seriesTitle: 'Hollow Lane',
      });

      const response = await client
        .patch(`/stories/${story.id}`)
        .set('x-csrf-token', token)
        .send({seriesTitle: null})
        .expect(200);

      expect(response.body.series).toBeUndefined();
    });

    it('moves the story into a different series with a fresh position', async () => {
      const {client, token, story} = await createStory({
        ...STORY_PAYLOAD,
        seriesTitle: 'Hollow Lane',
      });

      const response = await client
        .patch(`/stories/${story.id}`)
        .set('x-csrf-token', token)
        .send({seriesTitle: 'A New Series'})
        .expect(200);

      expect(response.body.series.title).toBe('A New Series');
      expect(response.body.series.position).toBe(1);
    });

    it('keeps the same position when re-saved under the same series title', async () => {
      const {client, token, story} = await createStory({
        ...STORY_PAYLOAD,
        seriesTitle: 'Hollow Lane',
      });

      const response = await client
        .patch(`/stories/${story.id}`)
        .set('x-csrf-token', token)
        .send({title: 'Renamed', seriesTitle: 'Hollow Lane'})
        .expect(200);

      expect(response.body.series.position).toBe(1);
    });
  });

  describe('GET /series/:id', () => {
    it('404s for an unknown series', async () => {
      await agent()
        .get('/series/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('lists only approved stories in the series, in position order', async () => {
      const {client, story: first} = await createStory({
        ...STORY_PAYLOAD,
        title: 'Part One',
        seriesTitle: 'Hollow Lane',
      });
      const {story: second} = await createStory(
        {...STORY_PAYLOAD, title: 'Part Two', seriesTitle: 'Hollow Lane'},
        client
      );
      // A third part exists but is never approved — must not show publicly.
      await createStory(
        {...STORY_PAYLOAD, title: 'Part Three', seriesTitle: 'Hollow Lane'},
        client
      );

      const admin = await approveStory(first.id);
      await approveStory(second.id, admin);

      const response = await agent()
        .get(`/series/${first.series!.id}`)
        .expect(200);

      expect(response.body.title).toBe('Hollow Lane');
      expect(
        response.body.stories.map((s: {title: string}) => s.title)
      ).toEqual(['Part One', 'Part Two']);
    });

    it('is reachable anonymously', async () => {
      const {story} = await createStory({
        ...STORY_PAYLOAD,
        seriesTitle: 'Hollow Lane',
      });
      await approveStory(story.id);

      await agent().get(`/series/${story.series!.id}`).expect(200);
    });
  });

  describe('GET /users/me/series', () => {
    it('rejects an unauthenticated request', async () => {
      await agent().get('/users/me/series').expect(401);
    });

    it("lists the caller's own series only", async () => {
      const {client} = await createStory({
        ...STORY_PAYLOAD,
        seriesTitle: 'Hollow Lane',
      });
      await createStory(
        {...STORY_PAYLOAD, title: 'Other', seriesTitle: 'Second Series'},
        client
      );
      await createStory(
        {...STORY_PAYLOAD, seriesTitle: "Someone Else's"},
        undefined,
        'other@test.com'
      );

      const response = await client.get('/users/me/series').expect(200);

      expect(response.body.map((s: {title: string}) => s.title).sort()).toEqual(
        ['Hollow Lane', 'Second Series']
      );
    });
  });
});
