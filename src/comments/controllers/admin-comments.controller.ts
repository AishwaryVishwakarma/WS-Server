import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {CommentsService} from '../comments.service';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {RolesGuard} from 'src/common/gaurds/roles.gaurd';
import {Roles} from 'src/common/decorators/roles.decorators';
import {Role} from 'src/users/enums/role';
import {AdminCommentQueryDto} from '../dto/admin-comment-query.dto';

@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('admin/comments')
export class AdminCommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  // ?flagged=true is the moderation queue (reported comments, most-reported
  // first); without it, the full list for looking up a specific comment.
  @Get()
  findAll(@Query() query: AdminCommentQueryDto) {
    return this.commentsService.findAll(
      query.page,
      query.limit,
      query.search,
      query.flagged
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.commentsService.findOne(id);
  }

  // Dismiss the reports on a comment (keep the comment, clear it from the
  // queue). To remove an abusive comment, DELETE /comments/:id instead.
  @Patch(':id/resolve')
  resolve(@Param('id', ParseUUIDPipe) id: string) {
    return this.commentsService.resolve(id);
  }
}
