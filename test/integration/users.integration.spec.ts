import request from 'supertest';
import {User} from 'src/users/entities/user.entity';
import {Role} from 'src/users/enums/role';
import {Story} from 'src/stories/entities/story.entity';
import {StoryStatus} from 'src/stories/enums/story-status.enum';
import {
  ADMIN_USER,
  cleanDatabase,
  closeTestApp,
  createTestApp,
  DEFAULT_USER,
  getCsrfToken,
  registerUser,
  seedAdmin,
  type Agent,
  type TestApp,
} from './test-utils';

describe('Users (integration)', () => {
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

  describe('GET /users/me', () => {
    it('returns the private profile including email', async () => {
      const client = agent();
      await registerUser(client);

      const response = await client.get('/users/me').expect(200);

      expect(response.body.email).toBe(DEFAULT_USER.email);
      expect(response.body.name).toBe(DEFAULT_USER.name);
      expect(response.body.password).toBeUndefined();
    });

    it('rejects unauthenticated requests', async () => {
      await agent().get('/users/me').expect(401);
    });
  });

  describe('GET /users/me/stats', () => {
    const storyRepository = () => testApp.dataSource.getRepository(Story);

    it('rejects unauthenticated requests', async () => {
      await agent().get('/users/me/stats').expect(401);
    });

    it('returns all-zero stats for a fresh author', async () => {
      const client = agent();
      await registerUser(client);

      const response = await client.get('/users/me/stats').expect(200);

      expect(response.body).toEqual({
        storiesPublished: 0,
        totalViews: 0,
        totalLikes: 0,
        totalComments: 0,
        totalBookmarks: 0,
        followers: 0,
        following: 0,
      });
    });

    it('reflects real engagement on an approved story, scoped to approved only', async () => {
      const author = agent();
      const {body: authorBody} = await registerUser(author);
      const authorToken = await getCsrfToken(author);
      const storyResponse = await author
        .post('/stories')
        .set('x-csrf-token', authorToken)
        .send({
          title: 'A Beloved Tale',
          content: 'x'.repeat(500),
          scareLevel: 3,
        })
        .expect(201);
      const storyId = storyResponse.body.id as string;

      const adminAgent = await seedAdmin(testApp);
      const adminToken = await getCsrfToken(adminAgent);
      await adminAgent
        .patch(`/admin/stories/${storyId}/status`)
        .set('x-csrf-token', adminToken)
        .send({status: StoryStatus.Approved})
        .expect(200);

      // A separate, still-pending story — its engagement (if any) must not
      // leak into the approved-only totals below.
      const pendingResponse = await author
        .post('/stories')
        .set('x-csrf-token', authorToken)
        .send({title: 'Still Pending', content: 'x'.repeat(500)})
        .expect(201);
      await storyRepository().update(pendingResponse.body.id as string, {
        viewCount: 40,
        likeCount: 40,
        commentCount: 40,
      });

      const reader = agent();
      await registerUser(reader, {email: 'reader@test.com'});
      const readerToken = await getCsrfToken(reader);

      await reader.post(`/stories/${storyId}/view`).expect(200);
      await reader
        .put(`/stories/${storyId}/like`)
        .set('x-csrf-token', readerToken)
        .expect(204);
      await reader
        .put(`/stories/${storyId}/bookmark`)
        .set('x-csrf-token', readerToken)
        .expect(204);
      await reader
        .post('/comments')
        .set('x-csrf-token', readerToken)
        .send({content: 'Loved this.', storyId})
        .expect(201);
      await reader
        .put(`/users/${authorBody.id}/follow`)
        .set('x-csrf-token', readerToken)
        .expect(204);

      const response = await author.get('/users/me/stats').expect(200);

      expect(response.body).toEqual({
        storiesPublished: 1,
        totalViews: 1,
        totalLikes: 1,
        totalComments: 1,
        totalBookmarks: 1,
        followers: 1,
        following: 0,
      });
    });
  });

  describe('PATCH /users/me', () => {
    it('updates profile fields', async () => {
      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);

      const response = await client
        .patch('/users/me')
        .set('x-csrf-token', token)
        .send({bio: 'I write scary stories'})
        .expect(200);

      expect(response.body.bio).toBe('I write scary stories');
    });

    it('persists and round-trips mutedContentWarnings', async () => {
      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);

      const response = await client
        .patch('/users/me')
        .set('x-csrf-token', token)
        .send({mutedContentWarnings: ['graphic_violence', 'body_horror']})
        .expect(200);

      expect(response.body.mutedContentWarnings).toEqual([
        'graphic_violence',
        'body_horror',
      ]);

      const me = await client.get('/users/me').expect(200);
      expect(me.body.mutedContentWarnings).toEqual([
        'graphic_violence',
        'body_horror',
      ]);
    });

    it('rejects an unknown content warning value with 400', async () => {
      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);

      await client
        .patch('/users/me')
        .set('x-csrf-token', token)
        .send({mutedContentWarnings: ['not-a-real-warning']})
        .expect(400);
    });

    it('rejects more than 6 muted content warnings with 400', async () => {
      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);

      await client
        .patch('/users/me')
        .set('x-csrf-token', token)
        .send({
          mutedContentWarnings: [
            'graphic_violence',
            'self_harm_suicide',
            'sexual_content',
            'animal_cruelty',
            'child_harm',
            'body_horror',
            'graphic_violence',
          ],
        })
        .expect(400);
    });

    it('cannot escalate privileges (regression)', async () => {
      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);

      await client
        .patch('/users/me')
        .set('x-csrf-token', token)
        .send({role: 'admin', isBlocked: false, isVerified: true, bio: 'x'})
        .expect(200);

      const dbUser = await userRepository().findOneByOrFail({
        email: DEFAULT_USER.email,
      });

      expect(dbUser.role).toBe(Role.User);
      expect(dbUser.isVerified).toBe(false);
      expect(dbUser.bio).toBe('x');
    });
  });

  describe('session management', () => {
    it('lists sessions and remotely logs out another device', async () => {
      const currentClient = agent();
      await registerUser(currentClient);
      const currentToken = await getCsrfToken(currentClient);

      const otherClient = agent();
      await otherClient
        .post('/auth/login')
        .set('user-agent', 'Mozilla/5.0 (iPhone) Mobile Safari/605.1.15')
        .send({email: DEFAULT_USER.email, password: DEFAULT_USER.password})
        .expect(201);

      const response = await currentClient
        .get('/users/me/sessions')
        .expect(200);
      expect(response.body).toHaveLength(2);
      expect(
        response.body.filter((session: {current: boolean}) => session.current)
      ).toHaveLength(1);

      const otherSession = response.body.find(
        (session: {current: boolean}) => !session.current
      );
      expect(otherSession).toMatchObject({
        device: 'Mobile',
        browser: 'Safari',
        current: false,
      });
      expect(otherSession.id).not.toContain('connect.sid');

      await currentClient
        .delete(`/users/me/sessions/${otherSession.id}`)
        .set('x-csrf-token', currentToken)
        .expect(204);

      await otherClient.get('/users/me').expect(401);
      await currentClient.get('/users/me').expect(200);
    });

    it('does not remotely revoke the current session', async () => {
      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);
      const response = await client.get('/users/me/sessions').expect(200);

      await client
        .delete(`/users/me/sessions/${response.body[0].id}`)
        .set('x-csrf-token', token)
        .expect(404);
      await client.get('/users/me').expect(200);
    });

    it('logs out every other device while preserving the current session', async () => {
      const currentClient = agent();
      await registerUser(currentClient);
      const currentToken = await getCsrfToken(currentClient);

      const otherClients = [agent(), agent()];
      for (const client of otherClients) {
        await client
          .post('/auth/login')
          .send({email: DEFAULT_USER.email, password: DEFAULT_USER.password})
          .expect(201);
      }

      await currentClient
        .delete('/users/me/sessions')
        .set('x-csrf-token', currentToken)
        .expect(204);

      for (const client of otherClients) {
        await client.get('/users/me').expect(401);
      }
      await currentClient.get('/users/me').expect(200);
      const sessions = await currentClient
        .get('/users/me/sessions')
        .expect(200);
      expect(sessions.body).toHaveLength(1);
      expect(sessions.body[0].current).toBe(true);
    });
  });

  describe('PATCH /users/me/password', () => {
    const newPassword = 'N3w!LibraryPassword';

    it('changes the password, keeps this session, and revokes other sessions', async () => {
      const currentClient = agent();
      await registerUser(currentClient);
      const currentToken = await getCsrfToken(currentClient);

      const otherClient = agent();
      await otherClient
        .post('/auth/login')
        .send({email: DEFAULT_USER.email, password: DEFAULT_USER.password})
        .expect(201);

      await currentClient
        .patch('/users/me/password')
        .set('x-csrf-token', currentToken)
        .send({
          currentPassword: DEFAULT_USER.password,
          newPassword,
        })
        .expect(204);

      await currentClient.get('/users/me').expect(200);
      await otherClient.get('/users/me').expect(401);

      await agent()
        .post('/auth/login')
        .send({email: DEFAULT_USER.email, password: DEFAULT_USER.password})
        .expect(401);
      await agent()
        .post('/auth/login')
        .send({email: DEFAULT_USER.email, password: newPassword})
        .expect(201);
    });

    it('rejects an incorrect current password without changing it', async () => {
      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);

      const response = await client
        .patch('/users/me/password')
        .set('x-csrf-token', token)
        .send({currentPassword: 'Wr0ng!Password', newPassword})
        .expect(400);

      expect(response.body.message).toBe('Current password is incorrect');
      await agent()
        .post('/auth/login')
        .send({email: DEFAULT_USER.email, password: DEFAULT_USER.password})
        .expect(201);
    });

    it('rejects weak or reused new passwords', async () => {
      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);

      await client
        .patch('/users/me/password')
        .set('x-csrf-token', token)
        .send({currentPassword: DEFAULT_USER.password, newPassword: 'weak'})
        .expect(400);

      const reused = await client
        .patch('/users/me/password')
        .set('x-csrf-token', token)
        .send({
          currentPassword: DEFAULT_USER.password,
          newPassword: DEFAULT_USER.password,
        })
        .expect(400);

      expect(reused.body.message).toBe(
        'New password must be different from the current password'
      );
    });

    it('rejects unauthenticated requests at the CSRF boundary', async () => {
      await agent()
        .patch('/users/me/password')
        .send({currentPassword: DEFAULT_USER.password, newPassword})
        .expect(403);
    });
  });

  describe('DELETE /users/me', () => {
    it('soft-deletes the user and destroys the session', async () => {
      const client = agent();
      const {body} = await registerUser(client);
      const token = await getCsrfToken(client);

      await client.delete('/users/me').set('x-csrf-token', token).expect(204);

      // Session is gone
      await client.get('/users/me').expect(401);

      // Row is soft-deleted, not gone
      const dbUser = await userRepository().findOne({
        where: {id: body.id},
        withDeleted: true,
      });
      expect(dbUser).not.toBeNull();
      expect(dbUser!.deletedAt).not.toBeNull();

      // Soft-deleted users can no longer log in
      await agent()
        .post('/auth/login')
        .send({email: DEFAULT_USER.email, password: DEFAULT_USER.password})
        .expect(401);
    });

    it('releases the email so the same person can register again', async () => {
      const client = agent();
      const {body: first} = await registerUser(client);
      const token = await getCsrfToken(client);

      await client.delete('/users/me').set('x-csrf-token', token).expect(204);

      // Same email, fresh account — regression test for the bug where
      // self-deletion left the email locked to the old (soft-deleted) row,
      // making re-registration fail with a raw 409 duplicate-entry error.
      const {body: second} = await registerUser(agent(), {
        email: DEFAULT_USER.email,
      });

      expect(second.id).not.toBe(first.id);

      const oldRow = await userRepository().findOne({
        where: {id: first.id},
        withDeleted: true,
      });
      expect(oldRow!.deletedAt).not.toBeNull();
      expect(oldRow!.email).not.toBe(DEFAULT_USER.email);
    });
  });

  describe('admin removal locks the account against re-registration', () => {
    it('rejects re-registration with the same email after an admin removes the account', async () => {
      const client = agent();
      const {body} = await registerUser(client);

      const admin = await seedAdmin(testApp);
      const adminToken = await getCsrfToken(admin);
      await admin
        .delete(`/admin/users/${body.id}`)
        .set('x-csrf-token', adminToken)
        .expect(204);

      // Unlike self-deletion, admin removal keeps the email locked — a
      // moderated user can't dodge it by simply registering again.
      await agent().post('/auth/register').send(DEFAULT_USER).expect(409);
    });
  });

  describe('admin endpoints', () => {
    it('rejects a regular user with 403', async () => {
      const client = agent();
      await registerUser(client);

      await client.get('/admin/users').expect(403);
    });

    it('lists all users including soft-deleted ones for an admin', async () => {
      const client = agent();
      const {body} = await registerUser(client);
      const token = await getCsrfToken(client);
      await client.delete('/users/me').set('x-csrf-token', token).expect(204);

      const adminAgent = await seedAdmin(testApp);
      const response = await adminAgent.get('/admin/users').expect(200);

      const emails = response.body.data.map((user: User) => user.email);
      expect(emails).toContain(ADMIN_USER.email);
      // Self-deletion anonymizes the email (frees it for re-registration), so
      // the departed member's row no longer carries the original address.
      expect(emails).not.toContain(DEFAULT_USER.email);

      const deleted = response.body.data.find(
        (user: User) => user.id === body.id
      );
      expect(deleted.deletedAt).not.toBeNull();
      expect(deleted.email).toBe(`deleted-${body.id}@deleted.invalid`);
    });

    // `restore` undoes an *admin* removal (identifiers stay locked, so restore
    // simply un-hides the row) — not a self-deletion, which deliberately
    // anonymizes on the way out. See users.service.ts (deactivateSelf vs remove).
    it('restores an admin-removed user who can then log in again', async () => {
      const client = agent();
      const {body} = await registerUser(client);

      const adminAgent = await seedAdmin(testApp);
      const adminToken = await getCsrfToken(adminAgent);

      await adminAgent
        .delete(`/admin/users/${body.id}`)
        .set('x-csrf-token', adminToken)
        .expect(204);

      await adminAgent
        .patch(`/admin/users/${body.id}/restore`)
        .set('x-csrf-token', adminToken)
        .expect(204);

      await agent()
        .post('/auth/login')
        .send({email: DEFAULT_USER.email, password: DEFAULT_USER.password})
        .expect(201);
    });

    it('fetches a single member for the edit form (admin tier)', async () => {
      const {body} = await registerUser(agent(), {
        name: 'Ada Umbral',
        email: 'ada@test.com',
      });

      const adminAgent = await seedAdmin(testApp);
      const response = await adminAgent
        .get(`/admin/users/${body.id}`)
        .expect(200);

      expect(response.body.id).toBe(body.id);
      expect(response.body.email).toBe('ada@test.com');
      expect(response.body.role).toBe('user');
      expect(response.body.isBlocked).toBe(false);
      expect(response.body).toHaveProperty('isVerified');
    });

    it('404s fetching an unknown member', async () => {
      const adminAgent = await seedAdmin(testApp);
      await adminAgent
        .get('/admin/users/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it("updates a member's details, role, and verification", async () => {
      const {body} = await registerUser(agent(), {
        name: 'Old Name',
        email: 'edit-me@test.com',
      });

      const adminAgent = await seedAdmin(testApp);
      const adminToken = await getCsrfToken(adminAgent);

      const response = await adminAgent
        .patch(`/admin/users/${body.id}`)
        .set('x-csrf-token', adminToken)
        .send({
          name: 'New Name',
          bio: 'Rewritten by a keeper.',
          isVerified: true,
          role: 'admin',
        })
        .expect(200);

      expect(response.body.name).toBe('New Name');
      expect(response.body.bio).toBe('Rewritten by a keeper.');
      expect(response.body.isVerified).toBe(true);
      expect(response.body.role).toBe('admin');

      // Persisted through to the guards: the promoted member now reaches
      // admin-only routes.
      const promoted = agent();
      await promoted
        .post('/auth/login')
        .send({email: 'edit-me@test.com', password: DEFAULT_USER.password})
        .expect(201);
      await promoted.get('/admin/users').expect(200);
    });
  });

  describe('GET /admin/users search', () => {
    it('filters by name or email substring', async () => {
      await registerUser(agent(), {
        name: 'Edgar Allan Crow',
        email: 'edgar@test.com',
      });
      await registerUser(agent(), {
        name: 'Mary Shelly-Duck',
        email: 'mary@test.com',
      });
      const adminAgent = await seedAdmin(testApp);

      const byName = await adminAgent
        .get('/admin/users?search=crow')
        .expect(200);
      expect(byName.body.total).toBe(1);
      expect(byName.body.data[0].email).toBe('edgar@test.com');

      const byEmail = await adminAgent
        .get('/admin/users?search=mary@')
        .expect(200);
      expect(byEmail.body.total).toBe(1);
      expect(byEmail.body.data[0].name).toBe('Mary Shelly-Duck');
    });
  });

  describe('live session revocation', () => {
    it('invalidates an active session once the user is blocked', async () => {
      const client = agent();
      const {body} = await registerUser(client);
      await client.get('/users/me').expect(200);

      await userRepository().update({id: body.id}, {isBlocked: true});

      // The same session cookie no longer works
      await client.get('/users/me').expect(401);
    });

    it('reflects a role change on the next request', async () => {
      const client = agent();
      const {body} = await registerUser(client);
      await client.get('/admin/users').expect(403);

      await userRepository().update({id: body.id}, {role: Role.Admin});

      await client.get('/admin/users').expect(200);
    });
  });

  describe('pagination validation', () => {
    it('enforces the limit bound on /users/me/stories', async () => {
      const client = agent();
      await registerUser(client);

      await client.get('/users/me/stories').query({limit: 101}).expect(400);
    });

    it('enforces the limit bound on /admin/comments', async () => {
      const admin = await seedAdmin(testApp);

      await admin.get('/admin/comments').query({limit: 101}).expect(400);
    });
  });

  describe('GET /users/:id (public profile)', () => {
    it('returns the preview profile without email', async () => {
      const client = agent();
      const {body} = await registerUser(client);

      const response = await client.get(`/users/${body.id}`).expect(200);

      expect(response.body.name).toBe(DEFAULT_USER.name);
      expect(response.body.email).toBeUndefined();
    });

    describe('badges', () => {
      const storyRepository = () => testApp.dataSource.getRepository(Story);

      const createApprovedStory = async (
        client: Agent,
        title: string,
        adminAgent?: Agent
      ): Promise<{id: string; admin: Agent}> => {
        const token = await getCsrfToken(client);
        const response = await client
          .post('/stories')
          .set('x-csrf-token', token)
          .send({title, content: 'x'.repeat(500), scareLevel: 3})
          .expect(201);

        const admin = adminAgent ?? (await seedAdmin(testApp));
        const adminToken = await getCsrfToken(admin);
        await admin
          .patch(`/admin/stories/${response.body.id}/status`)
          .set('x-csrf-token', adminToken)
          .send({status: StoryStatus.Approved})
          .expect(200);

        return {id: response.body.id as string, admin};
      };

      it('awards no badges to an author with no approved stories', async () => {
        const client = agent();
        const {body} = await registerUser(client);

        const response = await client.get(`/users/${body.id}`).expect(200);

        expect(response.body.badges).toEqual([]);
      });

      it('awards Published after one approved story', async () => {
        const client = agent();
        const {body} = await registerUser(client);
        await createApprovedStory(client, 'A Story');

        const response = await client.get(`/users/${body.id}`).expect(200);

        expect(response.body.badges).toEqual(['published']);
      });

      it('does not count a pending story toward Published', async () => {
        const client = agent();
        const {body} = await registerUser(client);
        const token = await getCsrfToken(client);
        await client
          .post('/stories')
          .set('x-csrf-token', token)
          .send({title: 'Still Pending', content: 'x'.repeat(500)})
          .expect(201);

        const response = await client.get(`/users/${body.id}`).expect(200);

        expect(response.body.badges).toEqual([]);
      });

      it('awards Prolific at 10 approved stories', async () => {
        const client = agent();
        const {body} = await registerUser(client);

        let admin: Agent | undefined;
        for (let i = 0; i < 10; i++) {
          admin = (await createApprovedStory(client, `Story ${i}`, admin))
            .admin;
        }

        const response = await client.get(`/users/${body.id}`).expect(200);

        expect(response.body.badges).toContain('prolific');
      });

      it('awards Fan Favorite and Conversation Starter at 25 likes/comments received', async () => {
        const client = agent();
        const {body} = await registerUser(client);
        const {id: storyId} = await createApprovedStory(
          client,
          'A Beloved Tale'
        );

        // 25 real likes/comments would need 25 distinct member sessions —
        // bump the denormalized counters directly, the same way the
        // password-reset tests backdate expiresAt to simulate otherwise
        // impractical-to-construct state.
        await storyRepository().update(storyId, {
          likeCount: 25,
          commentCount: 25,
        });

        const response = await client.get(`/users/${body.id}`).expect(200);

        expect(response.body.badges).toContain('fan-favorite');
        expect(response.body.badges).toContain('conversation-starter');
      });

      it('awards Series Author once the author has started a series', async () => {
        const client = agent();
        const {body} = await registerUser(client);
        const token = await getCsrfToken(client);
        await client
          .post('/stories')
          .set('x-csrf-token', token)
          .send({
            title: 'Part One',
            content: 'x'.repeat(500),
            seriesTitle: 'A Fresh Series',
          })
          .expect(201);

        const response = await client.get(`/users/${body.id}`).expect(200);

        expect(response.body.badges).toContain('series-author');
      });
    });
  });

  describe('moderation via member reports', () => {
    // A target profile plus a second member ready to report it.
    const reportFixture = async () => {
      const target = agent();
      const {body: targetUser} = await registerUser(target, {
        email: 'target@test.com',
      });

      const reporter = agent();
      await registerUser(reporter, {email: 'reporter@test.com'});
      const reporterToken = await getCsrfToken(reporter);

      return {targetId: targetUser.id, reporter, reporterToken};
    };

    it('reports a user into the queue (with reason + detail) and resolves it', async () => {
      const {targetId, reporter, reporterToken} = await reportFixture();

      await reporter
        .post(`/users/${targetId}/report`)
        .set('x-csrf-token', reporterToken)
        .send({reason: 'harassment', details: 'Sent threatening messages.'})
        .expect(204);

      // The queue surfaces only reported users, annotated with the count —
      // and a report does not block/delete the user.
      const admin = await seedAdmin(testApp);
      const queue = await admin.get('/admin/users?reported=true').expect(200);
      expect(queue.body.total).toBe(1);
      expect(queue.body.data[0].id).toBe(targetId);
      expect(queue.body.data[0].reportCount).toBe(1);

      // The individual report (reason, detail, reporter) shows on the admin
      // single-user fetch — the aggregate count alone doesn't say why.
      const detail = await admin.get(`/admin/users/${targetId}`).expect(200);
      expect(detail.body.reports).toHaveLength(1);
      expect(detail.body.reports[0].reason).toBe('harassment');
      expect(detail.body.reports[0].details).toBe('Sent threatening messages.');
      expect(detail.body.reports[0].reporter.id).toBeDefined();

      // The paginated register list stays lean — no per-row reports array.
      const list = await admin.get('/admin/users?reported=true').expect(200);
      expect(list.body.data[0].reports).toBeUndefined();

      // Resolving drops the reports, emptying the queue but keeping the user.
      const adminToken = await getCsrfToken(admin);
      await admin
        .patch(`/admin/users/${targetId}/resolve`)
        .set('x-csrf-token', adminToken)
        .expect(200);

      const afterQueue = await admin
        .get('/admin/users?reported=true')
        .expect(200);
      expect(afterQueue.body.total).toBe(0);

      // The user itself is untouched — still in the full register.
      const full = await admin.get('/admin/users').expect(200);
      expect(full.body.data.some((u: {id: string}) => u.id === targetId)).toBe(
        true
      );
    });

    it('rejects a report with no reason (400) and an unknown reason (400)', async () => {
      const {targetId, reporter, reporterToken} = await reportFixture();

      await reporter
        .post(`/users/${targetId}/report`)
        .set('x-csrf-token', reporterToken)
        .send({})
        .expect(400);

      await reporter
        .post(`/users/${targetId}/report`)
        .set('x-csrf-token', reporterToken)
        .send({reason: 'not-a-real-reason'})
        .expect(400);
    });

    it('rejects a detail over 100 characters with 400', async () => {
      const {targetId, reporter, reporterToken} = await reportFixture();

      await reporter
        .post(`/users/${targetId}/report`)
        .set('x-csrf-token', reporterToken)
        .send({reason: 'spam', details: 'x'.repeat(101)})
        .expect(400);
    });

    it('accepts a reason with no detail (details is optional)', async () => {
      const {targetId, reporter, reporterToken} = await reportFixture();

      await reporter
        .post(`/users/${targetId}/report`)
        .set('x-csrf-token', reporterToken)
        .send({reason: 'spam'})
        .expect(204);

      const admin = await seedAdmin(testApp);
      const detail = await admin.get(`/admin/users/${targetId}`).expect(200);
      expect(detail.body.reports[0].reason).toBe('spam');
      expect(detail.body.reports[0].details).toBeNull();
    });

    it('does not mark a reported user as edited (updatedAt preserved)', async () => {
      const {targetId, reporter, reporterToken} = await reportFixture();

      const admin = await seedAdmin(testApp);
      const before = await admin.get(`/admin/users/${targetId}`).expect(200);

      await reporter
        .post(`/users/${targetId}/report`)
        .set('x-csrf-token', reporterToken)
        .send({reason: 'spam'})
        .expect(204);

      const after = await admin.get(`/admin/users/${targetId}`).expect(200);
      // A report is not an edit, so updatedAt must be untouched.
      expect(after.body.updatedAt).toBe(before.body.updatedAt);
    });

    it('rejects a duplicate report from the same member with 409', async () => {
      const {targetId, reporter, reporterToken} = await reportFixture();

      await reporter
        .post(`/users/${targetId}/report`)
        .set('x-csrf-token', reporterToken)
        .send({reason: 'spam'})
        .expect(204);

      await reporter
        .post(`/users/${targetId}/report`)
        .set('x-csrf-token', reporterToken)
        .send({reason: 'other'})
        .expect(409);

      const admin = await seedAdmin(testApp);
      const queue = await admin.get('/admin/users?reported=true').expect(200);
      expect(queue.body.data[0].reportCount).toBe(1);
    });

    it('forbids reporting yourself with 400', async () => {
      const client = agent();
      const {body} = await registerUser(client);
      const token = await getCsrfToken(client);

      await client
        .post(`/users/${body.id}/report`)
        .set('x-csrf-token', token)
        .send({reason: 'spam'})
        .expect(400);
    });

    it('rejects reporting without a session with 403', async () => {
      const {targetId} = await reportFixture();

      // An anonymous request can't hold a CSRF token, so it fails CSRF (403)
      // before the auth guard even runs (documented in CLAUDE.md).
      await agent()
        .post(`/users/${targetId}/report`)
        .send({reason: 'spam'})
        .expect(403);
    });

    it('orders the reported queue by report count, most-reported first', async () => {
      const targetA = agent();
      const {body: userA} = await registerUser(targetA, {
        email: 'a-target@test.com',
      });
      const targetB = agent();
      const {body: userB} = await registerUser(targetB, {
        email: 'b-target@test.com',
      });

      // A gets two reports, B gets one, so A must sort ahead of B.
      const report = async (userId: string, email: string) => {
        const reporter = agent();
        await registerUser(reporter, {email});
        const token = await getCsrfToken(reporter);
        await reporter
          .post(`/users/${userId}/report`)
          .set('x-csrf-token', token)
          .send({reason: 'spam'})
          .expect(204);
      };
      await report(userA.id, 'r1@test.com');
      await report(userA.id, 'r2@test.com');
      await report(userB.id, 'r3@test.com');

      const admin = await seedAdmin(testApp);
      const queue = await admin.get('/admin/users?reported=true').expect(200);
      expect(queue.body.data.map((u: {id: string}) => u.id)).toEqual([
        userA.id,
        userB.id,
      ]);
      expect(queue.body.data[0].reportCount).toBe(2);
    });
  });

  describe('auto-verification', () => {
    const THIRTY_ONE_DAYS_AGO = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

    const publishAndAge = async (client: Agent) => {
      const token = await getCsrfToken(client);
      const {body} = await client
        .post('/stories')
        .set('x-csrf-token', token)
        .send({title: 'A Debut Tale', content: 'x'.repeat(500)})
        .expect(201);

      const admin = await seedAdmin(testApp);
      const adminToken = await getCsrfToken(admin);
      await admin
        .patch(`/admin/stories/${body.id}/status`)
        .set('x-csrf-token', adminToken)
        .send({status: StoryStatus.Approved})
        .expect(200);

      await userRepository().update(
        {email: DEFAULT_USER.email},
        {createdAt: THIRTY_ONE_DAYS_AGO}
      );

      return {storyId: body.id as string, admin};
    };

    it('verifies a 31-day-old author with a published story on their next request', async () => {
      const client = agent();
      await registerUser(client);
      await publishAndAge(client);

      const response = await client.get('/users/me').expect(200);

      expect(response.body.isVerified).toBe(true);
    });

    it('does not verify a published author under 30 days old', async () => {
      const client = agent();
      await registerUser(client);
      const token = await getCsrfToken(client);
      const {body} = await client
        .post('/stories')
        .set('x-csrf-token', token)
        .send({title: 'A Debut Tale', content: 'x'.repeat(500)})
        .expect(201);
      const admin = await seedAdmin(testApp);
      const adminToken = await getCsrfToken(admin);
      await admin
        .patch(`/admin/stories/${body.id}/status`)
        .set('x-csrf-token', adminToken)
        .send({status: StoryStatus.Approved})
        .expect(200);

      const response = await client.get('/users/me').expect(200);

      expect(response.body.isVerified).toBe(false);
    });

    it('does not verify a 31-day-old account with no published story', async () => {
      const client = agent();
      await registerUser(client);
      await userRepository().update(
        {email: DEFAULT_USER.email},
        {createdAt: THIRTY_ONE_DAYS_AGO}
      );

      const response = await client.get('/users/me').expect(200);

      expect(response.body.isVerified).toBe(false);
    });

    it('stays verified after the published story is deleted', async () => {
      const client = agent();
      await registerUser(client);
      const {storyId} = await publishAndAge(client);
      await client.get('/users/me').expect(200); // triggers verification

      const token = await getCsrfToken(client);
      await client
        .delete(`/stories/${storyId}`)
        .set('x-csrf-token', token)
        .expect(204);

      const response = await client.get('/users/me').expect(200);
      expect(response.body.isVerified).toBe(true);
    });

    it('does not silently re-verify someone an admin has un-verified', async () => {
      const client = agent();
      await registerUser(client);
      const {admin} = await publishAndAge(client);
      await client.get('/users/me').expect(200); // auto-verifies

      const dbUser = await userRepository().findOneByOrFail({
        email: DEFAULT_USER.email,
      });
      const adminToken = await getCsrfToken(admin);
      await admin
        .patch(`/admin/users/${dbUser.id}`)
        .set('x-csrf-token', adminToken)
        .send({isVerified: false})
        .expect(200);

      // Still eligible by age/published-story alone, but the admin's
      // decision is locked in — the next request must not override it.
      const response = await client.get('/users/me').expect(200);
      expect(response.body.isVerified).toBe(false);
    });
  });
});
