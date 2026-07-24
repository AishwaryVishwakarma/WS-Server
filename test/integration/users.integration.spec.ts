import request from 'supertest';
import {User} from 'src/users/entities/user.entity';
import {Role} from 'src/users/enums/role';
import {
  ADMIN_USER,
  cleanDatabase,
  closeTestApp,
  createTestApp,
  DEFAULT_USER,
  getCsrfToken,
  registerUser,
  seedAdmin,
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

      return {targetId: targetUser.id as string, reporter, reporterToken};
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
});
