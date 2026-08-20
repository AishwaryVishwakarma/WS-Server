import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import type {RedisClientType} from 'redis';
import {Story} from 'src/stories/entities/story.entity';
import {StoryStatus} from 'src/stories/enums/story-status.enum';

// Covers browser timer throttling while a reader briefly backgrounds a tab.
const PRESENCE_MEMBER_TTL_MS = 90_000;
// Remove abandoned story sets even if nobody returns to trigger pruning.
const PRESENCE_KEY_TTL_SECONDS = 120;

const presenceKey = (storyId: string) => `presence:story:${storyId}`;

// Redis is bound by app.setup.ts outside the Nest graph.
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

  // Reads the repository directly to avoid a StoriesModule dependency.
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

    // Presence must not reveal pending or scheduled stories.
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

    // The displayed count means other readers, excluding this tab.
    return Math.max(0, count - 1);
  }

  // Explicit departure avoids waiting for the background-tab-safe TTL.
  async leave(storyId: string, tabId: string): Promise<void> {
    if (!this.redisClient) return;
    await this.redisClient.zRem(presenceKey(storyId), tabId);
  }
}
