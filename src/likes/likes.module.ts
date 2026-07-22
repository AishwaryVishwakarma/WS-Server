import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {StoriesModule} from 'src/stories/stories.module';
import {StoryLike} from './entities/story-like.entity';
import {LikesService} from './likes.service';
import {LikesController} from './likes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StoryLike]), StoriesModule],
  controllers: [LikesController],
  providers: [LikesService],
  exports: [LikesService],
})
export class LikesModule {}
