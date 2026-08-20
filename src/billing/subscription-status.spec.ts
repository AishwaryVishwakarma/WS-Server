import {MembershipTier} from 'src/users/enums/membership-tier.enum';
import {membershipTierForStatus} from './subscription-status';

describe('membershipTierForStatus', () => {
  it.each([
    ['active', MembershipTier.Patron],
    ['on_trial', MembershipTier.Patron],
    ['past_due', MembershipTier.Patron],
    ['cancelled', MembershipTier.Patron],
    ['paused', MembershipTier.Free],
    ['unpaid', MembershipTier.Free],
    ['expired', MembershipTier.Free],
  ])('maps %s to %s', (status, expected) => {
    expect(membershipTierForStatus(status)).toBe(expected);
  });

  it('returns null for an unrecognized status', () => {
    expect(membershipTierForStatus('some_future_status')).toBeNull();
  });
});
