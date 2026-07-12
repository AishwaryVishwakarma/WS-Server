import request from 'supertest';
import {Comment} from 'src/comments/entities/comment.entity';
import {Story} from 'src/stories/entities/story.entity';
import {User} from 'src/users/entities/user.entity';
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

  describe('drafts', () => {
    const createDraft = async () => {
      const client = agent();
      const {body: author} = await registerUser(client, {
        email: 'drafter@test.com',
      });
      const token = await getCsrfToken(client);

      const response = await client
        .post('/stories')
        .set('x-csrf-token', token)
        .send({...STORY_PAYLOAD, draft: true})
        .expect(201);

      return {client, token, author, story: response.body};
    };

    it('creates with draft status, invisible to everyone else', async () => {
      const {client, story} = await createDraft();
      expect(story.status).toBe(StoryStatus.Draft);

      // Author sees it on their own shelf and can open it
      const mine = await client.get('/users/me/stories').expect(200);
      expect(mine.body.total).toBe(1);
      await client.get(`/stories/${story.id}`).expect(200);

      // Everyone else gets a 404, and it never reaches the admin list
      await agent().get(`/stories/${story.id}`).expect(404);
      const admin = await seedAdmin(testApp);
      const adminList = await admin.get('/admin/stories').expect(200);
      expect(adminList.body.total).toBe(0);
      await admin.get('/admin/stories?status=draft').expect(400);
    });

    it('keeps a draft a draft when edited', async () => {
      const {client, token, story} = await createDraft();

      const response = await client
        .patch(`/stories/${story.id}`)
        .set('x-csrf-token', token)
        .send({content: 'Still working on this'})
        .expect(200);

      expect(response.body.status).toBe(StoryStatus.Draft);
    });

    it('submits a draft into the moderation queue', async () => {
      const {client, token, story} = await createDraft();

      const submitted = await client
        .patch(`/stories/${story.id}/submit`)
        .set('x-csrf-token', token)
        .expect(200);
      expect(submitted.body.status).toBe(StoryStatus.Pending);

      const admin = await seedAdmin(testApp);
      const queue = await admin
        .get('/admin/stories?status=pending')
        .expect(200);
      expect(queue.body.total).toBe(1);

      // Submitting twice is a 400 — it is no longer a draft
      await client
        .patch(`/stories/${story.id}/submit`)
        .set('x-csrf-token', token)
        .expect(400);
    });

    it('rejects submitting someone else’s draft', async () => {
      const {story} = await createDraft();

      const other = agent();
      await registerUser(other, {email: 'other@test.com'});
      const otherToken = await getCsrfToken(other);

      await other
        .patch(`/stories/${story.id}/submit`)
        .set('x-csrf-token', otherToken)
        .expect(403);
    });

    it('admins cannot move a story into drafts', async () => {
      const {story} = await createStory();
      const admin = await seedAdmin(testApp);
      const adminToken = await getCsrfToken(admin);

      await admin
        .patch(`/admin/stories/${story.id}/status`)
        .set('x-csrf-token', adminToken)
        .send({status: 'draft'})
        .expect(400);
    });
  });

  describe('word and comment counts', () => {
    it('computes wordCount on create and update', async () => {
      const {client, token, story} = await createStory({
        title: 'Counted',
        content: 'one two three four five',
        scareLevel: 1,
      });
      expect(story.wordCount).toBe(5);

      const updated = await client
        .patch(`/stories/${story.id}`)
        .set('x-csrf-token', token)
        .send({content: 'one two three'})
        .expect(200);
      expect(updated.body.wordCount).toBe(3);
    });

    it('keeps commentCount in sync through comment create and delete', async () => {
      const {client, token, story} = await createStory();
      await approveStory(story.id);

      const comment = await client
        .post('/comments')
        .set('x-csrf-token', token)
        .send({content: 'Boo', storyId: story.id})
        .expect(201);

      const after = await client.get(`/stories/${story.id}`).expect(200);
      expect(after.body.commentCount).toBe(1);

      await client
        .delete(`/comments/${comment.body.id}`)
        .set('x-csrf-token', token)
        .expect(204);

      const final = await client.get(`/stories/${story.id}`).expect(200);
      expect(final.body.commentCount).toBe(0);
    });

    it('sorts by most-commented', async () => {
      const {story: quiet} = await createStory(STORY_PAYLOAD, 'a@test.com');
      const admin = await approveStory(quiet.id);
      const {client, token, story: loud} = await createStory(
        {...STORY_PAYLOAD, title: 'The Loud One'},
        'b@test.com'
      );
      await approveStory(loud.id, admin);

      await client
        .post('/comments')
        .set('x-csrf-token', token)
        .send({content: 'First!', storyId: loud.id})
        .expect(201);

      const response = await client
        .get('/stories?sort=most-commented')
        .expect(200);
      expect(response.body.data[0].id).toBe(loud.id);
      expect(response.body.data[0].commentCount).toBe(1);
    });
  });

  describe('anonymous access', () => {
    it('serves the approved feed, story, and comments without a session', async () => {
      const {client, token, story} = await createStory();
      await approveStory(story.id);
      await client
        .post('/comments')
        .set('x-csrf-token', token)
        .send({content: 'Chilling.', storyId: story.id})
        .expect(201);

      const anonymous = agent();

      const feed = await anonymous.get('/stories').expect(200);
      expect(feed.body.total).toBe(1);

      const detail = await anonymous.get(`/stories/${story.id}`).expect(200);
      expect(detail.body.content).toBeDefined();

      const comments = await anonymous
        .get(`/stories/${story.id}/comments`)
        .expect(200);
      expect(comments.body.total).toBe(1);
    });

    it('hides non-approved stories from anonymous visitors with 404', async () => {
      const {story} = await createStory(); // pending

      await agent().get(`/stories/${story.id}`).expect(404);
    });

    it('rejects anonymous mutations', async () => {
      const {story} = await createStory();
      await approveStory(story.id);

      // Without a CSRF token the middleware rejects first (403)
      const anonymous = agent();
      await anonymous.post('/stories').send(STORY_PAYLOAD).expect(403);

      // With a token, the auth guard rejects the missing session (401)
      const token = await getCsrfToken(anonymous);
      await anonymous
        .post('/stories')
        .set('x-csrf-token', token)
        .send(STORY_PAYLOAD)
        .expect(401);
      await anonymous
        .patch(`/stories/${story.id}`)
        .set('x-csrf-token', token)
        .send({title: 'Hijacked'})
        .expect(401);
      await anonymous
        .delete(`/stories/${story.id}`)
        .set('x-csrf-token', token)
        .expect(401);
      await anonymous
        .post('/comments')
        .set('x-csrf-token', token)
        .send({content: 'Anon', storyId: story.id})
        .expect(401);
    });

    it('degrades a revoked session to anonymous, clearing a stale role', async () => {
      const {story} = await createStory();
      const admin = await seedAdmin(testApp);

      // Admin can read the pending story...
      await admin.get(`/stories/${story.id}`).expect(200);

      // ...but once blocked, the same session must not retain admin reads
      await testApp.dataSource
        .getRepository(User)
        .update({email: 'admin@test.com'}, {isBlocked: true});

      await admin.get(`/stories/${story.id}`).expect(404);
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

    it('searches titles and excerpts, composable with status', async () => {
      const {story} = await createStory(
        {...STORY_PAYLOAD, title: 'The Cursed Compass'},
        'a@test.com'
      );
      const admin = await approveStory(story.id);
      await createStory(
        {...STORY_PAYLOAD, title: 'A Compass, Cursed'},
        'b@test.com'
      ); // stays pending

      const search = await admin
        .get('/admin/stories?search=compass')
        .expect(200);
      expect(search.body.total).toBe(2);

      const combined = await admin
        .get('/admin/stories?search=compass&status=approved')
        .expect(200);
      expect(combined.body.total).toBe(1);
      expect(combined.body.data[0].id).toBe(story.id);
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
