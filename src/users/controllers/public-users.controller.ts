import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {Throttle} from '@nestjs/throttler';
import type {Request} from 'express';
import {User} from '../entities/user.entity';
import {PUBLIC_READ_THROTTLE} from 'src/common/constants/throttle';
import {UserPreviewResponseDto} from '../dto/user-response.dto';
import {ReportUserDto} from '../dto/report-user.dto';
import {plainToInstance} from 'class-transformer';
import {PaginationDto} from 'src/common/dto/pagination.dto';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {StoriesService} from 'src/stories/stories.service';
import {StoryPreviewResponseDto} from 'src/stories/dto/story-response.dto';
import {UsersService} from '../users.service';

// Public author profiles — no session required; only approved stories are
// exposed (findAllApprovedByUserId).
@Throttle(PUBLIC_READ_THROTTLE)
@Controller('users')
export class PublicUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly storiesService: StoriesService
  ) {}

  private _serialize(user: User) {
    return plainToInstance(UserPreviewResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.usersService.findOne(id);
    return this._serialize(user);
  }

  // Flag a member's profile (name/bio/avatar) for moderation. Gated (signed-in
  // members); one report per reporter — a duplicate is rejected with 409 by
  // the unique constraint — and you can't report yourself (400).
  @Post(':id/report')
  @UseGuards(SessionAuthGuard)
  @HttpCode(204)
  async report(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() reportUserDto: ReportUserDto,
    @Req() req: Request
  ) {
    await this.usersService.report(
      id,
      req.session.userId!,
      reportUserDto.reason,
      reportUserDto.details
    );
  }

  @Get(':id/stories')
  async findUserStories(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() paginationDto: PaginationDto
  ) {
    const {data, ...rest} = await this.storiesService.findAllApprovedByUserId(
      id,
      paginationDto.page,
      paginationDto.limit
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
}
