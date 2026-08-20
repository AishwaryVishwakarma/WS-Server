import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {ApiCookieAuth} from '@nestjs/swagger';
import {Roles} from 'src/common/decorators/roles.decorators';
import {RolesGuard} from 'src/common/gaurds/roles.gaurd';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {Role} from 'src/users/enums/role';
import {CreateSeasonalEventDto} from './dto/create-seasonal-event.dto';
import {UpdateSeasonalEventDto} from './dto/update-seasonal-event.dto';
import {SeasonalEventsService} from './seasonal-events.service';

@ApiCookieAuth('session')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('admin/seasonal-events')
export class AdminSeasonalEventsController {
  constructor(private readonly eventsService: SeasonalEventsService) {}

  @Get()
  list() {
    return this.eventsService.list();
  }

  @Post()
  create(@Body() dto: CreateSeasonalEventDto) {
    return this.eventsService.create(dto);
  }

  @Get(':id/analytics')
  analytics(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.analytics(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSeasonalEventDto
  ) {
    return this.eventsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.remove(id);
  }
}
