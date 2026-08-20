import request from 'supertest';
import * as crypto from 'crypto';
import {User} from 'src/users/entities/user.entity';
import {MembershipTier} from 'src/users/enums/membership-tier.enum';
import {LemonSqueezyService} from 'src/billing/lemon-squeezy.service';
import {
  cleanDatabase,
  closeTestApp,
  createTestApp,
  getCsrfToken,
  registerUser,
  seedAdmin,
  type IdBody,
  type TestApp,
} from './test-utils';

// Matches .env.test's LEMONSQUEEZY_WEBHOOK_SECRET.
const WEBHOOK_SECRET = 'test-lemonsqueezy-webhook-secret';

function sign(payload: string): string {
  return crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
}

function webhookEvent(
  eventName: string,
  userId: string,
  overrides: {
    subscriptionId?: string;
    customerId?: string;
    status?: string;
  } = {}
): string {
  return JSON.stringify({
    meta: {event_name: eventName, custom_data: {user_id: userId}},
    data: {
      id: overrides.subscriptionId ?? 'sub_1',
      attributes: {
        status: overrides.status ?? 'active',
        customer_id: overrides.customerId ?? 'cust_1',
        renews_at: '2026-06-01T00:00:00.000Z',
        ends_at: null,
      },
    },
  });
}

