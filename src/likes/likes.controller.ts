import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {Request} from 'express';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {LikesService} from './likes.service';

// Likes are gated (a like belongs to the signed-in member). The public surface
// is just the aggregate story.likeCount on the story DTO — no per-user data.
@UseGuards(SessionAuthGuard)
@Controller()
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  @Put('stories/:id/like')
  @HttpCode(204)
  async like(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.likesService.like(req.session.userId!, id, req.session.role);
  }

  @Delete('stories/:id/like')
  @HttpCode(204)
  async unlike(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.likesService.unlike(req.session.userId!, id);
  }

  @Get('users/me/likes/ids')
  async likedIds(@Req() req: Request): Promise<string[]> {
    return this.likesService.likedIds(req.session.userId!);
  }
}
