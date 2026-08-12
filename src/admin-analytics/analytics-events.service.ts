import {Injectable, Logger} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {
  AnalyticsEvent,
  AnalyticsEventType,
} from './entities/analytics-event.entity';
import {AnalyticsCacheService} from './analytics-cache.service';

@Injectable()
export class AnalyticsEventsService {
  private readonly logger = new Logger(AnalyticsEventsService.name);

  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly events: Repository<AnalyticsEvent>,
    private readonly cache: AnalyticsCacheService
  ) {}

  async record(
    type: AnalyticsEventType,
    input: Omit<Partial<AnalyticsEvent>, 'type'>
  ): Promise<void> {
    try {
      await this.events.insert(
        this.events.create({
          type,
          actorId: null,
          storyId: null,
          metadata: {},
          ...input,
        })
      );
      // View traffic is high-volume; its dashboard count can tolerate the short
      // cache TTL. Moderation changes are rarer and should appear immediately.
      if (type === AnalyticsEventType.STORY_STATUS_CHANGED)
        void this.cache.invalidate();
    } catch (error) {
      this.logger.warn(
        `Analytics event ${type} could not be recorded: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }
}
