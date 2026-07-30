import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {StoriesModule} from 'src/stories/stories.module';
import {ReadingProgress} from './entities/reading-progress.entity';
import {ReadingProgressService} from './reading-progress.service';
import {ReadingProgressController} from './reading-progress.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ReadingProgress]), StoriesModule],
  controllers: [ReadingProgressController],
  providers: [ReadingProgressService],
  exports: [ReadingProgressService],
})
export class ReadingProgressModule {}
