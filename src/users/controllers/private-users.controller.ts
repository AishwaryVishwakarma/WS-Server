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
} from '@nestjs/common';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import type {Request, Response} from 'express';
import {User} from '../entities/user.entity';
import {UpdateProfileDto} from '../dto/update-profile.dto';
import {UserPrivateResponseDto} from '../dto/user-response.dto';
import {plainToInstance} from 'class-transformer';
import {SessionService} from 'src/session/session.service';
import {SearchPaginationDto} from 'src/common/dto/search-pagination.dto';
import {MyStoriesQueryDto} from 'src/stories/dto/my-stories-query.dto';
import {CommentsService} from 'src/comments/comments.service';
import {StoriesService} from 'src/stories/stories.service';
import {UsersService} from '../users.service';

@UseGuards(SessionAuthGuard)
@Controller('users/me')
export class PrivateUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionService: SessionService,
    private readonly storiesService: StoriesService,

    @Inject(forwardRef(() => CommentsService))
    private readonly commentsService: CommentsService
  ) {}

  private _serialize(user: User) {
    return plainToInstance(UserPrivateResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Get()
  async findMe(@Req() req: Request) {
    const user = await this.usersService.findOne(req.session.userId!);
    return this._serialize(user);
  }

  @Get('comments')
  async findMyComments(
    @Req() req: Request,
    @Query() query: SearchPaginationDto
  ) {
    return await this.commentsService.findAllByUserId(
      req.session.userId!,
      query.page,
      query.limit,
      query.search
    );
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

  @Patch()
  async updateMe(
    @Body() updateProfileDto: UpdateProfileDto,
    @Req() req: Request
  ) {
    const user = await this.usersService.update(
      req.session.userId!,
      updateProfileDto
    );
    return this._serialize(user as User);
  }

  @Delete()
  @HttpCode(204)
  async removeMe(@Req() req: Request, @Res({passthrough: true}) res: Response) {
    await this.usersService.remove(req.session.userId!);
    await this.sessionService.destroy(req);
    res.clearCookie('connect.sid');
  }
}
