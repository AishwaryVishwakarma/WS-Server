import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {plainToInstance} from 'class-transformer';
import {CommentsService} from '../comments.service';
import {Comment} from '../entities/comment.entity';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {RolesGuard} from 'src/common/gaurds/roles.gaurd';
import {Roles} from 'src/common/decorators/roles.decorators';
import {Role} from 'src/users/enums/role';
import {AdminCommentQueryDto} from '../dto/admin-comment-query.dto';
import {AdminCommentResponseDto} from '../dto/comment-response.dto';

@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('admin/comments')
export class AdminCommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  private _serialize(comment: Comment) {
    return plainToInstance(AdminCommentResponseDto, comment, {
      excludeExtraneousValues: true,
    });
  }

  // ?flagged=true is the moderation queue (reported comments, most-reported
  // first); without it, the full list for looking up a specific comment.
  @Get()
  async findAll(@Query() query: AdminCommentQueryDto) {
    const result = await this.commentsService.findAll(
      query.page,
      query.limit,
      query.search,
      query.flagged
    );

    return {
      ...result,
      data: result.data.map((comment) => this._serialize(comment)),
    };
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const comment = await this.commentsService.findOne(id);
    return this._serialize(comment);
  }

  // Dismiss the reports on a comment (keep the comment, clear it from the
  // queue). To remove an abusive comment, DELETE /comments/:id instead.
  @Patch(':id/resolve')
  async resolve(@Param('id', ParseUUIDPipe) id: string) {
    const comment = await this.commentsService.resolve(id);
    return this._serialize(comment);
  }
}
