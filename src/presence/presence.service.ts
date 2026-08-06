import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import type {RedisClientType} from 'redis';
import {Story} from 'src/stories/entities/story.entity';
import {StoryStatus} from 'src/stories/enums/story-status.enum';

// Generous relative to the client's 15s heartbeat interval — a backgrounded
// browser tab gets its own timers throttled (Chrome can delay a hidden tab's
// setInterval to roughly once a minute), so a reader who's just alt-tabbed
// away, not actually gone, must not silently expire from the count. The
// client also heartbeats immediately on refocus (see StoryPresenceIndicator)
// to recover faster than this window alone would.
const PRESENCE_MEMBER_TTL_MS = 90_000;
// Whole-key safety net: a story nobody ever heartbeats again shouldn't leave
// a stale sorted set sitting in Redis forever (its members would otherwise
// only get pruned the next time someone happens to read that same key).
// Kept comfortably above the member TTL above.
const PRESENCE_KEY_TTL_SECONDS = 120;

const presenceKey = (storyId: string) => `presence:story:${storyId}`;

// Redis lives outside the Nest graph (see app.setup.ts), handed to us via
// bindRedis() — same pattern as MetricsService/SessionRegistryService.
@Injectable()
export class PresenceService {
  private redisClient?: RedisClientType;

  constructor(
    @InjectRepository(Story)
    private readonly storiesRepository: Repository<Story>
  ) {}

  bindRedis(client: RedisClientType) {
    this.redisClient = client;
  }

  // Registers this tab as present on the story (if it's actually live) and
  // returns the count of *other* tabs currently present. Reads the Story
  // repository directly rather than injecting StoriesService — this only
  // needs status/scheduledFor, and avoids a module dependency on
  // StoriesModule (mirrors UsersService.computeBadges's own reasoning for
  // reading Story/Series repositories directly).
  async heartbeat(storyId: string, tabId: string): Promise<number> {
    const story = await this.storiesRepository.findOne({
      where: {id: storyId},
      select: {id: true, status: true, scheduledFor: true},
    });
    if (!story) {
      throw new NotFoundException(`Story with ID ${storyId} not found`);
    }

    const isLive =
      story.status === StoryStatus.Approved &&
      (story.scheduledFor === null || story.scheduledFor <= new Date());

    // Never track/report presence for a non-visible story — matches
    // recordView's "don't 404, just don't count" stance, and avoids the
    // count itself becoming a side channel that reveals a pending/scheduled
    // story's existence or activity to anyone probing its id.
    if (!isLive || !this.redisClient) {
      return 0;
    }

    const key = presenceKey(storyId);
    const now = Date.now();

    await this.redisClient.zAdd(key, {
      score: now + PRESENCE_MEMBER_TTL_MS,
      value: tabId,
    });
    await this.redisClient.zRemRangeByScore(key, '-inf', now);
    await this.redisClient.expire(key, PRESENCE_KEY_TTL_SECONDS);
    const count = await this.redisClient.zCard(key);

    // Excludes the caller's own just-added entry — "others", not "everyone".
    return Math.max(0, count - 1);
  }

  // Explicit "I'm gone" signal — fired on unmount/tab-close (see
  // StoryPresenceIndicator) so a genuine departure decrements the count
  // immediately instead of waiting out the member TTL above, which stays
  // wide specifically to *not* penalize a merely-backgrounded tab. A no-op
  // if the member/key never existed (already expired, or the story was never
  // live), so no visibility check is needed here the way heartbeat() has one.
  async leave(storyId: string, tabId: string): Promise<void> {
    if (!this.redisClient) return;
    await this.redisClient.zRem(presenceKey(storyId), tabId);
  }
}
