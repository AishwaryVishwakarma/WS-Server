import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {Request} from 'express';
import {plainToInstance} from 'class-transformer';
import {ApiCookieAuth} from '@nestjs/swagger';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {StoryPreviewResponseDto} from 'src/stories/dto/story-response.dto';
import {SetReadingProgressDto} from './dto/set-reading-progress.dto';
import {ReadingProgressService} from './reading-progress.service';
import {UpdateReadingGoalDto} from './dto/update-reading-goal.dto';

// Reading progress — all gated (it belongs to the signed-in member). The
// write lives on the story (`/stories/:id/reading-progress`); the list lives
// under `/users/me`, matching BookmarksController's shape.
@ApiCookieAuth('session')
@UseGuards(SessionAuthGuard)
@Controller()
export class ReadingProgressController {
  constructor(
    private readonly readingProgressService: ReadingProgressService
  ) {}

  @Put('stories/:id/reading-progress')
  async set(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetReadingProgressDto,
    @Req() req: Request
  ) {
    return this.readingProgressService.set(
      req.session.userId!,
      id,
      dto.percent,
      req.session.role
    );
  }

  @Delete('stories/:id/reading-progress')
  @HttpCode(204)
  async clear(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.readingProgressService.clear(req.session.userId!, id);
  }

  @Get('users/me/reading-progress')
  async list(@Req() req: Request) {
    const rows = await this.readingProgressService.listForUser(
      req.session.userId!
    );

    return rows.map(({story, percent, updatedAt}) => ({
      story: plainToInstance(StoryPreviewResponseDto, story, {
        excludeExtraneousValues: true,
      }),
      percent,
      updatedAt,
    }));
  }

  @Get('users/me/reading-history')
  async history(@Req() req: Request) {
    const rows = await this.readingProgressService.historyForUser(
      req.session.userId!
    );

    return rows.map(({story, updatedAt}) => ({
      story: plainToInstance(StoryPreviewResponseDto, story, {
        excludeExtraneousValues: true,
      }),
      completedAt: updatedAt,
    }));
  }

  @Get('users/me/reading-goal')
  async weeklyGoal(@Req() req: Request) {
    return this.readingProgressService.weeklyGoal(req.session.userId!);
  }

  @Patch('users/me/reading-goal')
  async updateWeeklyGoal(
    @Body() dto: UpdateReadingGoalDto,
    @Req() req: Request
  ) {
    return this.readingProgressService.updateWeeklyGoal(
      req.session.userId!,
      dto.goal
    );
  }

  @Get('users/me/seasonal-event')
  async seasonalEvent(@Req() req: Request) {
    return this.readingProgressService.seasonalEvent(req.session.userId!);
  }

  @Get('users/me/seasonal-events/completed')
  completedSeasonalEvents(@Req() req: Request) {
    return this.readingProgressService.completedSeasonalEvents(
      req.session.userId!
    );
  }
}
