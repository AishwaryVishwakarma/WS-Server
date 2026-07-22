import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {StoriesModule} from 'src/stories/stories.module';
import {Bookmark} from './entities/bookmark.entity';
import {BookmarksService} from './bookmarks.service';
import {BookmarksController} from './bookmarks.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Bookmark]), StoriesModule],
  controllers: [BookmarksController],
  providers: [BookmarksService],
  exports: [BookmarksService],
})
export class BookmarksModule {}
