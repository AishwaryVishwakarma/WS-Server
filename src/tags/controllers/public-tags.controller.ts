import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {TagsService} from '../tags.service';
import {PaginationDto} from 'src/common/dto/pagination.dto';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';

@UseGuards(SessionAuthGuard)
@Controller('tags')
export class PublicTagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.tagsService.findAll(paginationDto.page, paginationDto.limit);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tagsService.findOne(id);
  }
}
