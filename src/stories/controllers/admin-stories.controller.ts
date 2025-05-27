import {Controller, Get, Query, UseGuards} from '@nestjs/common';
import {StoriesService} from '../stories.service';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {RolesGuard} from 'src/common/gaurds/roles.gaurd';
import {Roles} from 'src/common/decorators/roles.decorators';
import {Role} from 'src/users/enums/role';
import {PaginationDto} from 'src/common/dto/pagination.dto';

@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('admin/stories')
export class AdminStoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.storiesService.findAll(paginationDto.page, paginationDto.limit);
  }
}
