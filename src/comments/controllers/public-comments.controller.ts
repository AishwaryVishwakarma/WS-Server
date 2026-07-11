import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  UseGuards,
  Req,
  HttpCode,
} from '@nestjs/common';
import {CommentsService} from '../comments.service';
import {CreateCommentDto} from '../dto/create-comment.dto';
import {UpdateCommentDto} from '../dto/update-comment.dto';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import type {Request} from 'express';
import {plainToInstance} from 'class-transformer';
import {Comment} from '../entities/comment.entity';
import {CommentPreviewResponseDto} from '../dto/comment-response.dto';

@UseGuards(SessionAuthGuard)
@Controller('comments')
export class PublicCommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  private _serialize(comment: Comment) {
    return plainToInstance(CommentPreviewResponseDto, comment, {
      excludeExtraneousValues: true,
    });
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body() createCommentDto: CreateCommentDto,
    @Req() req: Request
  ) {
    const comment = await this.commentsService.create(
      createCommentDto,
      req.session.userId!,
      req.session.role!
    );
    return this._serialize(comment);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCommentDto: UpdateCommentDto,
    @Req() req: Request
  ) {
    const comment = await this.commentsService.update(
      id,
      updateCommentDto,
      req.session.userId!,
      req.session.role!
    );
    return this._serialize(comment);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.commentsService.remove(
      id,
      req.session.userId!,
      req.session.role!
    );
  }
}