describe('Billing (integration)', () => {
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

  // supertest/superagent serializes a Buffer body via JSON.stringify when
  // Content-Type is already 'application/json' — Buffer's toJSON produces
  // `{"type":"Buffer","data":[...]}`, silently sending different bytes than
  // what sign() computed the HMAC over. Sending the raw string instead makes
  // superagent write it byte-for-byte.
  const postWebhook = (payload: string, signature = sign(payload)) =>
    request(testApp.app.getHttpServer())
      .post('/webhooks/lemonsqueezy')
      .set('Content-Type', 'application/json')
      .set('X-Signature', signature)
      .send(payload);

  describe('POST /webhooks/lemonsqueezy', () => {
    it('is reachable without a CSRF token — signature is the authenticity check', async () => {
      const {body: user} = (await registerUser(agent(), {
        email: 'reader@test.com',
      })) as {body: IdBody};

      // No x-csrf-token set at all; a genuine CSRF rejection would be 403.
      const response = await postWebhook(
        webhookEvent('subscription_created', user.id)
      );

      expect(response.status).toBe(200);
    });

    it('rejects a tampered payload with 400', async () => {
      const {body: user} = (await registerUser(agent(), {
        email: 'reader@test.com',
      })) as {body: IdBody};
      const payload = webhookEvent('subscription_created', user.id);
      const signature = sign(payload);

      const response = await postWebhook(
        payload.replace('active', 'cancelled'),
        signature
      );

      expect(response.status).toBe(400);
    });

    it('grants Patron and persists the LemonSqueezy ids on subscription_created', async () => {
      const {body: user} = (await registerUser(agent(), {
        email: 'reader@test.com',
      })) as {body: IdBody};

      await postWebhook(
        webhookEvent('subscription_created', user.id, {
          subscriptionId: 'sub_abc',
          customerId: 'cust_abc',
        })
      ).expect(200);

      const stored = await userRepository().findOneByOrFail({id: user.id});
      expect(stored.membershipTier).toBe(MembershipTier.FoundingPatron);
      expect(stored.lemonSqueezySubscriptionId).toBe('sub_abc');
      expect(stored.lemonSqueezyCustomerId).toBe('cust_abc');
      expect(stored.membershipStatus).toBe('active');
      expect(stored.premiumSince).not.toBeNull();
      expect(stored.foundingPatronSince).not.toBeNull();
    });

    it('is idempotent — replaying the same event does not change the row again', async () => {
      const {body: user} = (await registerUser(agent(), {
        email: 'reader@test.com',
      })) as {body: IdBody};
      const payload = webhookEvent('subscription_created', user.id, {
        subscriptionId: 'sub_abc',
      });

      await postWebhook(payload).expect(200);
      const first = await userRepository().findOneByOrFail({id: user.id});
      await postWebhook(payload).expect(200);
      const second = await userRepository().findOneByOrFail({id: user.id});

      expect(second.premiumSince).toEqual(first.premiumSince);
      expect(second.foundingPatronSince).toEqual(first.foundingPatronSince);
      expect(second.membershipTier).toBe(first.membershipTier);
    });

    it('keeps the tier through subscription_cancelled, downgrades on subscription_expired, and restores Founding Patron on resubscribe', async () => {
      const {body: user} = (await registerUser(agent(), {
        email: 'reader@test.com',
      })) as {body: IdBody};

      await postWebhook(
        webhookEvent('subscription_created', user.id, {
          subscriptionId: 'sub_1',
        })
      ).expect(200);

      await postWebhook(
        webhookEvent('subscription_cancelled', user.id, {
          subscriptionId: 'sub_1',
          status: 'cancelled',
        })
      ).expect(200);
      const afterCancel = await userRepository().findOneByOrFail({
        id: user.id,
      });
      expect(afterCancel.membershipTier).toBe(MembershipTier.FoundingPatron);
      expect(afterCancel.membershipStatus).toBe('cancelled');

      await postWebhook(
        webhookEvent('subscription_expired', user.id, {
          subscriptionId: 'sub_1',
          status: 'expired',
        })
      ).expect(200);
      const afterExpiry = await userRepository().findOneByOrFail({
        id: user.id,
      });
      expect(afterExpiry.membershipTier).toBe(MembershipTier.Free);
      expect(afterExpiry.premiumSince).not.toBeNull();
      expect(afterExpiry.foundingPatronSince).not.toBeNull();

      await postWebhook(
        webhookEvent('subscription_created', user.id, {
          subscriptionId: 'sub_2',
        })
      ).expect(200);
      const afterResubscribe = await userRepository().findOneByOrFail({
        id: user.id,
      });
      expect(afterResubscribe.membershipTier).toBe(
        MembershipTier.FoundingPatron
      );
      expect(afterResubscribe.lemonSqueezySubscriptionId).toBe('sub_2');
    });

    it('ignores a late event for a subscription the account has already replaced', async () => {
      const {body: user} = (await registerUser(agent(), {
        email: 'reader@test.com',
      })) as {body: IdBody};
      await postWebhook(
        webhookEvent('subscription_created', user.id, {
          subscriptionId: 'sub_old',
        })
      ).expect(200);
      await postWebhook(
        webhookEvent('subscription_expired', user.id, {
          subscriptionId: 'sub_old',
          status: 'expired',
        })
      ).expect(200);
      await postWebhook(
        webhookEvent('subscription_created', user.id, {
          subscriptionId: 'sub_new',
        })
      ).expect(200);

      // A stray late expiry for the superseded subscription must not
      // downgrade the account that's since resubscribed under a new one.
      await postWebhook(
        webhookEvent('subscription_expired', user.id, {
          subscriptionId: 'sub_old',
          status: 'expired',
        })
      ).expect(200);

      const stored = await userRepository().findOneByOrFail({id: user.id});
      expect(stored.membershipTier).toBe(MembershipTier.FoundingPatron);
      expect(stored.lemonSqueezySubscriptionId).toBe('sub_new');
    });

    it('grants plain Patron via webhook once the founding cap is already reached', async () => {
      const filler = Array.from({length: 100}, (_, i) => ({
        name: `Filler ${i}`,
        slug: `filler-${i}`,
        referralCode: `fc-${i}`,
        email: `filler${i}@test.com`,
        foundingPatronSince: new Date(),
      }));
      await userRepository().insert(filler);

      const {body: user} = (await registerUser(agent(), {
        email: 'reader@test.com',
      })) as {body: IdBody};

      await postWebhook(webhookEvent('subscription_created', user.id)).expect(
        200
      );

      const stored = await userRepository().findOneByOrFail({id: user.id});
      expect(stored.membershipTier).toBe(MembershipTier.Patron);
    });
  });

  describe('POST /users/me/billing/checkout', () => {
    it('rejects an unauthenticated request', async () => {
      // No CSRF token either, so CsrfMiddleware rejects it before the
      // session guard even runs — same as any other unauthenticated
      // mutating request (see csrf.integration.spec.ts).
      await request(testApp.app.getHttpServer())
        .post('/users/me/billing/checkout')
        .expect(403);
    });

    it('returns 503 when LemonSqueezy is not configured', async () => {
      jest
        .spyOn(testApp.app.get(LemonSqueezyService), 'enabled', 'get')
        .mockReturnValue(false);
      const client = agent();
      await registerUser(client, {email: 'reader@test.com'});
      const token = await getCsrfToken(client);

      const response = await client
        .post('/users/me/billing/checkout')
        .set('x-csrf-token', token);

      expect(response.status).toBe(503);
      jest.restoreAllMocks();
    });

    it('returns 403 while membershipFeaturesEnabled is off', async () => {
      jest
        .spyOn(testApp.app.get(LemonSqueezyService), 'enabled', 'get')
        .mockReturnValue(true);
      const client = agent();
      await registerUser(client, {email: 'reader@test.com'});
      const token = await getCsrfToken(client);

      const response = await client
        .post('/users/me/billing/checkout')
        .set('x-csrf-token', token);

      expect(response.status).toBe(403);
      jest.restoreAllMocks();
    });

    it('returns the checkout url once configured and enabled', async () => {
      jest
        .spyOn(testApp.app.get(LemonSqueezyService), 'enabled', 'get')
        .mockReturnValue(true);
      jest
        .spyOn(testApp.app.get(LemonSqueezyService), 'createCheckout')
        .mockResolvedValue({url: 'https://ls.test/checkout/xyz'});
      const admin = await seedAdmin(testApp);
      const adminToken = await getCsrfToken(admin);
      await admin
        .patch('/admin/settings')
        .set('x-csrf-token', adminToken)
        .send({membershipFeaturesEnabled: true})
        .expect(200);

      const client = agent();
      await registerUser(client, {email: 'reader@test.com'});
      const token = await getCsrfToken(client);

      const response = await client
        .post('/users/me/billing/checkout')
        .set('x-csrf-token', token);

      expect(response.status).toBe(201);
      expect(response.body.url).toBe('https://ls.test/checkout/xyz');
      jest.restoreAllMocks();
    });

    it('returns 409 for an account that already has an active membership', async () => {
      jest
        .spyOn(testApp.app.get(LemonSqueezyService), 'enabled', 'get')
        .mockReturnValue(true);
      const admin = await seedAdmin(testApp);
      const adminToken = await getCsrfToken(admin);
      await admin
        .patch('/admin/settings')
        .set('x-csrf-token', adminToken)
        .send({membershipFeaturesEnabled: true})
        .expect(200);

      const client = agent();
      const {body: user} = (await registerUser(client, {
        email: 'reader@test.com',
      })) as {body: IdBody};
      await admin
        .patch(`/admin/users/${user.id}`)
        .set('x-csrf-token', adminToken)
        .send({membershipTier: MembershipTier.Patron})
        .expect(200);
      const token = await getCsrfToken(client);

      const response = await client
        .post('/users/me/billing/checkout')
        .set('x-csrf-token', token);

      expect(response.status).toBe(409);
      jest.restoreAllMocks();
    });
  });

  describe('GET /users/me/billing/portal', () => {
    it('rejects an unauthenticated request', async () => {
      await request(testApp.app.getHttpServer())
        .get('/users/me/billing/portal')
        .expect(401);
    });

    it('returns 404 for an account with no subscription on file', async () => {
      const client = agent();
      await registerUser(client, {email: 'reader@test.com'});

      const response = await client.get('/users/me/billing/portal');

      expect(response.status).toBe(404);
    });

    it('returns the portal url for an account with a subscription on file', async () => {
      const client = agent();
      const {body: user} = (await registerUser(client, {
        email: 'reader@test.com',
      })) as {body: IdBody};
      await postWebhook(
        webhookEvent('subscription_created', user.id, {
          subscriptionId: 'sub_1',
        })
      ).expect(200);
      jest
        .spyOn(testApp.app.get(LemonSqueezyService), 'getCustomerPortalUrl')
        .mockResolvedValue('https://ls.test/portal/1');

      const response = await client.get('/users/me/billing/portal');

      expect(response.status).toBe(200);
      expect(response.body.url).toBe('https://ls.test/portal/1');
      jest.restoreAllMocks();
    });
  });
});
