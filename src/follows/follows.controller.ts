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
import {Throttle} from '@nestjs/throttler';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {PUBLIC_READ_THROTTLE} from 'src/common/constants/throttle';
import {PaginationDto} from 'src/common/dto/pagination.dto';
import {StoryPreviewResponseDto} from 'src/stories/dto/story-response.dto';
import {FollowsService} from './follows.service';

// Follow graph. Following/unfollowing, the id-set, and the personal feed are
// gated (they belong to the signed-in member); the follower/following counts
// are public (shown on every author's profile).
@Controller()
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  @Put('users/:id/follow')
  @UseGuards(SessionAuthGuard)
  @HttpCode(204)
  async follow(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.followsService.follow(req.session.userId!, id);
  }

  @Delete('users/:id/follow')
  @UseGuards(SessionAuthGuard)
  @HttpCode(204)
  async unfollow(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.followsService.unfollow(req.session.userId!, id);
  }

  @Get('users/me/following/ids')
  @UseGuards(SessionAuthGuard)
  async followingIds(@Req() req: Request): Promise<string[]> {
    return this.followsService.followingIds(req.session.userId!);
  }

  @Get('users/me/feed')
  @UseGuards(SessionAuthGuard)
  async feed(@Req() req: Request, @Query() query: PaginationDto) {
    const {data, ...rest} = await this.followsService.feed(
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

  @Get('users/:id/follow-stats')
  @Throttle(PUBLIC_READ_THROTTLE)
  async stats(@Param('id', ParseUUIDPipe) id: string) {
    return this.followsService.stats(id);
  }
}
