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
  Req,
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
import type {Request} from 'express';

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
  async create(@Body() createStoryDto: CreateStoryDto, @Req() req: Request) {
    const story = await this.storiesService.create(
      createStoryDto,
      req.session.userId!
    );
    return this._serialize(StoryResponseDto, story);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const story = await this.storiesService.findOne(id);
    return this._serialize(StoryWithAuthorPreviewResponseDto, story);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateStoryDto: UpdateStoryDto,
    @Req() req: Request
  ) {
    const story = await this.storiesService.update(
      id,
      updateStoryDto,
      req.session.userId!,
      req.session.isAdmin!
    );
    return this._serialize(StoryResponseDto, story);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.storiesService.remove(
      id,
      req.session.userId!,
      req.session.isAdmin!
    );
  }
}
