import {MembershipTier} from 'src/users/enums/membership-tier.enum';

// Maps a LemonSqueezy subscription's raw `status` to the tier it implies —
// null for a status this app doesn't otherwise act on, meaning "mirror the
// raw status, but leave membershipTier untouched" (see
// LemonSqueezyWebhookService). Cancelled deliberately maps to Patron, not
// Free: LemonSqueezy keeps a cancelled subscription's access live through
// the current billing period, and subscription_expired is the actual
// downgrade signal once that period ends.
export function membershipTierForStatus(status: string): MembershipTier | null {
  switch (status) {
    case 'active':
    case 'on_trial':
    case 'past_due':
    case 'cancelled':
      return MembershipTier.Patron;
    case 'paused':
    case 'unpaid':
    case 'expired':
      return MembershipTier.Free;
    default:
      return null;
  }
}
