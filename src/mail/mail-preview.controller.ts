import {Controller, Get, Param, UseGuards} from '@nestjs/common';
import {ApiCookieAuth} from '@nestjs/swagger';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {RolesGuard} from 'src/common/gaurds/roles.gaurd';
import {Roles} from 'src/common/decorators/roles.decorators';
import {Role} from 'src/users/enums/role';
import {MailPreviewService} from './mail-preview.service';
import type {MailPreviewSummary} from './mail-preview.types';

// Renders every outgoing email template on demand, through the exact
// builder functions production code calls — there is no snapshot to
// regenerate, so a source edit shows up on the next request.
@ApiCookieAuth('session')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('admin/mail-previews')
export class MailPreviewController {
  constructor(private readonly mailPreviewService: MailPreviewService) {}

  @Get()
  list(): MailPreviewSummary[] {
    return this.mailPreviewService.list();
  }

  @Get(':name')
  get(@Param('name') name: string): {html: string} {
    return {html: this.mailPreviewService.render(name)};
  }
}
