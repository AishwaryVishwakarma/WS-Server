import {
  Controller,
  forwardRef,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {Request} from 'express';
import {Throttle} from '@nestjs/throttler';
import {plainToInstance} from 'class-transformer';
import {SeriesService} from './series.service';
import type {Series} from './entities/series.entity';
import {SeriesResponseDto} from './dto/series-response.dto';
import {StoriesService} from 'src/stories/stories.service';
import {StoryPreviewResponseDto} from 'src/stories/dto/story-response.dto';
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

  // The editor's "you already have" hints — every series this author has
  // used before, regardless of the moderation status of the stories in it.
  @Get('users/me/series')
  @UseGuards(SessionAuthGuard)
  async findMine(@Req() req: Request) {
    const series = await this.seriesService.findAllByAuthor(
      req.session.userId!
    );
    return series.map((s) => this._serializeSeries(s));
  }

  // Public: a series' own page, its approved stories in narrative order.
  @Get('series/:id')
  @Throttle(PUBLIC_READ_THROTTLE)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const series = await this.seriesService.findOne(id);
    const stories = await this.storiesService.findApprovedBySeriesId(id);

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
