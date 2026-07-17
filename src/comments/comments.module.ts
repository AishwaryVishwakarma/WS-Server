import {forwardRef, Module} from '@nestjs/common';
import {CommentsService} from './comments.service';
import {TypeOrmModule} from '@nestjs/typeorm';
import {Comment} from './entities/comment.entity';
import {CommentReport} from './entities/comment-report.entity';
import {UsersModule} from 'src/users/users.module';
import {StoriesModule} from 'src/stories/stories.module';
import {NotificationsModule} from 'src/notifications/notifications.module';
import {AdminCommentsController} from './controllers/admin-comments.controller';
import {PublicCommentsController} from './controllers/public-comments.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comment, CommentReport]),
    forwardRef(() => UsersModule),
    forwardRef(() => StoriesModule),
    NotificationsModule,
  ],
  controllers: [AdminCommentsController, PublicCommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
