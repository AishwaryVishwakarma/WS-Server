import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
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
  @HttpCode(204)
  async set(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetReadingProgressDto,
    @Req() req: Request
  ) {
    await this.readingProgressService.set(
      req.session.userId!,
      id,
      dto.percent,
      req.session.role
    );
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
}
