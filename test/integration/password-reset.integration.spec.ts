import request from 'supertest';
import * as bcrypt from 'bcrypt';
import {MailService} from 'src/mail/mail.service';
import {User} from 'src/users/entities/user.entity';
import {PasswordResetToken} from 'src/auth/entities/password-reset-token.entity';
import {
  cleanDatabase,
  closeTestApp,
  createTestApp,
  DEFAULT_USER,
  registerUser,
  type TestApp,
} from './test-utils';

describe('Password reset (integration)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(testApp.dataSource);
  });

  afterEach(() => {
    // spyOnMail() wraps the same DI-managed MailService singleton in every
    // test — without restoring it, a later test's spy would still carry an
    // earlier test's recorded calls.
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  const agent = () => request.agent(testApp.app.getHttpServer());
  const tokenRepository = () =>
    testApp.dataSource.getRepository(PasswordResetToken);

  // MailService just logs when SMTP isn't configured (true in .env.test) —
  // spying on the real DI-managed instance lets tests grab the emailed link's
  // raw token without needing real mail credentials or a test-only API
  // backdoor that would leak it over the wire in production too.
  const spyOnMail = () => {
    const mailService = testApp.app.get(MailService);
    return jest.spyOn(mailService, 'send').mockResolvedValue(undefined);
  };

  const extractToken = (body: string): string => {
    const match = /token=([0-9a-f]+)/.exec(body);
    if (!match) throw new Error('No reset token found in the mailed body');
    return match[1];
  };

  describe('POST /auth/forgot-password', () => {
    it('emails a reset link when the address is registered', async () => {
      await registerUser(agent());
      const sendMail = spyOnMail();

      await agent()
        .post('/auth/forgot-password')
        .send({email: DEFAULT_USER.email})
        .expect(204);

      expect(sendMail).toHaveBeenCalledWith(
        DEFAULT_USER.email,
        expect.any(String),
        expect.stringContaining('/reset-password?token=')
      );
    });

    it('responds identically and sends nothing for an unregistered address', async () => {
      const sendMail = spyOnMail();

      await agent()
        .post('/auth/forgot-password')
        .send({email: 'nobody@test.com'})
        .expect(204);

      expect(sendMail).not.toHaveBeenCalled();
    });

    it('rejects a request that fills the honeypot (bot) with 400', async () => {
      await registerUser(agent());

      await agent()
        .post('/auth/forgot-password')
        .send({email: DEFAULT_USER.email, website: 'http://spam.example'})
        .expect(400);
    });

    it('is CSRF-exempt (no session exists to bind a token to)', async () => {
      await registerUser(agent());

      // No x-csrf-token header attached, and it still isn't a 403.
      await agent()
        .post('/auth/forgot-password')
        .send({email: DEFAULT_USER.email})
        .expect(204);
    });

    it('invalidates a previous link when a new one is requested', async () => {
      await registerUser(agent());
      const sendMail = spyOnMail();

      await agent()
        .post('/auth/forgot-password')
        .send({email: DEFAULT_USER.email})
        .expect(204);
      const firstToken = extractToken(sendMail.mock.calls[0][2]);

      await agent()
        .post('/auth/forgot-password')
        .send({email: DEFAULT_USER.email})
        .expect(204);

      await agent()
        .post('/auth/reset-password')
        .send({token: firstToken, password: 'NewP4ssword!'})
        .expect(400);
    });
  });

  describe('POST /auth/reset-password', () => {
    const requestToken = async (): Promise<string> => {
      await registerUser(agent());
      const sendMail = spyOnMail();
      await agent()
        .post('/auth/forgot-password')
        .send({email: DEFAULT_USER.email})
        .expect(204);
      return extractToken(sendMail.mock.calls[0][2]);
    };

    it('sets a new password that works for the next login', async () => {
      const token = await requestToken();

      await agent()
        .post('/auth/reset-password')
        .send({token, password: 'NewP4ssword!'})
        .expect(204);

      const dbUser = await testApp.dataSource
        .getRepository(User)
        .createQueryBuilder('user')
        .addSelect('user.password')
        .where('user.email = :email', {email: DEFAULT_USER.email})
        .getOne();
      expect(await bcrypt.compare('NewP4ssword!', dbUser!.password!)).toBe(
        true
      );

      // The old password no longer works; the new one does.
      await agent()
        .post('/auth/login')
        .send({email: DEFAULT_USER.email, password: DEFAULT_USER.password})
        .expect(401);
      await agent()
        .post('/auth/login')
        .send({email: DEFAULT_USER.email, password: 'NewP4ssword!'})
        .expect(201);
    });

    it('deletes the token so it cannot be replayed', async () => {
      const token = await requestToken();

      await agent()
        .post('/auth/reset-password')
        .send({token, password: 'NewP4ssword!'})
        .expect(204);

      await agent()
        .post('/auth/reset-password')
        .send({token, password: 'AnotherP4ss!'})
        .expect(400);

      expect(await tokenRepository().count()).toBe(0);
    });

    it('rejects an unknown token with 400', async () => {
      await agent()
        .post('/auth/reset-password')
        .send({token: 'not-a-real-token', password: 'NewP4ssword!'})
        .expect(400);
    });

    it('rejects an expired token with 400', async () => {
      const token = await requestToken();

      // Backdate it past its own TTL, mirroring the notification-badge
      // regression test's approach to simulating "time has passed" directly
      // via the repository rather than waiting an hour in a real test run.
      const [existing] = await tokenRepository().find();
      await tokenRepository().update(existing.id, {
        expiresAt: new Date(Date.now() - 1000),
      });

      await agent()
        .post('/auth/reset-password')
        .send({token, password: 'NewP4ssword!'})
        .expect(400);
    });

    it('rejects a weak new password with 400', async () => {
      const token = await requestToken();

      await agent()
        .post('/auth/reset-password')
        .send({token, password: 'weak'})
        .expect(400);
    });

    it('is CSRF-exempt (consuming the link is itself the proof of identity)', async () => {
      const token = await requestToken();

      await agent()
        .post('/auth/reset-password')
        .send({token, password: 'NewP4ssword!'})
        .expect(204);
    });
  });
});
