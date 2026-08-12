import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Query,
  UseGuards,
} from '@nestjs/common';
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
    return this.analytics.getOverview(this.resolveRange(query));
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="whispering-shadows-analytics.csv"'
  )
  async exportCsv(@Query() query: AnalyticsQueryDto) {
    return this.analytics.toCsv(
      await this.analytics.getOverview(this.resolveRange(query))
    );
  }

  private resolveRange(query: AnalyticsQueryDto) {
    const filters = {
      status: query.status,
      authorId: query.authorId,
      tag: query.tag,
    };
    if (!query.start && !query.end) return {days: query.range, ...filters};
    if (!query.start || !query.end)
      throw new BadRequestException('Both start and end are required');
    const start = new Date(`${query.start}T00:00:00.000Z`);
    const end = new Date(`${query.end}T00:00:00.000Z`);
    const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (days < 1 || days > 365)
      throw new BadRequestException(
        'Date range must be between 1 and 365 days'
      );
    return {days, start, end, ...filters};
  }
}
