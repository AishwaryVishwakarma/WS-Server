import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {Story} from 'src/stories/entities/story.entity';
import {Comment} from 'src/comments/entities/comment.entity';
import {MetricsService} from './metrics.service';
import {MetricsController} from './metrics.controller';
import {MetricsTokenGuard} from './metrics-token.guard';

// Repos are only for the on-scrape moderation gauges; DataSource and
// ConfigService come from the global TypeORM/Config setup.
@Module({
  imports: [TypeOrmModule.forFeature([Story, Comment])],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsTokenGuard],
  exports: [MetricsService],
})
export class MetricsModule {}
