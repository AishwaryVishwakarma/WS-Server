import {forwardRef, Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {User} from './entities/user.entity';
import {UserReport} from './entities/user-report.entity';
import {Series} from 'src/series/entities/series.entity';
import {Story} from 'src/stories/entities/story.entity';
import {Bookmark} from 'src/bookmarks/entities/bookmark.entity';
import {Follow} from 'src/follows/entities/follow.entity';
import {ReadingProgress} from 'src/reading-progress/entities/reading-progress.entity';
import {SessionModule} from 'src/session/session.module';
import {PublicUsersController} from './controllers/public-users.controller';
import {AdminUsersController} from './controllers/admin-users.controller';
import {CommentsModule} from 'src/comments/comments.module';
import {PrivateUsersController} from './controllers/private-users.controller';
import {StoriesModule} from 'src/stories/stories.module';
import {SettingsModule} from 'src/settings/settings.module';
import {UsersService} from './users.service';
import {ImageStorageModule} from 'src/image-storage/image-storage.module';
import {SeasonalEventCompletion} from 'src/seasonal-events/entities/seasonal-event-completion.entity';

@Module({
  imports: [
    // Story/Series/Bookmark/Follow are registered as repositories only (not
    // their modules) — computeBadges/computeAuthorStats just need plain
    // aggregate reads, not StoriesService/SeriesService/FollowsService
    // business logic, and injecting any of those services directly would be
    // a genuine circular provider dependency (Stories/Series/Follows modules
    // all already depend on UsersModule).
    TypeOrmModule.forFeature([
      User,
      UserReport,
      Story,
      Series,
      Bookmark,
      Follow,
      ReadingProgress,
      SeasonalEventCompletion,
    ]),
    SessionModule,
    StoriesModule,
    SettingsModule,
    ImageStorageModule,
    forwardRef(() => CommentsModule),
  ],
  controllers: [
    AdminUsersController,
    PrivateUsersController,
    PublicUsersController,
  ],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
