import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {Request} from 'express';
import {plainToInstance} from 'class-transformer';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {PaginationDto} from 'src/common/dto/pagination.dto';
import {StoryPreviewResponseDto} from 'src/stories/dto/story-response.dto';
import {BookmarksService} from './bookmarks.service';

// Reading list — all gated (a bookmark belongs to the signed-in member). The
// toggle lives on the story (`/stories/:id/bookmark`); the list and the id set
// live under `/users/me`, matching PrivateUsersController's shelf routes.
@UseGuards(SessionAuthGuard)
@Controller()
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  @Put('stories/:id/bookmark')
  @HttpCode(204)
  async add(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.bookmarksService.add(req.session.userId!, id, req.session.role);
  }

  @Delete('stories/:id/bookmark')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.bookmarksService.remove(req.session.userId!, id);
  }

  @Get('users/me/bookmarks')
  async list(@Req() req: Request, @Query() query: PaginationDto) {
    const {data, ...rest} = await this.bookmarksService.listForUser(
      req.session.userId!,
      query.page,
      query.limit
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

  @Get('users/me/bookmarks/ids')
  async ids(@Req() req: Request): Promise<string[]> {
    return this.bookmarksService.bookmarkedIds(req.session.userId!);
  }
}
