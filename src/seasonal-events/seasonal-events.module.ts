import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {TagsModule} from 'src/tags/tags.module';
import {AdminSeasonalEventsController} from './admin-seasonal-events.controller';
import {SeasonalEvent} from './entities/seasonal-event.entity';
import {SeasonalEventCompletion} from './entities/seasonal-event-completion.entity';
import {ReadingProgress} from 'src/reading-progress/entities/reading-progress.entity';
import {PublicSeasonalEventsController} from './public-seasonal-events.controller';
import {SeasonalEventsService} from './seasonal-events.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SeasonalEvent,
      SeasonalEventCompletion,
      ReadingProgress,
    ]),
    TagsModule,
  ],
  controllers: [AdminSeasonalEventsController, PublicSeasonalEventsController],
  providers: [SeasonalEventsService],
  exports: [SeasonalEventsService],
})
export class SeasonalEventsModule {}
