import {Controller, Get, Query, UseGuards} from '@nestjs/common';
import {ApiCookieAuth} from '@nestjs/swagger';
import {Roles} from 'src/common/decorators/roles.decorators';
import {RolesGuard} from 'src/common/gaurds/roles.gaurd';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {Role} from 'src/users/enums/role';
import {AdminAnalyticsService} from './admin-analytics.service';
import {AnalyticsQueryDto} from './dto/analytics-query.dto';

@ApiCookieAuth('session')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get()
  getOverview(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getOverview(query.range);
  }
}
