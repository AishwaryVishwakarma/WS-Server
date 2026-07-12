import request from 'supertest';
import {Comment} from 'src/comments/entities/comment.entity';
import {Story} from 'src/stories/entities/story.entity';
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

describe('Stories (integration)', () => {
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
  const storyRepository = () => testApp.dataSource.getRepository(Story);

  // Registers an author and creates a story, returning everything needed
  const createStory = async (
    payload: object = STORY_PAYLOAD,
    email?: string
  ) => {
    const client = agent();
    const {body: author} = await registerUser(client, email ? {email} : {});
    const token = await getCsrfToken(client);

    const response = await client
      .post('/stories')
      .set('x-csrf-token', token)
      .send(payload)
      .expect(201);

    return {client, token, author, story: response.body};
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

  describe('POST /stories', () => {
    it('creates a story with pending status and an auto-generated excerpt', async () => {
      const {story} = await createStory();

      expect(story.title).toBe(STORY_PAYLOAD.title);
      expect(story.status).toBe(StoryStatus.Pending);
      expect(story.excerpt).toBe('x'.repeat(280) + '...');
    });

    it('keeps a provided excerpt', async () => {
      const {story} = await createStory({
        ...STORY_PAYLOAD,
        excerpt: 'Custom excerpt',
      });

      expect(story.excerpt).toBe('Custom excerpt');
    });

    it('rejects unknown tag ids with 404', async () => {
      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);

      await client
        .post('/stories')
        .set('x-csrf-token', token)
        .send({
          ...STORY_PAYLOAD,
          tags: ['00000000-0000-0000-0000-000000000000'],
        })
        .expect(404);
    });
  });

  describe('moderation workflow', () => {
    it('hides pending stories from the public listing until an admin approves them', async () => {
      const {client, author, story} = await createStory();

      // Pending: not visible in the user's approved stories
      const before = await client
        .get(`/users/${author.id}/stories`)
        .expect(200);
      expect(before.body.total).toBe(0);

      await approveStory(story.id);

      const after = await client.get(`/users/${author.id}/stories`).expect(200);
      expect(after.body.total).toBe(1);
      expect(after.body.data[0].id).toBe(story.id);
    });

    it('keeps isFlagged in sync when an admin flags a story', async () => {
      const {story} = await createStory();
      const admin = await seedAdmin(testApp);
      const adminToken = await getCsrfToken(admin);

      await admin
        .patch(`/admin/stories/${story.id}/status`)
        .set('x-csrf-token', adminToken)
        .send({status: StoryStatus.Flagged})
        .expect(200);

      const dbStory = await storyRepository().findOneByOrFail({id: story.id});
      expect(dbStory.status).toBe(StoryStatus.Flagged);
      expect(dbStory.isFlagged).toBe(true);
    });

    it('rejects status updates from non-admins', async () => {
      const {client, token, story} = await createStory();

      await client
        .patch(`/admin/stories/${story.id}/status`)
        .set('x-csrf-token', token)
        .send({status: StoryStatus.Approved})
        .expect(403);
    });

    it('rejects invalid status values with 400', async () => {
      const {story} = await createStory();
      const admin = await seedAdmin(testApp);
      const adminToken = await getCsrfToken(admin);

      await admin
        .patch(`/admin/stories/${story.id}/status`)
        .set('x-csrf-token', adminToken)
        .send({status: 'published'})
        .expect(400);
    });
  });

  describe('visibility (GET /stories/:id)', () => {
    it('hides a pending story from other users with 404', async () => {
      const {story} = await createStory();

      const other = agent();
      await registerUser(other, {email: 'other@test.com'});

      await other.get(`/stories/${story.id}`).expect(404);
    });

    it('lets the author read their own pending story', async () => {
      const {client, story} = await createStory();

      await client.get(`/stories/${story.id}`).expect(200);
    });

    it('lets an admin read any pending story', async () => {
      const {story} = await createStory();
      const admin = await seedAdmin(testApp);

      await admin.get(`/stories/${story.id}`).expect(200);
    });

    it('shows an approved story to any logged-in user', async () => {
      const {story} = await createStory();
      await approveStory(story.id);

      const other = agent();
      await registerUser(other, {email: 'other@test.com'});

      await other.get(`/stories/${story.id}`).expect(200);
    });

    it('hides comments of a story the user cannot see', async () => {
      const {story} = await createStory();

      const other = agent();
      await registerUser(other, {email: 'other@test.com'});

      await other.get(`/stories/${story.id}/comments`).expect(404);
    });
  });

  describe('GET /stories (public browse)', () => {
    it('lists only approved stories, without full content', async () => {
      const {story: approved} = await createStory(STORY_PAYLOAD, 'a@test.com');
      await approveStory(approved.id);
      await createStory(
        {...STORY_PAYLOAD, title: 'Still pending'},
        'b@test.com'
      );

      const browser = agent();
      await registerUser(browser, {email: 'browser@test.com'});
      const response = await browser.get('/stories').expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.data[0].id).toBe(approved.id);
      expect(response.body.data[0].content).toBeUndefined();
    });
  });

  describe('GET /stories filters', () => {
    // Two approved stories: one tagged ghosts+demons (scare 2), one tagged
    // demons only (scare 5), created in that order.
    const setupCatalog = async () => {
      const admin = await seedAdmin(testApp);
      const adminToken = await getCsrfToken(admin);

      const createTag = (name: string) =>
        admin.post('/admin/tags').set('x-csrf-token', adminToken).send({name});

      const {body: ghosts} = await createTag('ghosts').expect(201);
      const {body: demons} = await createTag('demons').expect(201);

      const {story: lighthouse} = await createStory(
        {
          ...STORY_PAYLOAD,
          title: 'The Haunted Lighthouse',
          scareLevel: 2,
          tags: [ghosts.id, demons.id],
        },
        'ghost-author@test.com'
      );
      await approveStory(lighthouse.id, admin);

      const {story: walls} = await createStory(
        {
          ...STORY_PAYLOAD,
          title: 'A Demon in the Walls',
          scareLevel: 5,
          tags: [demons.id],
        },
        'demon-author@test.com'
      );
      await approveStory(walls.id, admin);

      const browser = agent();
      await registerUser(browser, {email: 'filter-browser@test.com'});

      return {browser, lighthouse, walls};
    };

    it('filters by tag slug while keeping the full tag list on results', async () => {
      const {browser, lighthouse} = await setupCatalog();

      const response = await browser.get('/stories?tag=ghosts').expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.data[0].id).toBe(lighthouse.id);
      // The tag join used for filtering must not narrow the loaded tags
      const slugs = response.body.data[0].tags.map(
        (tag: {slug: string}) => tag.slug
      );
      expect(slugs).toEqual(expect.arrayContaining(['ghosts', 'demons']));
    });

    it('returns an empty page for an unknown tag slug', async () => {
      const {browser} = await setupCatalog();

      const response = await browser.get('/stories?tag=vampires').expect(200);

      expect(response.body.total).toBe(0);
    });

    it('searches titles case-insensitively', async () => {
      const {browser, lighthouse} = await setupCatalog();

      const response = await browser
        .get('/stories?search=lighthouse')
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.data[0].id).toBe(lighthouse.id);
    });

    it('does not treat LIKE wildcards in search as match-alls', async () => {
      const {browser} = await setupCatalog();

      const response = await browser.get('/stories?search=%25').expect(200);

      expect(response.body.total).toBe(0);
    });

    it('filters by scareLevel', async () => {
      const {browser, walls} = await setupCatalog();

      const response = await browser.get('/stories?scareLevel=5').expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.data[0].id).toBe(walls.id);
    });

    it('sorts newest-first by default and oldest-first on request', async () => {
      const {browser, lighthouse, walls} = await setupCatalog();

      const newest = await browser.get('/stories').expect(200);
      expect(newest.body.data[0].id).toBe(walls.id);

      const oldest = await browser.get('/stories?sort=oldest').expect(200);
      expect(oldest.body.data[0].id).toBe(lighthouse.id);
    });

    it('rejects invalid filter values with 400 (DTO validation is live)', async () => {
      const {browser} = await setupCatalog();

      await browser.get('/stories?scareLevel=9').expect(400);
      await browser.get('/stories?sort=spookiest').expect(400);
    });
  });

  describe('GET /admin/stories', () => {
    it('filters by status for the moderation queue', async () => {
      const {story: approved} = await createStory(STORY_PAYLOAD, 'a@test.com');
      const admin = await approveStory(approved.id);
      await createStory({...STORY_PAYLOAD, title: 'Pending one'}, 'b@test.com');

      const pending = await admin
        .get('/admin/stories?status=pending')
        .expect(200);
      expect(pending.body.total).toBe(1);
      expect(pending.body.data[0].title).toBe('Pending one');

      const all = await admin.get('/admin/stories').expect(200);
      expect(all.body.total).toBe(2);

      await admin.get('/admin/stories?status=published').expect(400);
    });
  });

  describe('re-moderation on edit', () => {
    it('resets an approved story to pending when the author edits content', async () => {
      const {client, token, story} = await createStory();
      await approveStory(story.id);

      const response = await client
        .patch(`/stories/${story.id}`)
        .set('x-csrf-token', token)
        .send({content: 'Completely rewritten after approval'})
        .expect(200);

      expect(response.body.status).toBe(StoryStatus.Pending);
    });

    it('keeps the status when an admin edits', async () => {
      const {story} = await createStory();
      const admin = await approveStory(story.id);
      const adminToken = await getCsrfToken(admin);

      const response = await admin
        .patch(`/stories/${story.id}`)
        .set('x-csrf-token', adminToken)
        .send({title: 'Admin fixed a typo'})
        .expect(200);

      expect(response.body.status).toBe(StoryStatus.Approved);
    });
  });

  describe('ownership', () => {
    it('allows the author to update their story', async () => {
      const {client, token, story} = await createStory();

      const response = await client
        .patch(`/stories/${story.id}`)
        .set('x-csrf-token', token)
        .send({title: 'Updated title'})
        .expect(200);

      expect(response.body.title).toBe('Updated title');
    });

    it('rejects updates from another user with 403', async () => {
      const {story} = await createStory();

      const otherClient = agent();
      await registerUser(otherClient, {email: 'other@test.com'});
      const otherToken = await getCsrfToken(otherClient);

      await otherClient
        .patch(`/stories/${story.id}`)
        .set('x-csrf-token', otherToken)
        .send({title: 'Hijacked'})
        .expect(403);
    });

    it('allows an admin to update any story', async () => {
      const {story} = await createStory();
      const admin = await seedAdmin(testApp);
      const adminToken = await getCsrfToken(admin);

      await admin
        .patch(`/stories/${story.id}`)
        .set('x-csrf-token', adminToken)
        .send({title: 'Moderated title'})
        .expect(200);
    });
  });

  describe('tags', () => {
    it('attaches existing tags through the real join table', async () => {
      const admin = await seedAdmin(testApp);
      const adminToken = await getCsrfToken(admin);

      const tag = await admin
        .post('/admin/tags')
        .set('x-csrf-token', adminToken)
        .send({name: 'horror'})
        .expect(201);

      const {story} = await createStory({
        ...STORY_PAYLOAD,
        tags: [tag.body.id],
      });

      const dbStory = await storyRepository().findOneOrFail({
        where: {id: story.id},
        relations: ['tags'],
      });

      expect(dbStory.tags).toHaveLength(1);
      expect(dbStory.tags[0].name).toBe('horror');
    });
  });

  describe('DELETE /stories/:id', () => {
    it('deletes the story and cascades its comments', async () => {
      const {client, token, story} = await createStory();

      await client
        .post('/comments')
        .set('x-csrf-token', token)
        .send({content: 'Spooky!', storyId: story.id})
        .expect(201);

      await client
        .delete(`/stories/${story.id}`)
        .set('x-csrf-token', token)
        .expect(204);

      expect(await storyRepository().countBy({id: story.id})).toBe(0);
      expect(await testApp.dataSource.getRepository(Comment).count()).toBe(0);
    });
  });
});
