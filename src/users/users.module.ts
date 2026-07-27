import {forwardRef, Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {User} from './entities/user.entity';
import {UserReport} from './entities/user-report.entity';
import {Series} from 'src/series/entities/series.entity';
import {Story} from 'src/stories/entities/story.entity';
import {SessionModule} from 'src/session/session.module';
import {PublicUsersController} from './controllers/public-users.controller';
import {AdminUsersController} from './controllers/admin-users.controller';
import {CommentsModule} from 'src/comments/comments.module';
import {PrivateUsersController} from './controllers/private-users.controller';
import {StoriesModule} from 'src/stories/stories.module';
import {UsersService} from './users.service';

@Module({
  imports: [
    // Story/Series are registered as repositories only (not their modules) —
    // computeBadges just needs plain aggregate reads, not StoriesService/
    // SeriesService business logic, and injecting either service directly
    // would be a genuine circular provider dependency (both already depend
    // on UsersService).
    TypeOrmModule.forFeature([User, UserReport, Story, Series]),
    SessionModule,
    StoriesModule,
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
