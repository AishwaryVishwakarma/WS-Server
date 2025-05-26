import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {TagsService} from '../tags.service';
import {CreateTagDto} from '../dto/create-tag.dto';
import {UpdateTagDto} from '../dto/update-tag.dto';
import {AdminOnlyGuard} from 'src/common/gaurds/admin-only.gaurd';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';

@UseGuards(SessionAuthGuard, AdminOnlyGuard)
@Controller('admin/tags')
export class AdminTagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @HttpCode(201)
  create(@Body() createTagDto: CreateTagDto) {
    return this.tagsService.create(createTagDto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTagDto: UpdateTagDto
  ) {
    return this.tagsService.update(id, updateTagDto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.tagsService.remove(id);
  }
}
