import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {TagsModule} from 'src/tags/tags.module';
import {AdminSeasonalEventsController} from './admin-seasonal-events.controller';
import {SeasonalEvent} from './entities/seasonal-event.entity';
import {SeasonalEventsService} from './seasonal-events.service';

@Module({
  imports: [TypeOrmModule.forFeature([SeasonalEvent]), TagsModule],
  controllers: [AdminSeasonalEventsController],
  providers: [SeasonalEventsService],
  exports: [SeasonalEventsService],
})
export class SeasonalEventsModule {}
