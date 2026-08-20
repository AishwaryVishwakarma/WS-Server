import {Controller, Get} from '@nestjs/common';
import {SeasonalEventsService} from './seasonal-events.service';

@Controller('seasonal-events')
export class PublicSeasonalEventsController {
  constructor(private readonly eventsService: SeasonalEventsService) {}

  @Get()
  list() {
    return this.eventsService.publicList();
  }
}
