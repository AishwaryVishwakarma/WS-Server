import {
  Controller,
  Get,
  Body,
  Patch,
  Delete,
  HttpCode,
  UseGuards,
  Req,
  Res,
  Query,
  Inject,
  forwardRef,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {ApiCookieAuth, ApiOkResponse} from '@nestjs/swagger';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import type {Request, Response} from 'express';
import {User} from '../entities/user.entity';
import {UpdateProfileDto} from '../dto/update-profile.dto';
import {UserPrivateResponseDto} from '../dto/user-response.dto';
import {plainToInstance} from 'class-transformer';
import {SessionService} from 'src/session/session.service';
import {SearchPaginationDto} from 'src/common/dto/search-pagination.dto';
import {MyStoriesQueryDto} from 'src/stories/dto/my-stories-query.dto';
import {StoryStatsQueryDto} from 'src/stories/dto/story-stats-query.dto';
import {CommentsService} from 'src/comments/comments.service';
import {MyCommentActivityResponseDto} from 'src/comments/dto/comment-response.dto';
import {StoriesService} from 'src/stories/stories.service';
import {UsersService} from '../users.service';
import {ChangePasswordDto} from '../dto/change-password.dto';
import {SessionRegistryService} from 'src/session/session-registry.service';
import {SessionResponseDto} from 'src/session/dto/session-response.dto';
import {FileInterceptor} from '@nestjs/platform-express';
import {
  MAX_IMAGE_BYTES,
  type UploadedImage,
} from 'src/image-storage/image-storage.service';

@ApiCookieAuth('session')
@UseGuards(SessionAuthGuard)
@Controller('users/me')
export class PrivateUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionService: SessionService,
    private readonly sessionRegistryService: SessionRegistryService,
    private readonly storiesService: StoriesService,

    @Inject(forwardRef(() => CommentsService))
    private readonly commentsService: CommentsService
  ) {}

  private async _serialize(user: User) {
    return plainToInstance(
      UserPrivateResponseDto,
      {
        ...user,
        hasPassword: await this.usersService.hasPassword(user.id),
      },
      {
        excludeExtraneousValues: true,
      }
    );
  }

  @Get()
  async findMe(@Req() req: Request) {
    const user = await this.usersService.findOne(req.session.userId!);
    return await this._serialize(user);
  }

  @Get('comments')
  async findMyComments(
    @Req() req: Request,
    @Query() query: SearchPaginationDto
  ) {
    const {data, ...rest} = await this.commentsService.findAllByUserId(
      req.session.userId!,
      query.page,
      query.limit,
      query.search
    );

    return {
      ...rest,
      data: data.map((comment) =>
        plainToInstance(MyCommentActivityResponseDto, comment, {
          excludeExtraneousValues: true,
        })
      ),
    };
  }

  @Get('stats')
  async myStats(@Req() req: Request) {
    return this.usersService.computeAuthorStats(req.session.userId!);
  }

  @Get('achievements')
  async myAchievements(@Req() req: Request) {
    return this.usersService.computeAchievements(req.session.userId!);
  }

  @Get('stats/stories')
  async myStoryBreakdown(@Req() req: Request) {
    return this.storiesService.getAuthorStoryBreakdown(req.session.userId!);
  }

  @Get('sessions')
  @ApiOkResponse({type: SessionResponseDto, isArray: true})
  async sessions(@Req() req: Request) {
    return this.sessionRegistryService.list(req.session.userId!, req.sessionID);
  }

  @Delete('sessions')
  @HttpCode(204)
  async revokeOtherSessions(@Req() req: Request) {
    await this.sessionRegistryService.invalidateOthers(
      req.session.userId!,
      req.sessionID
    );
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(@Param('id') id: string, @Req() req: Request) {
    if (
      !(await this.sessionRegistryService.invalidate(
        req.session.userId!,
        id,
        req.sessionID
      ))
    ) {
      throw new NotFoundException('Session not found');
    }
  }

  @Get('stories')
  async findMyStories(@Req() req: Request, @Query() query: MyStoriesQueryDto) {
    return await this.storiesService.findAllByUserId(
      req.session.userId!,
      query.page,
      query.limit,
      query.search,
      query.status
    );
  }

  @Get('stories/:id/stats')
  async myStoryDailyStats(
    @Param('id') id: string,
    @Req() req: Request,
    @Query() query: StoryStatsQueryDto
  ) {
    return this.storiesService.getStoryDailyStats(
      id,
      req.session.userId!,
      query.days
    );
  }

  @Patch()
  async updateMe(
    @Body() updateProfileDto: UpdateProfileDto,
    @Req() req: Request
  ) {
    const user = await this.usersService.update(
      req.session.userId!,
      updateProfileDto
    );
    return await this._serialize(user as User);
  }

  @Post('profile-image')
  @UseInterceptors(
    FileInterceptor('file', {limits: {fileSize: MAX_IMAGE_BYTES}})
  )
  async uploadProfileImage(
    @UploadedFile() file: UploadedImage,
    @Req() req: Request
  ) {
    const user = await this.usersService.replaceProfileImage(
      req.session.userId!,
      file
    );
    return this._serialize(user);
  }

  @Delete('profile-image')
  async deleteProfileImage(@Req() req: Request) {
    const user = await this.usersService.removeProfileImage(
      req.session.userId!
    );
    return this._serialize(user);
  }

  @Patch('password')
  @HttpCode(204)
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @Req() req: Request
  ) {
    await this.usersService.changePassword(
      req.session.userId!,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword
    );
    await this.sessionRegistryService.invalidateOthers(
      req.session.userId!,
      req.sessionID
    );
  }

  @Delete()
  @HttpCode(204)
  async removeMe(@Req() req: Request, @Res({passthrough: true}) res: Response) {
    // Self-deletion releases the account's identifiers (email/googleId) so the
    // same person can register/sign in fresh afterwards — unlike admin
    // removal (`remove`), which keeps them locked to block re-registration.
    await this.usersService.deactivateSelf(req.session.userId!);
    await this.sessionService.destroy(req);
    res.clearCookie('connect.sid');
  }
}
