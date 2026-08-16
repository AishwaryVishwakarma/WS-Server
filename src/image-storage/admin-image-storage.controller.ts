import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {ApiCookieAuth, ApiTags} from '@nestjs/swagger';
import type {Request} from 'express';
import {Roles} from 'src/common/decorators/roles.decorators';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {RolesGuard} from 'src/common/gaurds/roles.gaurd';
import {Role} from 'src/users/enums/role';
import {ImageStorageMaintenanceService} from './image-storage-maintenance.service';

@ApiTags('admin-image-storage')
@ApiCookieAuth('session')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('admin/image-storage')
export class AdminImageStorageController {
  constructor(private readonly maintenance: ImageStorageMaintenanceService) {}

  @Get()
  snapshot() {
    return this.maintenance.snapshot();
  }

  @Post('purge')
  purge(@Req() request: Request) {
    return this.maintenance.enqueuePurge(request.session.userId!);
  }

  @Get('purge/:jobId')
  async purgeStatus(@Param('jobId') jobId: string) {
    const status = await this.maintenance.jobStatus(jobId);
    if (!status) throw new NotFoundException('Purge job not found');
    return status;
  }
}
