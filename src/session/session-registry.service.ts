import {Injectable, Logger} from '@nestjs/common';
import type {RedisClientType} from 'redis';
import {createHash} from 'crypto';
import {SESSION_MAX_AGE_MS} from './session.constants';
import type {SessionResponseDto} from './dto/session-response.dto';

// connect-redis's RedisStore prefixes every session key with "sess:" unless a
// `prefix` option is passed — app.setup.ts passes none, so this must match.
const SESSION_KEY_PREFIX = 'sess:';
const userSessionsKey = (userId: string) => `user-sessions:${userId}`;
const publicId = (sid: string) =>
  createHash('sha256').update(sid).digest('hex').slice(0, 32);

interface StoredSession {
  cookie?: {expires?: string};
  metadata?: {
    device?: string;
    browser?: string;
    location?: string;
    createdAt?: string;
  };
}

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
  // can be found again later. `maxAgeMs` should match the session's actual
  // cookie maxAge (e.g. a longer "remember me" session) — the index's own TTL
  // is bumped up to cover it, but never shrunk, since a single Redis SET has
  // no per-member TTL: a later plain login tracked for the same user must not
  // truncate an existing remembered session out of the index it needs to stay
  // findable by (e.g. for a password-reset logout-everywhere).
  async track(
    userId: string,
    sid: string,
    maxAgeMs: number = SESSION_MAX_AGE_MS
  ): Promise<void> {
    if (!this.redisClient) return;
    const key = userSessionsKey(userId);
    await this.redisClient.sAdd(key, sid);

    const newTtlSeconds = Math.ceil(maxAgeMs / 1000);
    const currentTtlSeconds = await this.redisClient.ttl(key);
    if (currentTtlSeconds < newTtlSeconds) {
      await this.redisClient.expire(key, newTtlSeconds);
    }
  }

  // Call when a session is deliberately destroyed (logout) so the index
  // doesn't accumulate ids for sessions that no longer exist.
  async untrack(userId: string, sid: string): Promise<void> {
    if (!this.redisClient) return;
    await this.redisClient.sRem(userSessionsKey(userId), sid);
  }

  async list(
    userId: string,
    currentSid: string
  ): Promise<SessionResponseDto[]> {
    if (!this.redisClient) return [];
    const key = userSessionsKey(userId);
    const sids = await this.redisClient.sMembers(key);
    if (sids.length === 0) return [];

    const values = await this.redisClient.mGet(
      sids.map((sid) => SESSION_KEY_PREFIX + sid)
    );
    const staleSids: string[] = [];
    const sessions = sids.flatMap((sid, index) => {
      const value = values[index];
      if (!value) {
        staleSids.push(sid);
        return [];
      }

      try {
        const stored = JSON.parse(value) as StoredSession;
        const expiresAt = stored.cookie?.expires;
        if (!expiresAt) return [];
        return [
          {
            id: publicId(sid),
            device: stored.metadata?.device ?? 'Unknown device',
            browser: stored.metadata?.browser ?? 'Unknown browser',
            location: stored.metadata?.location,
            createdAt: stored.metadata?.createdAt ?? expiresAt,
            expiresAt,
            current: sid === currentSid,
          },
        ];
      } catch {
        staleSids.push(sid);
        return [];
      }
    });

    if (staleSids.length > 0) await this.redisClient.sRem(key, staleSids);
    return sessions.sort((a, b) => Number(b.current) - Number(a.current));
  }

  async invalidate(
    userId: string,
    id: string,
    currentSid: string
  ): Promise<boolean> {
    if (!this.redisClient) return false;
    const key = userSessionsKey(userId);
    const sids = await this.redisClient.sMembers(key);
    const sid = sids.find((candidate) => publicId(candidate) === id);
    if (!sid || sid === currentSid) return false;

    await this.redisClient.del(SESSION_KEY_PREFIX + sid);
    await this.redisClient.sRem(key, sid);
    return true;
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

  // Used after an authenticated password change: revoke every other device
  // while preserving the session that supplied the current-password proof.
  async invalidateOthers(userId: string, currentSid: string): Promise<void> {
    if (!this.redisClient) return;
    const key = userSessionsKey(userId);
    const sids = await this.redisClient.sMembers(key);
    const otherSids = sids.filter((sid) => sid !== currentSid);

    if (otherSids.length > 0) {
      try {
        await this.redisClient.del(
          otherSids.map((sid) => SESSION_KEY_PREFIX + sid)
        );
      } catch (error) {
        this.logger.warn(
          `Failed to invalidate other sessions for user ${userId}: ${String(error)}`
        );
      }
      await this.redisClient.sRem(key, otherSids);
    }
  }
}
