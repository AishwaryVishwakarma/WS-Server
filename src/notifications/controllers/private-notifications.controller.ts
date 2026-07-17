import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {plainToInstance} from 'class-transformer';
import type {Request} from 'express';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {SearchPaginationDto} from 'src/common/dto/search-pagination.dto';
import {NotificationResponseDto} from '../dto/notification-response.dto';
import {NotificationsService} from '../notifications.service';

@UseGuards(SessionAuthGuard)
@Controller('users/me/notifications')
export class PrivateNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

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
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request
  ) {
    await this.notificationsService.markRead(id, req.session.userId!);
  }
}
