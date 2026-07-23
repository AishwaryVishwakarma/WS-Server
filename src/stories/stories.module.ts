import {forwardRef, Module} from '@nestjs/common';
import {StoriesService} from './stories.service';
import {TypeOrmModule} from '@nestjs/typeorm';
import {Story} from './entities/story.entity';
import {StoryReport} from './entities/story-report.entity';
import {UsersModule} from 'src/users/users.module';
import {PublicStoriesController} from './controllers/public-stories.controller';
import {AdminStoriesController} from './controllers/admin-stories.controller';
import {TagsModule} from 'src/tags/tags.module';
import {CommentsModule} from 'src/comments/comments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Story, StoryReport]),
    forwardRef(() => UsersModule),
    TagsModule,
    forwardRef(() => CommentsModule),
  ],
  controllers: [PublicStoriesController, AdminStoriesController],
  providers: [StoriesService],
  exports: [StoriesService],
})
export class StoriesModule {}
