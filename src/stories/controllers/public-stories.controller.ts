import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import {StoriesService} from '../stories.service';
import {CreateStoryDto} from '../dto/create-story.dto';
import {UpdateStoryDto} from '../dto/update-story.dto';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {Story} from '../entities/story.entity';
import {plainToInstance, type ClassConstructor} from 'class-transformer';
import {
  StoryWithAuthorPreviewResponseDto,
  StoryPreviewResponseDto,
  StoryResponseDto,
} from '../dto/story-response.dto';

@UseGuards(SessionAuthGuard)
@Controller('stories')
export class PublicStoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  private _serialize(
    dto: ClassConstructor<
      | StoryPreviewResponseDto
      | StoryResponseDto
      | StoryWithAuthorPreviewResponseDto
    >,
    story: Story
  ) {
    return plainToInstance(dto, story, {
      excludeExtraneousValues: true,
    });
  }

  @Post()
  @HttpCode(201)
  async create(@Body() createStoryDto: CreateStoryDto) {
    const story = await this.storiesService.create(createStoryDto);
    return this._serialize(StoryResponseDto, story);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const story = await this.storiesService.findOne(id);
    return this._serialize(StoryWithAuthorPreviewResponseDto, story);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateStoryDto: UpdateStoryDto
  ) {
    return this.storiesService.update(id, updateStoryDto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.storiesService.remove(id);
  }
}
