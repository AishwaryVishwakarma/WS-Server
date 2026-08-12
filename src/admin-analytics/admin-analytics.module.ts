import {Module} from '@nestjs/common';
import {AdminAnalyticsController} from './admin-analytics.controller';
import {AdminAnalyticsService} from './admin-analytics.service';
import {TypeOrmModule} from '@nestjs/typeorm';
import {AnalyticsEvent} from './entities/analytics-event.entity';
import {AnalyticsEventsService} from './analytics-events.service';
import {AnalyticsCacheService} from './analytics-cache.service';

@Module({
  imports: [TypeOrmModule.forFeature([AnalyticsEvent])],
  controllers: [AdminAnalyticsController],
  providers: [
    AdminAnalyticsService,
    AnalyticsEventsService,
    AnalyticsCacheService,
  ],
  exports: [AnalyticsEventsService],
})
export class AdminAnalyticsModule {}
