import {Injectable, Logger} from '@nestjs/common';
import type {RedisClientType} from 'redis';
import {SESSION_MAX_AGE_MS} from './session.constants';

// connect-redis's RedisStore prefixes every session key with "sess:" unless a
// `prefix` option is passed — app.setup.ts passes none, so this must match.
const SESSION_KEY_PREFIX = 'sess:';
const userSessionsKey = (userId: string) => `user-sessions:${userId}`;

// Tracks which session ids belong to which user, so a password reset (which
// has no "current" session to exempt — see PasswordResetService) can log out
// every device, not just the one that requested the reset. express-session
// has no such reverse index on its own; connect-redis only supports scanning
// its entire keyspace, not looking up by user.
//
// Redis is created outside the Nest graph in app.setup.ts (shared with the
// session store), so it is handed to us there via bindRedis() — same pattern
// as MetricsService/NotificationsStream.
@Injectable()
export class SessionRegistryService {
  private readonly logger = new Logger('SessionRegistry', {timestamp: true});
  private redisClient?: RedisClientType;

  bindRedis(client: RedisClientType) {
    this.redisClient = client;
  }

  // Call once a session id is established (after session.regenerate()) so it
  // can be found again later. Refreshes the index's own TTL on every call so
  // it never outlives the sessions it lists.
  async track(userId: string, sid: string): Promise<void> {
    if (!this.redisClient) return;
    const key = userSessionsKey(userId);
    await this.redisClient.sAdd(key, sid);
    await this.redisClient.expire(key, SESSION_MAX_AGE_MS / 1000);
  }

  // Call when a session is deliberately destroyed (logout) so the index
  // doesn't accumulate ids for sessions that no longer exist.
  async untrack(userId: string, sid: string): Promise<void> {
    if (!this.redisClient) return;
    await this.redisClient.sRem(userSessionsKey(userId), sid);
  }

  // Destroys every session on record for a user (e.g. after a password
  // reset). Entries can outlive their actual session (the index's own TTL is
  // a coarse upper bound, not per-entry), so a miss on delete is expected and
  // not logged as an error.
  async invalidateAll(userId: string): Promise<void> {
    if (!this.redisClient) return;
    const key = userSessionsKey(userId);
    const sids = await this.redisClient.sMembers(key);
    if (sids.length > 0) {
      try {
        await this.redisClient.del(sids.map((sid) => SESSION_KEY_PREFIX + sid));
      } catch (error) {
        this.logger.warn(
          `Failed to invalidate sessions for user ${userId}: ${String(error)}`
        );
      }
    }
    await this.redisClient.del(key);
  }
}
