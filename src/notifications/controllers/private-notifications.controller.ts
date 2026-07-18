import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  type MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {plainToInstance} from 'class-transformer';
import type {Request} from 'express';
import {Observable} from 'rxjs';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {SearchPaginationDto} from 'src/common/dto/search-pagination.dto';
import {NotificationResponseDto} from '../dto/notification-response.dto';
import {NotificationsService} from '../notifications.service';
import {NotificationsStream} from '../notifications-stream.service';

@UseGuards(SessionAuthGuard)
@Controller('users/me/notifications')
export class PrivateNotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationsStream: NotificationsStream
  ) {}

  // Live push: the client opens an EventSource here and refetches on each event
  // (a fallback poll still runs in case the stream drops). X-Accel-Buffering
  // disables proxy buffering so events aren't held back.
  @Sse('stream')
  @Header('X-Accel-Buffering', 'no')
  @Header('Cache-Control', 'no-cache, no-transform')
  stream(@Req() req: Request): Observable<MessageEvent> {
    return this.notificationsStream.streamFor(req.session.userId!);
  }

  @Get()
  async findAll(@Req() req: Request, @Query() query: SearchPaginationDto) {
    const result = await this.notificationsService.findAllForUser(
      req.session.userId!,
      query.page,
      query.limit
    );

    return {
      ...result,
      data: result.data.map((notification) =>
        plainToInstance(NotificationResponseDto, notification, {
          excludeExtraneousValues: true,
        })
      ),
    };
  }

  @Get('unread-count')
  async unreadCount(@Req() req: Request) {
    const count = await this.notificationsService.unreadCount(
      req.session.userId!
    );
    return {count};
  }

  @Patch('read')
  @HttpCode(204)
  async markAllRead(@Req() req: Request) {
    await this.notificationsService.markAllRead(req.session.userId!);
  }

  @Patch(':id/read')
  @HttpCode(204)
  async markRead(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.notificationsService.markRead(id, req.session.userId!);
  }

  // Declared before ':id' so the literal 'read' segment wins the route match.
  @Delete('read')
  @HttpCode(204)
  async clearRead(@Req() req: Request) {
    await this.notificationsService.clearRead(req.session.userId!);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.notificationsService.remove(id, req.session.userId!);
  }
}
