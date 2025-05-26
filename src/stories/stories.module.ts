import {Module} from '@nestjs/common';
import {StoriesService} from './stories.service';
import {TypeOrmModule} from '@nestjs/typeorm';
import {Story} from './entities/story.entity';
import {UsersModule} from 'src/users/users.module';
import {PublicStoriesController} from './controllers/public-stories.controller';
import {AdminStoriesController} from './controllers/admin-stories.controller';
import {TagsModule} from 'src/tags/tags.module';

@Module({
  imports: [TypeOrmModule.forFeature([Story]), UsersModule, TagsModule],
  controllers: [PublicStoriesController, AdminStoriesController],
  providers: [StoriesService],
})
export class StoriesModule {}
