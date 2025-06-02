import {
  Controller,
  Get,
  Body,
  Patch,
  Delete,
  HttpCode,
  UseGuards,
  Req,
  Query,
  Inject,
  forwardRef,
} from '@nestjs/common';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import type {Request} from 'express';
import {User} from '../entities/user.entity';
import {UpdateUserDto} from '../dto/update-user.dto';
import {UserPrivateResponseDto} from '../dto/user-response.dto';
import {plainToInstance} from 'class-transformer';
import {SessionService} from 'src/session/session.service';
import type {PaginationDto} from 'src/common/dto/pagination.dto';
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
    @Query() paginationDto: PaginationDto
  ) {
    const comments = await this.commentsService.findAllByUserId(
      req.session.userId!,
      paginationDto.page,
      paginationDto.limit
    );

    return comments;
  }

  @Get('stories')
  async findMyStories(
    @Req() req: Request,
    @Query() paginationDto: PaginationDto
  ) {
    return await this.storiesService.findAllByUserId(
      req.session.userId!,
      paginationDto.page,
      paginationDto.limit
    );
  }

  @Patch()
  async updateMe(@Body() updateUserDto: UpdateUserDto, @Req() req: Request) {
    const user = await this.usersService.update(
      req.session.userId!,
      updateUserDto
    );
    return this._serialize(user as User);
  }

  @Delete()
  @HttpCode(204)
  async removeMe(@Req() req: Request) {
    await this.usersService.remove(req.session.userId!);
    return this.sessionService.destroy(req);
  }
}
