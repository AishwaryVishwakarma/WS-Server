import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {StoriesModule} from 'src/stories/stories.module';
import {ReadingProgress} from './entities/reading-progress.entity';
import {ReadingProgressService} from './reading-progress.service';
import {ReadingProgressController} from './reading-progress.controller';
import {User} from 'src/users/entities/user.entity';
import {SeasonalEventsModule} from 'src/seasonal-events/seasonal-events.module';
import {SeasonalEventCompletion} from 'src/seasonal-events/entities/seasonal-event-completion.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReadingProgress, User, SeasonalEventCompletion]),
    StoriesModule,
    SeasonalEventsModule,
  ],
  controllers: [ReadingProgressController],
  providers: [ReadingProgressService],
  exports: [ReadingProgressService],
})
export class ReadingProgressModule {}
