import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {CommentsModule} from 'src/comments/comments.module';
import {StoriesModule} from 'src/stories/stories.module';
import {CommentReaction} from './entities/comment-reaction.entity';
import {CommentReactionsService} from './comment-reactions.service';
import {CommentReactionsController} from './comment-reactions.controller';

// Plain imports, no forwardRef — neither CommentsModule nor StoriesModule
// imports this module back, so there's no cycle to guard against.
@Module({
  imports: [
    TypeOrmModule.forFeature([CommentReaction]),
    CommentsModule,
    StoriesModule,
  ],
  controllers: [CommentReactionsController],
  providers: [CommentReactionsService],
  exports: [CommentReactionsService],
})
export class CommentReactionsModule {}
