import {Controller, Post, UseGuards} from '@nestjs/common';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {RolesGuard} from 'src/common/gaurds/roles.gaurd';
import {Roles} from 'src/common/decorators/roles.decorators';
import {Role} from 'src/users/enums/role';
import {DigestService} from './digest.service';

// Manual trigger for the weekly digest (see DigestService's own @Cron) —
// lets an admin verify/force a send without waiting for Monday.
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('admin/digest')
export class DigestController {
  constructor(private readonly digestService: DigestService) {}

  @Post('send')
  async send(): Promise<{sent: number}> {
    return this.digestService.sendWeeklyDigests();
  }
}
