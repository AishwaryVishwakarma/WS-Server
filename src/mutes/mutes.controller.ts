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
import {UserPreviewResponseDto} from 'src/users/dto/user-response.dto';
import type {User} from 'src/users/entities/user.entity';
import {MutesService} from './mutes.service';

// Muting is entirely private — every route here is gated, and there is no
// public counterpart (unlike Follows' public follower/following counts):
// nobody but the muter should ever be able to tell an author has been muted.
@Controller()
export class MutesController {
  constructor(private readonly mutesService: MutesService) {}

  @Put('users/:id/mute')
  @UseGuards(SessionAuthGuard)
  @HttpCode(204)
  async mute(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.mutesService.mute(req.session.userId!, id);
  }

  @Delete('users/:id/mute')
  @UseGuards(SessionAuthGuard)
  @HttpCode(204)
  async unmute(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.mutesService.unmute(req.session.userId!, id);
  }

  @Get('users/me/muted/ids')
  @UseGuards(SessionAuthGuard)
  async mutedIds(@Req() req: Request): Promise<string[]> {
    return this.mutesService.mutedAuthorIds(req.session.userId!);
  }

  @Get('users/me/muted')
  @UseGuards(SessionAuthGuard)
  async muted(@Req() req: Request, @Query() query: PaginationDto) {
    const {data, ...rest} = await this.mutesService.findMuted(
      req.session.userId!,
      query.page,
      query.limit
    );
    return {...rest, data: this._serializeUsers(data)};
  }

  private _serializeUsers(users: User[]) {
    return users.map((user) =>
      plainToInstance(UserPreviewResponseDto, user, {
        excludeExtraneousValues: true,
      })
    );
  }
}
