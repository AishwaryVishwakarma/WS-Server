import request from 'supertest';
import {User} from 'src/users/entities/user.entity';
import {MembershipTier} from 'src/users/enums/membership-tier.enum';
import {
  cleanDatabase,
  closeTestApp,
  createTestApp,
  getCsrfToken,
  registerUser,
  seedAdmin,
  type Agent,
  type IdBody,
  type TestApp,
} from './test-utils';

describe('Membership (integration)', () => {
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

  const enableMembershipFeatures = async (admin: Agent) => {
    const token = await getCsrfToken(admin);
    await admin
      .patch('/admin/settings')
      .set('x-csrf-token', token)
      .send({membershipFeaturesEnabled: true})
      .expect(200);
  };

  const grantTier = async (
    admin: Agent,
    userId: string,
    membershipTier: MembershipTier
  ) => {
    const token = await getCsrfToken(admin);
    return admin
      .patch(`/admin/users/${userId}`)
      .set('x-csrf-token', token)
      .send({membershipTier});
  };

  describe('PATCH /admin/users/:id — membership grant', () => {
    it('auto-assigns Founding Patron on a genuine first grant under the cutoff', async () => {
      const admin = await seedAdmin(testApp);
      const client = agent();
      const {body: user} = (await registerUser(client, {
        email: 'reader@test.com',
      })) as {body: IdBody};

      const response = await grantTier(admin, user.id, MembershipTier.Patron);

      expect(response.status).toBe(200);
      expect(response.body.membershipTier).toBe('founding_patron');
    });

    it('grants plain Patron once the founding cutoff has already been reached', async () => {
      const admin = await seedAdmin(testApp);

      // Fill the founding headcount directly — cheaper than registering 100
      // real accounts through the OTP flow just to exhaust the cutoff. A bulk
      // .insert() bypasses the entity's @BeforeInsert hooks, so slug (NOT
      // NULL + unique) needs an explicit value here. The cap is counted off
      // foundingPatronSince (see UsersService._resolveGrantedTier), not the
      // current membershipTier, so filler rows need the latch set directly.
      const filler = Array.from({length: 100}, (_, i) => ({
        name: `Filler ${i}`,
        slug: `filler-${i}`,
        email: `filler${i}@test.com`,
        membershipTier: MembershipTier.FoundingPatron,
        premiumSince: new Date(),
        foundingPatronSince: new Date(),
      }));
      await userRepository().insert(filler);

      const client = agent();
      const {body: user} = (await registerUser(client, {
        email: 'reader@test.com',
      })) as {body: IdBody};

      const response = await grantTier(admin, user.id, MembershipTier.Patron);

      expect(response.status).toBe(200);
      expect(response.body.membershipTier).toBe('patron');
    });

    it('restores Founding Patron from the latch on a re-grant after a lapse', async () => {
      const admin = await seedAdmin(testApp);
      const client = agent();
      const {body: user} = (await registerUser(client, {
        email: 'reader@test.com',
      })) as {body: IdBody};

      const firstGrant = await grantTier(admin, user.id, MembershipTier.Patron);
      expect(firstGrant.body.membershipTier).toBe('founding_patron');

      await grantTier(admin, user.id, MembershipTier.Free);
      const response = await grantTier(admin, user.id, MembershipTier.Patron);

      // The "once granted, never lost" invariant: foundingPatronSince is a
      // latch, not a recomputed eligibility check, so a lapse-then-re-grant
      // restores Founding Patron rather than downgrading to plain Patron.
      expect(response.status).toBe(200);
      expect(response.body.membershipTier).toBe('founding_patron');
    });
  });

  describe('Publish-cap bypass for Patron+', () => {
    const publishStory = (client: Agent, token: string, title: string) =>
      client
        .post('/stories')
        .set('x-csrf-token', token)
        .send({title, content: 'x'.repeat(500)});

    it('blocks an 11th published story for a Free author', async () => {
      const client = agent();
      await registerUser(client, {email: 'author@test.com'});
      const token = await getCsrfToken(client);

      for (let i = 0; i < 10; i++) {
        await publishStory(client, token, `Story ${i}`).expect(201);
      }
      const response = await publishStory(client, token, 'Story 10');

      expect(response.status).toBe(403);
    });

    it('lets a Patron author exceed the free cap once the toggle is on', async () => {
      const admin = await seedAdmin(testApp);
      await enableMembershipFeatures(admin);

      const client = agent();
      const {body: author} = (await registerUser(client, {
        email: 'author@test.com',
      })) as {body: IdBody};
      await grantTier(admin, author.id, MembershipTier.Patron);
      const token = await getCsrfToken(client);

      for (let i = 0; i < 10; i++) {
        await publishStory(client, token, `Story ${i}`).expect(201);
      }
      const response = await publishStory(client, token, 'Story 10');

      expect(response.status).toBe(201);
    });

    it('still enforces the cap for a Patron author while the toggle is off', async () => {
      const admin = await seedAdmin(testApp);

      const client = agent();
      const {body: author} = (await registerUser(client, {
        email: 'author@test.com',
      })) as {body: IdBody};
      await grantTier(admin, author.id, MembershipTier.Patron);
      const token = await getCsrfToken(client);

      for (let i = 0; i < 10; i++) {
        await publishStory(client, token, `Story ${i}`).expect(201);
      }
      const response = await publishStory(client, token, 'Story 10');

      expect(response.status).toBe(403);
    });
  });

  describe('Draft-cap bypass for Patron+', () => {
    const draftStory = (client: Agent, token: string, title: string) =>
      client
        .post('/stories')
        .set('x-csrf-token', token)
        .send({title, content: 'x'.repeat(500), draft: true});

    it('blocks an 11th draft for a Free author', async () => {
      const client = agent();
      await registerUser(client, {email: 'drafter@test.com'});
      const token = await getCsrfToken(client);

      for (let i = 0; i < 10; i++) {
        await draftStory(client, token, `Draft ${i}`).expect(201);
      }
      const response = await draftStory(client, token, 'Draft 10');

      expect(response.status).toBe(403);
    });

    it('lets a Patron author exceed the free draft cap once the toggle is on', async () => {
      const admin = await seedAdmin(testApp);
      await enableMembershipFeatures(admin);

      const client = agent();
      const {body: author} = (await registerUser(client, {
        email: 'drafter@test.com',
      })) as {body: IdBody};
      await grantTier(admin, author.id, MembershipTier.Patron);
      const token = await getCsrfToken(client);

      for (let i = 0; i < 10; i++) {
        await draftStory(client, token, `Draft ${i}`).expect(201);
      }
      const response = await draftStory(client, token, 'Draft 10');

      expect(response.status).toBe(201);
    });

    it('still enforces the draft cap for a Patron author while the toggle is off', async () => {
      const admin = await seedAdmin(testApp);

      const client = agent();
      const {body: author} = (await registerUser(client, {
        email: 'drafter@test.com',
      })) as {body: IdBody};
      await grantTier(admin, author.id, MembershipTier.Patron);
      const token = await getCsrfToken(client);

      for (let i = 0; i < 10; i++) {
        await draftStory(client, token, `Draft ${i}`).expect(201);
      }
      const response = await draftStory(client, token, 'Draft 10');

      expect(response.status).toBe(403);
    });
  });

  describe('Priority moderation queue', () => {
    const submitPendingStory = async (email: string, title: string) => {
      const client = agent();
      const {body: authorBody} = (await registerUser(client, {email})) as {
        body: IdBody;
      };
      const token = await getCsrfToken(client);
      await client
        .post('/stories')
        .set('x-csrf-token', token)
        .send({title, content: 'x'.repeat(500)})
        .expect(201);
      return authorBody;
    };

    it("puts a Patron+ author's older pending story ahead of a newer Free one once the toggle is on", async () => {
      const admin = await seedAdmin(testApp);
      const patronAuthor = await submitPendingStory(
        'patron@test.com',
        'Patron Story'
      );
      await submitPendingStory('free@test.com', 'Free Story');
      await grantTier(admin, patronAuthor.id, MembershipTier.Patron);
      await enableMembershipFeatures(admin);

      const response = await admin
        .get('/admin/stories?status=pending')
        .expect(200);
      const titles = (response.body.data as {title: string}[]).map(
        (s) => s.title
      );

      expect(titles.indexOf('Patron Story')).toBeLessThan(
        titles.indexOf('Free Story')
      );
    });

    it('keeps newest-first ordering, ignoring tier, while the toggle is off', async () => {
      const admin = await seedAdmin(testApp);
      const patronAuthor = await submitPendingStory(
        'patron@test.com',
        'Patron Story'
      );
      await submitPendingStory('free@test.com', 'Free Story');
      await grantTier(admin, patronAuthor.id, MembershipTier.Patron);

      const response = await admin
        .get('/admin/stories?status=pending')
        .expect(200);
      const titles = (response.body.data as {title: string}[]).map(
        (s) => s.title
      );

      expect(titles.indexOf('Free Story')).toBeLessThan(
        titles.indexOf('Patron Story')
      );
    });
  });

  describe('Extended Story Insights range for Patron+', () => {
    const createStory = async (client: Agent, token: string) => {
      const response = await client
        .post('/stories')
        .set('x-csrf-token', token)
        .send({title: 'A Story', content: 'x'.repeat(500)})
        .expect(201);
      return (response.body as IdBody).id;
    };

    it('clamps a Free author to 90 days regardless of the requested range', async () => {
      const client = agent();
      await registerUser(client, {email: 'author@test.com'});
      const token = await getCsrfToken(client);
      const storyId = await createStory(client, token);

      const response = await client
        .get(`/users/me/stories/${storyId}/stats?days=180`)
        .expect(200);

      expect(response.body).toHaveLength(90);
    });

    it('honors the full requested range for a Patron+ author once the toggle is on', async () => {
      const admin = await seedAdmin(testApp);
      await enableMembershipFeatures(admin);

      const client = agent();
      const {body: author} = (await registerUser(client, {
        email: 'author@test.com',
      })) as {body: IdBody};
      await grantTier(admin, author.id, MembershipTier.Patron);
      const token = await getCsrfToken(client);
      const storyId = await createStory(client, token);

      const response = await client
        .get(`/users/me/stories/${storyId}/stats?days=180`)
        .expect(200);

      expect(response.body).toHaveLength(180);
    });

    it('still clamps a Patron+ author to 90 while the toggle is off', async () => {
      const admin = await seedAdmin(testApp);

      const client = agent();
      const {body: author} = (await registerUser(client, {
        email: 'author@test.com',
      })) as {body: IdBody};
      await grantTier(admin, author.id, MembershipTier.Patron);
      const token = await getCsrfToken(client);
      const storyId = await createStory(client, token);

      const response = await client
        .get(`/users/me/stories/${storyId}/stats?days=180`)
        .expect(200);

      expect(response.body).toHaveLength(90);
    });
  });

  describe("A story's byline exposes the author's membershipTier", () => {
    it("reflects a granted tier on the story's public author projection", async () => {
      const admin = await seedAdmin(testApp);

      const client = agent();
      const {body: author} = (await registerUser(client, {
        email: 'author@test.com',
      })) as {body: IdBody};
      await grantTier(admin, author.id, MembershipTier.Patron);
      const token = await getCsrfToken(client);
      const {body: story} = (await client
        .post('/stories')
        .set('x-csrf-token', token)
        .send({title: 'A Story', content: 'x'.repeat(500)})
        .expect(201)) as {body: IdBody & {slug: string}};

      const response = await client.get(`/stories/${story.slug}`).expect(200);

      expect(response.body.author.membershipTier).toBe('founding_patron');
    });
  });
});
