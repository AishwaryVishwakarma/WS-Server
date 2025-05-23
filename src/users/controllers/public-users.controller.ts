import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  UseGuards,
  Req,
  ParseUUIDPipe,
  Query,
  DefaultValuePipe,
  ParseBoolPipe,
} from '@nestjs/common';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import type {Request} from 'express';
import {UsersService} from '../users.service';
import {User} from '../entities/user.entity';
import {UpdateUserDto} from '../dto/update-user.dto';
import {
  UserWithStoryResponseDto,
  UserWithStoryPreviewResponseDto,
  UserPreviewResponseDto,
} from '../dto/user-response.dto';
import {plainToInstance, type ClassConstructor} from 'class-transformer';
import {SessionService} from 'src/session/session.service';

@UseGuards(SessionAuthGuard)
@Controller('users')
export class PublicUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionService: SessionService
  ) {}

  private _serialize(
    dto: ClassConstructor<
      | UserPreviewResponseDto
      | UserWithStoryPreviewResponseDto
      | UserWithStoryResponseDto
    >,
    user: User
  ) {
    return plainToInstance(dto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Get('me')
  async findMe(@Req() req: Request) {
    const user = await this.usersService.findMe(req.session.userId!);
    return this._serialize(UserWithStoryResponseDto, user);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('stories', new DefaultValuePipe(false), ParseBoolPipe)
    includeStories: boolean
  ) {
    const user = await this.usersService.findOne(id, includeStories);
    return this._serialize(UserWithStoryPreviewResponseDto, user);
  }

  @Patch('me')
  async updateMe(@Body() updateUserDto: UpdateUserDto, @Req() req: Request) {
    const user = await this.usersService.updateMe(
      updateUserDto,
      req.session.userId!,
      req.session.isAdmin!
    );
    return this._serialize(UserPreviewResponseDto, user as User);
  }

  @Delete('me')
  @HttpCode(204)
  async removeMe(@Req() req: Request) {
    await this.usersService.removeMe(req.session.userId!);
    return this.sessionService.destroy(req);
  }
}
