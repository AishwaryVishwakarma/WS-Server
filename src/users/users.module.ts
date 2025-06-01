import {forwardRef, Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {User} from './entities/user.entity';
import {SessionModule} from 'src/session/session.module';
import {PublicUsersController} from './controllers/public-users.controller';
import {AdminUsersController} from './controllers/admin-users.controller';
import {CommentsModule} from 'src/comments/comments.module';
import {PrivateUsersController} from './controllers/private-users.controller';
import {StoriesModule} from 'src/stories/stories.module';
import {UsersService} from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
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
