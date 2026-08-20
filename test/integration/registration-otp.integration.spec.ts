import request from 'supertest';
import {MailService} from 'src/mail/mail.service';
import {PendingRegistration} from 'src/auth/entities/pending-registration.entity';
import {User} from 'src/users/entities/user.entity';
import {
  cleanDatabase,
  closeTestApp,
  createTestApp,
  DEFAULT_USER,
  getCsrfToken,
  seedAdmin,
  type Agent,
  type TestApp,
} from './test-utils';

describe('Registration OTP (integration)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(testApp.dataSource);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  const agent = () => request.agent(testApp.app.getHttpServer());
  const pendingRepository = () =>
    testApp.dataSource.getRepository(PendingRegistration);
  const userRepository = () => testApp.dataSource.getRepository(User);

  const enableReferralProgram = async (admin: Agent) => {
    const token = await getCsrfToken(admin);
    await admin
      .patch('/admin/settings')
      .set('x-csrf-token', token)
      .send({referralProgramEnabled: true})
      .expect(200);
  };

  const spyOnMail = () => {
    const mailService = testApp.app.get(MailService);
    return jest.spyOn(mailService, 'send').mockResolvedValue(undefined);
  };

  const extractCode = (body: string): string => {
    const match = /code is (\d{6})/.exec(body);
    if (!match)
      throw new Error('No verification code found in the mailed body');
    return match[1];
  };

  // jest.spyOn on an already-spied method is idempotent — it hands back the
  // same mock rather than stacking a new one — so a spy left un-restored
  // keeps accumulating calls across the rest of the test. Grabbing the
  // *latest* call (not [0]) and restoring immediately after use keeps this
  // helper safe to call more than once per test regardless.
  const startRegistration = async (
    client: request.Agent,
    overrides: Partial<typeof DEFAULT_USER> = {}
  ): Promise<string> => {
    const sendMail = spyOnMail();
    await client
      .post('/auth/register')
      .send({...DEFAULT_USER, ...overrides})
      .expect(204);
    const code = extractCode(sendMail.mock.calls.at(-1)![2]);
    sendMail.mockRestore();
    return code;
  };

  describe('POST /auth/register/confirm', () => {
    it('creates the user and starts a session on the correct code', async () => {
      const client = agent();
      const code = await startRegistration(client);

      const response = await client
        .post('/auth/register/confirm')
        .send({email: DEFAULT_USER.email, code})
        .expect(201);

      expect(response.body.name).toBe(DEFAULT_USER.name);
      await client.get('/users/me').expect(200);
    });

    it('removes the pending registration row once confirmed', async () => {
      const client = agent();
      const code = await startRegistration(client);

      await client
        .post('/auth/register/confirm')
        .send({email: DEFAULT_USER.email, code})
        .expect(201);

      expect(await pendingRepository().count()).toBe(0);
    });

    it('rejects confirming the same code twice (already consumed)', async () => {
      const client = agent();
      const code = await startRegistration(client);

      await client
        .post('/auth/register/confirm')
        .send({email: DEFAULT_USER.email, code})
        .expect(201);

      await agent()
        .post('/auth/register/confirm')
        .send({email: DEFAULT_USER.email, code})
        .expect(400);
    });

    it('rejects a wrong code and creates no session', async () => {
      const client = agent();
      await startRegistration(client);

      await client
        .post('/auth/register/confirm')
        .send({email: DEFAULT_USER.email, code: '000000'})
        .expect(400);

      await client.get('/users/me').expect(401);
    });

    it('locks out and deletes the pending row after repeated wrong codes', async () => {
      const client = agent();
      await startRegistration(client);

      // MAX_VERIFY_ATTEMPTS is 5 — the 5th wrong guess trips the lockout.
      for (let i = 0; i < 4; i++) {
        await client
          .post('/auth/register/confirm')
          .send({email: DEFAULT_USER.email, code: '000000'})
          .expect(400);
      }
      const lockoutResponse = await client
        .post('/auth/register/confirm')
        .send({email: DEFAULT_USER.email, code: '000000'})
        .expect(400);
      expect(lockoutResponse.body.message).toContain('Too many');
      expect(await pendingRepository().count()).toBe(0);
    });

    it('recovers from a lockout by registering again from scratch', async () => {
      // resend is a silent no-op once the pending row is gone (anti-
      // enumeration — see the resend describe block below), so the only way
      // back after a lockout deletes it is to restart at /auth/register.
      const client = agent();
      await startRegistration(client);

      for (let i = 0; i < 5; i++) {
        await client
          .post('/auth/register/confirm')
          .send({email: DEFAULT_USER.email, code: '000000'})
          .expect(400);
      }

      const freshCode = await startRegistration(client);

      await client
        .post('/auth/register/confirm')
        .send({email: DEFAULT_USER.email, code: freshCode})
        .expect(201);
    });

    it('rejects an expired code', async () => {
      const client = agent();
      const code = await startRegistration(client);

      const [pending] = await pendingRepository().find();
      await pendingRepository().update(pending.id, {
        expiresAt: new Date(Date.now() - 1000),
      });

      await client
        .post('/auth/register/confirm')
        .send({email: DEFAULT_USER.email, code})
        .expect(400);
    });

    it('rejects confirming for an email with no pending registration', async () => {
      await agent()
        .post('/auth/register/confirm')
        .send({email: 'nobody@test.com', code: '123456'})
        .expect(400);
    });

    it('rejects confirming while already logged in', async () => {
      // Two independent agents: one already signed in (from an earlier,
      // unrelated registration), the other anonymous and mid-flow for a
      // different email. Confirming is gated by the *caller's* own session,
      // not by anything about the pending row it names.
      const loggedIn = agent();
      const loggedInCode = await startRegistration(loggedIn, {
        email: 'first@test.com',
      });
      await loggedIn
        .post('/auth/register/confirm')
        .send({email: 'first@test.com', code: loggedInCode})
        .expect(201);

      const anonymous = agent();
      const secondCode = await startRegistration(anonymous, {
        email: 'second@test.com',
      });

      await loggedIn
        .post('/auth/register/confirm')
        .send({email: 'second@test.com', code: secondCode})
        .expect(400);
    });
  });

  describe('POST /auth/register/resend', () => {
    it('is a silent 204 no-op for an email with no pending registration', async () => {
      const sendMail = spyOnMail();

      await agent()
        .post('/auth/register/resend')
        .send({email: 'nobody@test.com'})
        .expect(204);

      expect(sendMail).not.toHaveBeenCalled();
    });

    it('invalidates the old code once a new one is sent', async () => {
      const client = agent();
      const oldCode = await startRegistration(client);

      const sendMail = spyOnMail();
      await client
        .post('/auth/register/resend')
        .send({email: DEFAULT_USER.email})
        .expect(204);
      const newCode = extractCode(sendMail.mock.calls.at(-1)![2]);

      expect(newCode).not.toBe(oldCode);
      await client
        .post('/auth/register/confirm')
        .send({email: DEFAULT_USER.email, code: oldCode})
        .expect(400);
      await client
        .post('/auth/register/confirm')
        .send({email: DEFAULT_USER.email, code: newCode})
        .expect(201);
    });
  });

  describe('Referral program', () => {
    // Full round trip through the real HTTP endpoints — start, confirm — for
    // both the referrer (a normal registration) and the new signup
    // (registering with the referrer's code), rather than seeding the
    // referrer directly, so this exercises the exact referralCode a real
    // account would generate.
    const registerAndConfirm = async (
      client: request.Agent,
      overrides: Partial<typeof DEFAULT_USER> & {referralCode?: string} = {}
    ) => {
      const payload = {...DEFAULT_USER, ...overrides};
      const sendMail = spyOnMail();
      await client.post('/auth/register').send(payload).expect(204);
      const code = extractCode(sendMail.mock.calls.at(-1)![2]);
      sendMail.mockRestore();

      const response = await client
        .post('/auth/register/confirm')
        .send({email: payload.email, code})
        .expect(201);
      return response.body as {id: string; referralBonusAwarded: boolean};
    };

    it('credits both the referrer and the new signup with a bonus streak-freeze token when the program is enabled', async () => {
      await enableReferralProgram(await seedAdmin(testApp));

      const referrer = await registerAndConfirm(agent(), {
        email: 'referrer@test.com',
      });
      expect(referrer.referralBonusAwarded).toBe(false);
      const referrerUser = await userRepository().findOneBy({
        id: referrer.id,
      });

      const newUser = await registerAndConfirm(agent(), {
        email: 'newcomer@test.com',
        referralCode: referrerUser!.referralCode,
      });
      expect(newUser.referralBonusAwarded).toBe(true);

      const updatedReferrer = await userRepository().findOneBy({
        id: referrer.id,
      });
      const updatedNewUser = await userRepository().findOneBy({
        id: newUser.id,
      });
      expect(updatedReferrer?.streakFreezeCount).toBe(1);
      expect(updatedNewUser?.streakFreezeCount).toBe(1);
      expect(updatedNewUser?.referredById).toBe(referrer.id);
    });

    it('registers successfully with an unknown/invalid referral code, crediting nobody', async () => {
      await enableReferralProgram(await seedAdmin(testApp));

      const newUser = await registerAndConfirm(agent(), {
        email: 'newcomer@test.com',
        referralCode: 'not-a-real-code',
      });

      expect(newUser.referralBonusAwarded).toBe(false);
      const updatedNewUser = await userRepository().findOneBy({
        id: newUser.id,
      });
      expect(updatedNewUser?.referredById).toBeNull();
      expect(updatedNewUser?.streakFreezeCount).toBe(0);
    });

    it('never credits anyone while the referral program is globally disabled', async () => {
      const referrer = await registerAndConfirm(agent(), {
        email: 'referrer@test.com',
      });
      const referrerUser = await userRepository().findOneBy({
        id: referrer.id,
      });

      // Deliberately not calling enableReferralProgram — the toggle defaults
      // off.
      const newUser = await registerAndConfirm(agent(), {
        email: 'newcomer@test.com',
        referralCode: referrerUser!.referralCode,
      });

      const updatedReferrer = await userRepository().findOneBy({
        id: referrer.id,
      });
      const updatedNewUser = await userRepository().findOneBy({
        id: newUser.id,
      });
      expect(updatedReferrer?.streakFreezeCount).toBe(0);
      expect(updatedNewUser?.referredById).toBeNull();
    });

    it('caps the bonus rather than exceeding MAX_STREAK_FREEZES when the referrer already has one banked', async () => {
      await enableReferralProgram(await seedAdmin(testApp));

      const referrer = await registerAndConfirm(agent(), {
        email: 'referrer@test.com',
      });
      await userRepository().update(referrer.id, {streakFreezeCount: 1});
      const referrerUser = await userRepository().findOneBy({
        id: referrer.id,
      });

      await registerAndConfirm(agent(), {
        email: 'newcomer@test.com',
        referralCode: referrerUser!.referralCode,
      });

      const updatedReferrer = await userRepository().findOneBy({
        id: referrer.id,
      });
      expect(updatedReferrer?.streakFreezeCount).toBe(1);
    });
  });
});
