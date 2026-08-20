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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {ApiCookieAuth} from '@nestjs/swagger';
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
  StoryRevisionResponseDto,
} from '../dto/story-response.dto';
import type {Request} from 'express';
import {PaginationDto} from 'src/common/dto/pagination.dto';
import {StoryQueryDto} from '../dto/story-query.dto';
import {ForYouQueryDto} from '../dto/for-you-query.dto';
import {RecommendationFeedbackDto} from '../dto/recommendation-feedback.dto';
import {CommentsService} from 'src/comments/comments.service';
import {
  CommentModerationPreviewResponseDto,
  CommentPreviewResponseDto,
} from 'src/comments/dto/comment-response.dto';
import {ReportStoryDto} from '../dto/report-story.dto';
import {Role} from 'src/users/enums/role';
import {MutesService} from 'src/mutes/mutes.service';
import {FileInterceptor} from '@nestjs/platform-express';
import {
  MAX_IMAGE_BYTES,
  type UploadedImage,
} from 'src/image-storage/image-storage.service';

// Reads are public (anonymous allowed, throttled); mutations require a session
@Controller('stories')
export class PublicStoriesController {
  constructor(
    private readonly storiesService: StoriesService,

    @Inject(forwardRef(() => CommentsService))
    private readonly commentsService: CommentsService,
    private readonly mutesService: MutesService
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
  @ApiCookieAuth('session')
  @UseGuards(SessionAuthGuard)
  @HttpCode(201)
  async create(@Body() createStoryDto: CreateStoryDto, @Req() req: Request) {
    const story = await this.storiesService.create(
      createStoryDto,
      req.session.userId!
    );
    return this._serialize(StoryResponseDto, story);
  }

  // Dual-mode listing. An explicit `?page=` selects offset paging (numbered
  // tag/author shelves); its absence selects keyset paging for the infinite
  // feed, driven by an opaque `?cursor=`. Both share the same filters/sort and
  // return the same story shape — only the paging metadata differs
  // (`page/total/totalPages` vs `nextCursor`).
  @Get()
  @Throttle(PUBLIC_READ_THROTTLE)
  @UseGuards(OptionalSessionAuthGuard)
  async findAll(@Query() query: StoryQueryDto, @Req() req: Request) {
    const {page, limit, cursor, ...filters} = query;

    if (page === undefined) {
      // Only the keyset-paged infinite feed honors muted authors — the
      // offset branch below backs the tag/author shelves, destinations a
      // reader navigates to on purpose (same reasoning already applied to
      // tags: visiting a muted author's profile directly still shows their
      // work).
      const mutedIds = req.session.userId
        ? await this.mutesService.mutedAuthorIds(req.session.userId)
        : [];
      const {data, nextCursor, total} =
        await this.storiesService.findApprovedFeed({
          cursor,
          limit,
          filters: {...filters, excludeAuthorIds: mutedIds},
        });
      return {
        message: 'Success',
        data: this._serializePreviews(data),
        nextCursor,
        total,
      };
    }

    const {data, ...rest} = await this.storiesService.findAllApproved(
      page,
      limit,
      filters
    );
    return {...rest, data: this._serializePreviews(data)};
  }

  private _serializePreviews(stories: Story[]) {
    return stories.map((story) =>
      plainToInstance(StoryPreviewResponseDto, story, {
        excludeExtraneousValues: true,
      })
    );
  }

  // Best-effort read counter. Public (anonymous reads count too) and
  // CSRF-exempt — it's a low-value denormalized counter, not a sensitive
  // mutation — so anonymous browsers, which can't hold a CSRF token, still
  // count. Deduped per session in the service.
  @Post(':id/view')
  @HttpCode(200)
  @Throttle(PUBLIC_READ_THROTTLE)
  @UseGuards(OptionalSessionAuthGuard)
  async recordView(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request
  ) {
    const {viewCount} = await this.storiesService.recordView(
      id,
      req.session,
      req.session.userId
    );
    return {viewCount};
  }

  // Flag a story for moderation. Gated (signed-in members); one report per
  // member — a duplicate is rejected with 409 by the unique constraint — and
  // you can't report your own (400) or a story you can't see (404).
  @Post(':id/report')
  @ApiCookieAuth('session')
  @UseGuards(SessionAuthGuard)
  @HttpCode(204)
  async report(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() reportStoryDto: ReportStoryDto,
    @Req() req: Request
  ) {
    await this.storiesService.report(
      id,
      req.session.userId!,
      reportStoryDto.reason,
      reportStoryDto.details,
      req.session.role
    );
  }

  // Must be registered before `:id` below, or Nest would match the literal
  // path "random" as that route's :id param instead.
  @Get('random')
  @Throttle(PUBLIC_READ_THROTTLE)
  @UseGuards(OptionalSessionAuthGuard)
  async findRandom() {
    return await this.storiesService.findRandomApproved();
  }

  // The signed-in reader's personalized feed — same reason as `random`,
  // must come before `:id`. Gated (not public like the rest of this
  // controller's reads): the "for you" set is derived from the caller's own
  // engagement history, not something an anonymous request can produce.
  @Get('for-you')
  @ApiCookieAuth('session')
  @UseGuards(SessionAuthGuard)
  async findForYou(@Query() query: ForYouQueryDto, @Req() req: Request) {
    const {data, nextCursor, total} = await this.storiesService.findForYouFeed(
      req.session.userId!,
      {cursor: query.cursor, limit: query.limit}
    );
    return {
      message: 'Success',
      data: this._serializePreviews(data),
      nextCursor,
      total,
    };
  }

  @Post(':id/recommendation-feedback')
  @ApiCookieAuth('session')
  @UseGuards(SessionAuthGuard)
  @HttpCode(204)
  async recommendationFeedback(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecommendationFeedbackDto,
    @Req() req: Request
  ) {
    await this.storiesService.setRecommendationFeedback(
      req.session.userId!,
      id,
      dto.action,
      req.session.role
    );
  }

  @Get(':slug')
  @Throttle(PUBLIC_READ_THROTTLE)
  @UseGuards(OptionalSessionAuthGuard)
  async findOne(@Param('slug') slug: string, @Req() req: Request) {
    const story = await this.storiesService.findOneVisibleBySlug(
      slug,
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
    const story = await this.storiesService.findOneVisible(
      id,
      req.session.userId,
      req.session.role
    );

    // The story's own author (or an admin) also sees any hidden comments, so
    // they can review/unhide them — everyone else never sees them at all.
    const includeHidden =
      req.session.role === Role.Admin ||
      story.author?.id === req.session.userId;

    const {data, ...rest} = await this.commentsService.findAllByStoryId(
      id,
      paginationDto.page,
      paginationDto.limit,
      includeHidden
    );

    const dto = includeHidden
      ? CommentModerationPreviewResponseDto
      : CommentPreviewResponseDto;
    return {
      ...rest,
      data: data.map((comment) =>
        plainToInstance(dto, comment, {excludeExtraneousValues: true})
      ),
    };
  }

  @Get(':id/comments/:commentId/replies')
  @Throttle(PUBLIC_READ_THROTTLE)
  @UseGuards(OptionalSessionAuthGuard)
  async getRepliesForComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Query() paginationDto: PaginationDto,
    @Req() req: Request
  ) {
    // Gate on the parent story's visibility, exactly like the comment list.
    const story = await this.storiesService.findOneVisible(
      id,
      req.session.userId,
      req.session.role
    );

    const includeHidden =
      req.session.role === Role.Admin ||
      story.author?.id === req.session.userId;

    const {data, ...rest} = await this.commentsService.findReplies(
      commentId,
      paginationDto.page,
      paginationDto.limit,
      includeHidden
    );

    const dto = includeHidden
      ? CommentModerationPreviewResponseDto
      : CommentPreviewResponseDto;
    return {
      ...rest,
      data: data.map((comment) =>
        plainToInstance(dto, comment, {excludeExtraneousValues: true})
      ),
    };
  }

  @Patch(':id/submit')
  @ApiCookieAuth('session')
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
  @ApiCookieAuth('session')
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

  @Post(':id/cover-image')
  @ApiCookieAuth('session')
  @UseGuards(SessionAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {limits: {fileSize: MAX_IMAGE_BYTES}})
  )
  async uploadCoverImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedImage,
    @Req() req: Request
  ) {
    const story = await this.storiesService.replaceCoverImage(
      id,
      file,
      req.session.userId!,
      req.session.role!
    );
    return this._serialize(StoryResponseDto, story);
  }

  @Delete(':id/cover-image')
  @ApiCookieAuth('session')
  @UseGuards(SessionAuthGuard)
  async deleteCoverImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request
  ) {
    const story = await this.storiesService.removeCoverImage(
      id,
      req.session.userId!,
      req.session.role!
    );
    return this._serialize(StoryResponseDto, story);
  }

  // The story's own edit history — gated to its author or an admin (not
  // public content). View-only in v1: past snapshots, no restore.
  @Get(':id/revisions')
  @ApiCookieAuth('session')
  @UseGuards(SessionAuthGuard)
  async findRevisions(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request
  ) {
    const revisions = await this.storiesService.findRevisions(
      id,
      req.session.userId!,
      req.session.role!
    );
    return revisions.map((revision) =>
      plainToInstance(StoryRevisionResponseDto, revision, {
        excludeExtraneousValues: true,
      })
    );
  }

  @Delete(':id')
  @ApiCookieAuth('session')
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
