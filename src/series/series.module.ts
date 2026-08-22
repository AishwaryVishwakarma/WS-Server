import {forwardRef, Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {Series} from './entities/series.entity';
import {SeriesService} from './series.service';
import {SeriesController} from './series.controller';
import {StoriesModule} from 'src/stories/stories.module';
import {SeriesSubscription} from './entities/series-subscription.entity';
import {NotificationsModule} from 'src/notifications/notifications.module';
import {Story} from 'src/stories/entities/story.entity';
import {SeriesNotifyProcessor} from './series-notify.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Series, SeriesSubscription, Story]),
    forwardRef(() => StoriesModule),
    NotificationsModule,
  ],
  controllers: [SeriesController],
  providers: [SeriesService, SeriesNotifyProcessor],
  exports: [SeriesService],
})
export class SeriesModule {}
