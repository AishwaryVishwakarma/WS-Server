import {Controller, Post, UseGuards} from '@nestjs/common';
import {ApiCookieAuth} from '@nestjs/swagger';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {RolesGuard} from 'src/common/gaurds/roles.gaurd';
import {Roles} from 'src/common/decorators/roles.decorators';
import {Role} from 'src/users/enums/role';
import {WinbackService} from './winback.service';

// Manual trigger for the daily win-back sweep (see WinbackService's own
// @Cron) — lets an admin verify/force a send without waiting for the cron.
@ApiCookieAuth('session')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('admin/winback')
export class WinbackController {
  constructor(private readonly winbackService: WinbackService) {}

  @Post('send')
  async send(): Promise<{sent: number}> {
    return this.winbackService.sendWinbackEmails();
  }
}
