import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {StoriesModule} from 'src/stories/stories.module';
import {UsersModule} from 'src/users/users.module';
import {NotificationsModule} from 'src/notifications/notifications.module';
import {Follow} from './entities/follow.entity';
import {FollowsService} from './follows.service';
import {FollowsController} from './follows.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Follow]),
    UsersModule,
    StoriesModule,
    NotificationsModule,
  ],
  controllers: [FollowsController],
  providers: [FollowsService],
  exports: [FollowsService],
})
export class FollowsModule {}
