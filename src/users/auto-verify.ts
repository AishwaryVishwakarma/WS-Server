import type {User} from './entities/user.entity';

// An account earns verification automatically once it's at least this old
// and has ever had a story reach `approved` (User.hasPublishedStory — set
// once, never cleared, so later deleting that story has no effect).
export const AUTO_VERIFY_MIN_ACCOUNT_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// A plain predicate (not a NestJS service method) so SessionAuthGuard — which
// only has DataSource available, not the full DI graph every other module
// sits in — can call it directly without needing UsersService injected.
// `verificationLocked` means "isVerified has already been decided, one way
// or the other" (by this check firing once, or by an admin's explicit
// choice) — checked so an admin's later un-verify is never silently
// overwritten by this running again on the user's next request.
export function shouldAutoVerify(
  user: Pick<
    User,
    'isVerified' | 'verificationLocked' | 'hasPublishedStory' | 'createdAt'
  >
): boolean {
  return (
    !user.isVerified &&
    !user.verificationLocked &&
    user.hasPublishedStory &&
    Date.now() - user.createdAt.getTime() >= AUTO_VERIFY_MIN_ACCOUNT_AGE_MS
  );
}
