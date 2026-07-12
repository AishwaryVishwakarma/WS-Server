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
  Query,
  Inject,
  forwardRef,
} from '@nestjs/common';
import {StoriesService} from '../stories.service';
import {CreateStoryDto} from '../dto/create-story.dto';
import {UpdateStoryDto} from '../dto/update-story.dto';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {OptionalSessionAuthGuard} from 'src/common/gaurds/optional-session-auth.gaurd';
import {Throttle} from '@nestjs/throttler';
import {PUBLIC_READ_THROTTLE} from 'src/common/constants/throttle';
import {Story} from '../entities/story.entity';
import {plainToInstance, type ClassConstructor} from 'class-transformer';
import {
  StoryWithAuthorPreviewResponseDto,
  StoryResponseDto,
  StoryPreviewResponseDto,
} from '../dto/story-response.dto';
import type {Request} from 'express';
import {PaginationDto} from 'src/common/dto/pagination.dto';
import {StoryQueryDto} from '../dto/story-query.dto';
import {CommentsService} from 'src/comments/comments.service';
import {CommentPreviewResponseDto} from 'src/comments/dto/comment-response.dto';

// Reads are public (anonymous allowed, throttled); mutations require a session
@Controller('stories')
export class PublicStoriesController {
  constructor(
    private readonly storiesService: StoriesService,

    @Inject(forwardRef(() => CommentsService))
    private readonly commentsService: CommentsService
  ) {}

  private _serialize(
    dto: ClassConstructor<StoryResponseDto | StoryWithAuthorPreviewResponseDto>,
    story: Story
  ) {
    return plainToInstance(dto, story, {
      excludeExtraneousValues: true,
    });
  }

  @Post()
  @UseGuards(SessionAuthGuard)
  @HttpCode(201)
  async create(@Body() createStoryDto: CreateStoryDto, @Req() req: Request) {
    const story = await this.storiesService.create(
      createStoryDto,
      req.session.userId!
    );
    return this._serialize(StoryResponseDto, story);
  }

  @Get()
  @Throttle(PUBLIC_READ_THROTTLE)
  @UseGuards(OptionalSessionAuthGuard)
  async findAll(@Query() query: StoryQueryDto) {
    const {page, limit, ...filters} = query;
    const {data, ...rest} = await this.storiesService.findAllApproved(
      page,
      limit,
      filters
    );

    return {
      ...rest,
      data: data.map((story) =>
        plainToInstance(StoryPreviewResponseDto, story, {
          excludeExtraneousValues: true,
        })
      ),
    };
  }

  @Get(':id')
  @Throttle(PUBLIC_READ_THROTTLE)
  @UseGuards(OptionalSessionAuthGuard)
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const story = await this.storiesService.findOneVisible(
      id,
      req.session.userId,
      req.session.role
    );
    return this._serialize(StoryWithAuthorPreviewResponseDto, story);
  }

  @Get(':id/comments')
  @Throttle(PUBLIC_READ_THROTTLE)
  @UseGuards(OptionalSessionAuthGuard)
  async getCommentsForStory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() paginationDto: PaginationDto,
    @Req() req: Request
  ) {
    // Only expose comments if the story itself is visible to this user
    await this.storiesService.findOneVisible(
      id,
      req.session.userId,
      req.session.role
    );

    const {data, ...rest} = await this.commentsService.findAllByStoryId(
      id,
      paginationDto.page,
      paginationDto.limit
    );

    return {
      ...rest,
      data: data.map((comment) =>
        plainToInstance(CommentPreviewResponseDto, comment, {
          excludeExtraneousValues: true,
        })
      ),
    };
  }

  @Patch(':id/submit')
  @UseGuards(SessionAuthGuard)
  async submitDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request
  ) {
    const story = await this.storiesService.submitDraft(
      id,
      req.session.userId!,
      req.session.role!
    );
    return this._serialize(StoryResponseDto, story);
  }

  @Patch(':id')
  @UseGuards(SessionAuthGuard)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateStoryDto: UpdateStoryDto,
    @Req() req: Request
  ) {
    const story = await this.storiesService.update(
      id,
      updateStoryDto,
      req.session.userId!,
      req.session.role!
    );
    return this._serialize(StoryResponseDto, story);
  }

  @Delete(':id')
  @UseGuards(SessionAuthGuard)
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.storiesService.remove(
      id,
      req.session.userId!,
      req.session.role!
    );
  }
}
