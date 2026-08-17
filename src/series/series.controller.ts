import {
  Body,
  Controller,
  ForbiddenException,
  forwardRef,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {Request} from 'express';
import {Throttle} from '@nestjs/throttler';
import {plainToInstance} from 'class-transformer';
import {SeriesService} from './series.service';
import type {Series} from './entities/series.entity';
import {SeriesResponseDto} from './dto/series-response.dto';
import {ReorderSeriesDto} from './dto/reorder-series.dto';
import {StoriesService} from 'src/stories/stories.service';
import type {Story} from 'src/stories/entities/story.entity';
import {
  StoryPreviewResponseDto,
  StoryWithAuthorPreviewResponseDto,
} from 'src/stories/dto/story-response.dto';
import {ApiCookieAuth} from '@nestjs/swagger';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {PUBLIC_READ_THROTTLE} from 'src/common/constants/throttle';

// Mixed route shapes on one controller (no shared prefix), mirroring
// BookmarksController/FollowsController: a public series page and a
// gated "my series" list for the story editor.
@Controller()
export class SeriesController {
  constructor(
    private readonly seriesService: SeriesService,

    @Inject(forwardRef(() => StoriesService))
    private readonly storiesService: StoriesService
  ) {}

  private _serializeSeries(series: Series) {
    return plainToInstance(SeriesResponseDto, series, {
      excludeExtraneousValues: true,
    });
  }

  // Series has no admin gate (unlike stories) — a plain equality check, not
  // StoriesService._getStoryIfAuthorized's owner-or-admin shape.
  private _assertOwnsSeries(series: Series, userId: string) {
    if (series.author.id !== userId) {
      throw new ForbiddenException(
        'You do not have permission to modify this series'
      );
    }
  }

  private _serializeMine(series: Series, stories: Story[]) {
    return {
      ...this._serializeSeries(series),
      stories: stories.map((story) =>
        plainToInstance(StoryWithAuthorPreviewResponseDto, story, {
          excludeExtraneousValues: true,
        })
      ),
    };
  }

  // The editor's "you already have" hints — every series this author has
  // used before, regardless of the moderation status of the stories in it.
  @Get('users/me/series')
  @ApiCookieAuth('session')
  @UseGuards(SessionAuthGuard)
  async findMine(@Req() req: Request) {
    const series = await this.seriesService.findAllByAuthor(
      req.session.userId!
    );
    return series.map((s) => this._serializeSeries(s));
  }

  // The author's own detail view — every story in the series regardless of
  // status, so they can see/reorder drafts and pending parts too. Distinct
  // from the public findOne below, which is approved-only.
  @Get('users/me/series/:id')
  @ApiCookieAuth('session')
  @UseGuards(SessionAuthGuard)
  async findOneMine(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request
  ) {
    const series = await this.seriesService.findOne(id);
    this._assertOwnsSeries(series, req.session.userId!);
    const stories = await this.storiesService.findAllBySeriesId(id);
    return this._serializeMine(series, stories);
  }

  @Patch('users/me/series/:id/reorder')
  @ApiCookieAuth('session')
  @UseGuards(SessionAuthGuard)
  async reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderSeriesDto,
    @Req() req: Request
  ) {
    const series = await this.seriesService.findOne(id);
    this._assertOwnsSeries(series, req.session.userId!);
    const stories = await this.storiesService.reorderSeries(id, dto.storyIds);
    return this._serializeMine(series, stories);
  }

  // Public: a series' own page, its approved stories in narrative order.
  @Get('series/:slug')
  @Throttle(PUBLIC_READ_THROTTLE)
  async findOne(@Param('slug') slug: string) {
    const series = await this.seriesService.findOneBySlug(slug);
    const stories = await this.storiesService.findApprovedBySeriesId(series.id);

    return {
      ...this._serializeSeries(series),
      stories: stories.map((story) =>
        plainToInstance(StoryPreviewResponseDto, story, {
          excludeExtraneousValues: true,
        })
      ),
    };
  }
}
