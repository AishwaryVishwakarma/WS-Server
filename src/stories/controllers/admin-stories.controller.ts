import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {StoriesService} from '../stories.service';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {RolesGuard} from 'src/common/gaurds/roles.gaurd';
import {Roles} from 'src/common/decorators/roles.decorators';
import {Role} from 'src/users/enums/role';
import {UpdateStoryStatusDto} from '../dto/update-story-status.dto';
import {AdminStoryQueryDto} from '../dto/admin-story-query.dto';

@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('admin/stories')
export class AdminStoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get()
  findAll(@Query() query: AdminStoryQueryDto) {
    return this.storiesService.findAll(
      query.page,
      query.limit,
      query.status,
      query.search
    );
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateStoryStatusDto: UpdateStoryStatusDto
  ) {
    return this.storiesService.updateStatus(id, updateStoryStatusDto.status);
  }
}
