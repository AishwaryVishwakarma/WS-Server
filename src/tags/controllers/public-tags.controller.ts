import {Controller, Get, Param, Query} from '@nestjs/common';
import {Throttle} from '@nestjs/throttler';
import {TagsService} from '../tags.service';
import {PaginationDto} from 'src/common/dto/pagination.dto';
import {PUBLIC_READ_THROTTLE} from 'src/common/constants/throttle';

// Public reads — no session required; browsing-friendly throttle budget
@Throttle(PUBLIC_READ_THROTTLE)
@Controller('tags')
export class PublicTagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.tagsService.findAll(paginationDto.page, paginationDto.limit);
  }

  @Get(':idOrSlug')
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.tagsService.findOneByIdOrSlug(idOrSlug);
  }
}
