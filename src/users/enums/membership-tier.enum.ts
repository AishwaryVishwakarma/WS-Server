// FoundingPatron is assigned once, at grant time, to whoever is among the
// first MEMBERSHIP_FOUNDING_LIMIT to ever hold Patron+ — never re-evaluated
// afterward, so it can't be lost later even if membership lapses and is
// re-granted. See UsersService.grantMembership.
export enum MembershipTier {
  Free = 'free',
  Patron = 'patron',
  FoundingPatron = 'founding_patron',
}

export const MEMBERSHIP_FOUNDING_LIMIT = 100;
