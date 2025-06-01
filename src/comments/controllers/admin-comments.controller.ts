import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {CommentsService} from '../comments.service';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {RolesGuard} from 'src/common/gaurds/roles.gaurd';
import {Roles} from 'src/common/decorators/roles.decorators';
import {Role} from 'src/users/enums/role';
import type {PaginationDto} from 'src/common/dto/pagination.dto';

@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('admin/comments')
export class AdminCommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.commentsService.findAll(
      paginationDto.page,
      paginationDto.limit
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.commentsService.findOne(id);
  }
}
