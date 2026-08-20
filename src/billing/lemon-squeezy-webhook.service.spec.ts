import {BadRequestException, ServiceUnavailableException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {Test} from '@nestjs/testing';
import * as crypto from 'crypto';
import {UsersService} from 'src/users/users.service';
import {MembershipTier} from 'src/users/enums/membership-tier.enum';
import {LemonSqueezyWebhookService} from './lemon-squeezy-webhook.service';

const SECRET = 'test-lemonsqueezy-webhook-secret';

function sign(payload: string): string {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

function event(
  eventName: string,
  overrides: {
    subscriptionId?: string;
    customerId?: string | number;
    status?: string;
    userId?: string;
    renewsAt?: string | null;
    endsAt?: string | null;
  } = {}
) {
  return JSON.stringify({
    meta: {
      event_name: eventName,
      custom_data: overrides.userId ? {user_id: overrides.userId} : {},
    },
    data: {
      id: overrides.subscriptionId ?? 'sub_1',
      attributes: {
        status: overrides.status ?? 'active',
        customer_id: overrides.customerId ?? 999,
        renews_at: overrides.renewsAt ?? '2026-06-01T00:00:00.000Z',
        ends_at: overrides.endsAt ?? null,
      },
    },
  });
}

describe('LemonSqueezyWebhookService', () => {
  let service: LemonSqueezyWebhookService;
  let usersService: {
    findForBillingWebhook: jest.Mock;
    applyMembershipChange: jest.Mock;
  };
  const USER_ID = '11111111-1111-1111-1111-111111111111';

  // No default value — a caller passing `undefined` explicitly (to test the
  // unconfigured-secret path) must actually get `undefined`, which a default
  // parameter would silently override back to SECRET.
  const build = async (secret: string | undefined) => {
    usersService = {
      findForBillingWebhook: jest.fn().mockResolvedValue({
        id: USER_ID,
        membershipTier: MembershipTier.Patron,
        lemonSqueezySubscriptionId: 'sub_1',
      }),
      applyMembershipChange: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        LemonSqueezyWebhookService,
        {provide: UsersService, useValue: usersService},
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'LEMONSQUEEZY_WEBHOOK_SECRET' ? secret : undefined
            ),
          },
        },
      ],
    }).compile();
    service = module.get(LemonSqueezyWebhookService);
  };

  beforeEach(() => build(SECRET));

  it('throws if the webhook secret is not configured', async () => {
    await build(undefined);
    const payload = event('subscription_created', {userId: USER_ID});

    await expect(
      service.handle(Buffer.from(payload), sign(payload))
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('rejects a missing signature header', async () => {
    const payload = event('subscription_created', {userId: USER_ID});

    await expect(
      service.handle(Buffer.from(payload), undefined)
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a tampered payload', async () => {
    const payload = event('subscription_created', {userId: USER_ID});
    const signature = sign(payload);
    const tampered = payload.replace('active', 'cancelled');

    await expect(
      service.handle(Buffer.from(tampered), signature)
    ).rejects.toThrow(BadRequestException);
    expect(usersService.applyMembershipChange).not.toHaveBeenCalled();
  });

  it('grants Patron on subscription_created', async () => {
    const payload = event('subscription_created', {
      userId: USER_ID,
      customerId: 'cust_1',
      subscriptionId: 'sub_new',
    });
    usersService.findForBillingWebhook.mockResolvedValue({
      id: USER_ID,
      membershipTier: MembershipTier.Free,
      lemonSqueezySubscriptionId: null,
    });

    await service.handle(Buffer.from(payload), sign(payload));

    expect(usersService.applyMembershipChange).toHaveBeenCalledWith(
      USER_ID,
      MembershipTier.Patron,
      expect.objectContaining({
        lemonSqueezyCustomerId: 'cust_1',
        lemonSqueezySubscriptionId: 'sub_new',
        membershipStatus: 'active',
      })
    );
  });

  it('is idempotent — a byte-identical replay produces the same call', async () => {
    const payload = event('subscription_created', {userId: USER_ID});
    const signature = sign(payload);

    await service.handle(Buffer.from(payload), signature);
    await service.handle(Buffer.from(payload), signature);

    expect(usersService.applyMembershipChange).toHaveBeenCalledTimes(2);
    expect(usersService.applyMembershipChange.mock.calls[0]).toEqual(
      usersService.applyMembershipChange.mock.calls[1]
    );
  });

  it('does not downgrade on subscription_cancelled — access continues to period end', async () => {
    const payload = event('subscription_cancelled', {
      userId: USER_ID,
      status: 'cancelled',
      endsAt: '2026-07-01T00:00:00.000Z',
      renewsAt: null,
    });

    await service.handle(Buffer.from(payload), sign(payload));

    expect(usersService.applyMembershipChange).toHaveBeenCalledWith(
      USER_ID,
      MembershipTier.Patron, // the account's current tier, left unchanged
      expect.objectContaining({membershipStatus: 'cancelled'})
    );
  });

  it('downgrades to Free on subscription_expired', async () => {
    const payload = event('subscription_expired', {
      userId: USER_ID,
      status: 'expired',
    });

    await service.handle(Buffer.from(payload), sign(payload));

    expect(usersService.applyMembershipChange).toHaveBeenCalledWith(
      USER_ID,
      MembershipTier.Free,
      expect.objectContaining({
        membershipStatus: 'expired',
        membershipRenewsAt: null,
      })
    );
  });

  it('does nothing for subscription_payment_failed', async () => {
    const payload = event('subscription_payment_failed', {userId: USER_ID});

    await service.handle(Buffer.from(payload), sign(payload));

    expect(usersService.applyMembershipChange).not.toHaveBeenCalled();
  });

  it('ignores a stale event for a subscription the account has since replaced', async () => {
    usersService.findForBillingWebhook.mockResolvedValue({
      id: USER_ID,
      membershipTier: MembershipTier.Patron,
      lemonSqueezySubscriptionId: 'sub_current',
    });
    const payload = event('subscription_expired', {
      userId: USER_ID,
      subscriptionId: 'sub_old',
    });

    await service.handle(Buffer.from(payload), sign(payload));

    expect(usersService.applyMembershipChange).not.toHaveBeenCalled();
  });

  it('resolves quietly for an unknown account, without throwing', async () => {
    usersService.findForBillingWebhook.mockResolvedValue(null);
    const payload = event('subscription_created', {userId: USER_ID});

    await expect(
      service.handle(Buffer.from(payload), sign(payload))
    ).resolves.toBeUndefined();
    expect(usersService.applyMembershipChange).not.toHaveBeenCalled();
  });

  it('falls back to the customer id when custom_data carries no user id', async () => {
    const payload = event('subscription_created', {customerId: 'cust_42'});

    await service.handle(Buffer.from(payload), sign(payload));

    expect(usersService.findForBillingWebhook).toHaveBeenCalledWith(
      undefined,
      'cust_42'
    );
  });

  it('ignores a malformed custom_data.user_id rather than querying it directly', async () => {
    const payload = event('subscription_created', {
      userId: 'not-a-real-uuid',
      customerId: 'cust_7',
    });

    await service.handle(Buffer.from(payload), sign(payload));

    expect(usersService.findForBillingWebhook).toHaveBeenCalledWith(
      undefined,
      'cust_7'
    );
  });

  it('resolves without throwing for an unrecognized event name', async () => {
    const payload = event('some_future_event', {userId: USER_ID});

    await expect(
      service.handle(Buffer.from(payload), sign(payload))
    ).resolves.toBeUndefined();
  });

  it('mirrors an unrecognized status without changing the tier', async () => {
    const payload = event('subscription_updated', {
      userId: USER_ID,
      status: 'some_future_status',
    });

    await service.handle(Buffer.from(payload), sign(payload));

    expect(usersService.applyMembershipChange).toHaveBeenCalledWith(
      USER_ID,
      MembershipTier.Patron, // the account's current tier, unchanged
      expect.objectContaining({membershipStatus: 'some_future_status'})
    );
  });
});
