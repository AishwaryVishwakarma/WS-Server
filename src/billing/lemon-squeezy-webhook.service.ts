import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import * as crypto from 'crypto';
import {UsersService} from 'src/users/users.service';
import {MembershipTier} from 'src/users/enums/membership-tier.enum';
import {membershipTierForStatus} from './subscription-status';

// A Postgres uuid column rejects a malformed literal with a driver error
// (500, which LemonSqueezy would then retry forever) rather than a clean
// miss — validate custom_data.user_id's shape before it ever reaches a query.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LemonSqueezyWebhookPayload {
  meta: {
    event_name: string;
    custom_data?: Record<string, unknown>;
  };
  data: {
    id: string;
    attributes: {
      status: string;
      customer_id: number | string;
      renews_at?: string | null;
      ends_at?: string | null;
    };
  };
}

@Injectable()
export class LemonSqueezyWebhookService {
  private readonly logger = new Logger(LemonSqueezyWebhookService.name);
  private readonly secret: string | undefined;

  constructor(
    private readonly usersService: UsersService,
    configService: ConfigService
  ) {
    this.secret = configService.get<string>('LEMONSQUEEZY_WEBHOOK_SECRET');
  }

  async handle(
    rawBody: Buffer | undefined,
    signatureHeader: string | undefined
  ): Promise<void> {
    if (!this.secret) {
      throw new ServiceUnavailableException(
        'Billing webhooks are not configured'
      );
    }
    if (
      !rawBody ||
      !signatureHeader ||
      !this._verify(rawBody, signatureHeader)
    ) {
      throw new BadRequestException('Invalid webhook');
    }

    let payload: LemonSqueezyWebhookPayload;
    try {
      payload = JSON.parse(
        rawBody.toString('utf8')
      ) as LemonSqueezyWebhookPayload;
    } catch {
      throw new BadRequestException('Invalid webhook');
    }

    const rawUserId = payload.meta.custom_data?.user_id;
    const userId =
      typeof rawUserId === 'string' && UUID_PATTERN.test(rawUserId)
        ? rawUserId
        : undefined;
    const customerId = String(payload.data.attributes.customer_id);

    const user = await this.usersService.findForBillingWebhook(
      userId,
      customerId
    );
    if (!user) {
      this.logger.debug(
        `LemonSqueezy webhook for unknown account (event=${payload.meta.event_name})`
      );
      return;
    }

    // A late/retried event for a subscription this account has since
    // replaced (cancelled, then resubscribed) must never downgrade the
    // current one — only subscription_created is allowed to attach a new
    // subscription id to an account that already has a different one on file.
    const isStale =
      payload.meta.event_name !== 'subscription_created' &&
      !!user.lemonSqueezySubscriptionId &&
      user.lemonSqueezySubscriptionId !== payload.data.id;
    if (isStale) {
      this.logger.debug(
        `Ignoring stale LemonSqueezy webhook for subscription ${payload.data.id} (account holds ${user.lemonSqueezySubscriptionId})`
      );
      return;
    }

    await this._dispatch(user, payload, customerId);
  }

  private async _dispatch(
    user: {id: string; membershipTier: MembershipTier},
    payload: LemonSqueezyWebhookPayload,
    customerId: string
  ): Promise<void> {
    const userId = user.id;
    const {event_name: eventName} = payload.meta;
    const {
      status,
      renews_at: renewsAt,
      ends_at: endsAt,
    } = payload.data.attributes;

    switch (eventName) {
      case 'subscription_created':
        await this.usersService.applyMembershipChange(
          userId,
          MembershipTier.Patron,
          {
            lemonSqueezyCustomerId: customerId,
            lemonSqueezySubscriptionId: payload.data.id,
            membershipStatus: status,
            membershipRenewsAt: renewsAt ? new Date(renewsAt) : null,
          }
        );
        return;

      case 'subscription_expired':
        // The actual downgrade — a cancelled subscription keeps its tier
        // until this fires (see subscription_cancelled below).
        await this.usersService.applyMembershipChange(
          userId,
          MembershipTier.Free,
          {membershipStatus: status, membershipRenewsAt: null}
        );
        return;

      case 'subscription_payment_failed':
        // Deliberately a no-op. LemonSqueezy is the Merchant of Record and
        // runs its own dunning emails; past_due already surfaces through
        // subscription_updated below, and subscription_expired is still the
        // terminal signal. Do not add member-facing behavior here — it
        // would duplicate the MoR's job and could alarm someone whose retry
        // succeeds shortly after.
        this.logger.debug(
          `Payment failed for subscription ${payload.data.id} — no action (LemonSqueezy handles dunning)`
        );
        return;

      // subscription_updated, subscription_cancelled, subscription_resumed,
      // subscription_paused, subscription_unpaused, and anything else this
      // app doesn't otherwise need to react to all share the same handling:
      // mirror the raw status/renewal date, and only touch the tier when
      // the status maps to one unambiguously. subscription_cancelled in
      // particular must NOT downgrade — LemonSqueezy keeps access live
      // through the current billing period, and subscription_expired is
      // the real end-of-access signal once that period is over.
      default: {
        const tier = membershipTierForStatus(status);
        const billing = {
          membershipStatus: status,
          membershipRenewsAt: renewsAt
            ? new Date(renewsAt)
            : endsAt
              ? new Date(endsAt)
              : null,
        };
        if (tier === null || eventName === 'subscription_cancelled') {
          // Status alone doesn't tell us anything new about the tier (an
          // unrecognized status, or an event we deliberately don't act on
          // the tier for) — keep the mirrored fields honest without
          // changing what tier the account currently holds.
          await this.usersService.applyMembershipChange(
            userId,
            user.membershipTier,
            billing
          );
          return;
        }
        await this.usersService.applyMembershipChange(userId, tier, billing);
      }
    }
  }

  private _verify(rawBody: Buffer, signatureHeader: string): boolean {
    const digest = crypto
      .createHmac('sha256', this.secret!)
      .update(rawBody)
      .digest('hex');
    const digestBuffer = Buffer.from(digest, 'utf8');
    const signatureBuffer = Buffer.from(signatureHeader, 'utf8');

    // timingSafeEqual throws on mismatched lengths rather than returning
    // false, so a tampered/short signature has to be caught before it.
    if (digestBuffer.length !== signatureBuffer.length) return false;
    return crypto.timingSafeEqual(digestBuffer, signatureBuffer);
  }
}
