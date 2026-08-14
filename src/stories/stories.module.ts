import {forwardRef, Module} from '@nestjs/common';
import {StoriesService} from './stories.service';
import {TypeOrmModule} from '@nestjs/typeorm';
import {Story} from './entities/story.entity';
import {StoryReport} from './entities/story-report.entity';
import {StoryRevision} from './entities/story-revision.entity';
import {StoryLike} from 'src/likes/entities/story-like.entity';
import {Bookmark} from 'src/bookmarks/entities/bookmark.entity';
import {ReadingProgress} from 'src/reading-progress/entities/reading-progress.entity';
import {UsersModule} from 'src/users/users.module';
import {PublicStoriesController} from './controllers/public-stories.controller';
import {AdminStoriesController} from './controllers/admin-stories.controller';
import {TagsModule} from 'src/tags/tags.module';
import {CommentsModule} from 'src/comments/comments.module';
import {SeriesModule} from 'src/series/series.module';
import {MutesModule} from 'src/mutes/mutes.module';
import {SettingsModule} from 'src/settings/settings.module';
import {AdminAnalyticsModule} from 'src/admin-analytics/admin-analytics.module';
import {ImageStorageModule} from 'src/image-storage/image-storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Story,
      StoryReport,
      StoryRevision,
      StoryLike,
      Bookmark,
      ReadingProgress,
    ]),
    forwardRef(() => UsersModule),
    TagsModule,
    forwardRef(() => CommentsModule),
    forwardRef(() => SeriesModule),
    MutesModule,
    SettingsModule,
    AdminAnalyticsModule,
    ImageStorageModule,
  ],
  controllers: [PublicStoriesController, AdminStoriesController],
  providers: [StoriesService],
  exports: [StoriesService],
})
export class StoriesModule {}
