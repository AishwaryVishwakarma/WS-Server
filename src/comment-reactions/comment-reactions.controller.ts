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
import {CommentReactionsService} from './comment-reactions.service';

// Reactions are gated (a reaction belongs to the signed-in member). The
// public surface is just the aggregate comment.reactionCount on the comment
// DTO — no per-user data. Mirrors LikesController's shape exactly.
@UseGuards(SessionAuthGuard)
@Controller()
export class CommentReactionsController {
  constructor(
    private readonly commentReactionsService: CommentReactionsService
  ) {}

  @Put('comments/:id/react')
  @HttpCode(204)
  async react(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.commentReactionsService.react(
      req.session.userId!,
      id,
      req.session.role
    );
  }

  @Delete('comments/:id/react')
  @HttpCode(204)
  async unreact(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.commentReactionsService.unreact(req.session.userId!, id);
  }

  @Get('users/me/comment-reactions/ids')
  async reactedIds(@Req() req: Request): Promise<string[]> {
    return this.commentReactionsService.reactedIds(req.session.userId!);
  }
}
