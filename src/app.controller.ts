import {Controller, Get, ServiceUnavailableException} from '@nestjs/common';
import {SkipThrottle} from '@nestjs/throttler';
import {DataSource} from 'typeorm';
import {AppService} from './app.service';
import {MetricsService} from './metrics/metrics.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dataSource: DataSource,
    private readonly metricsService: MetricsService
  ) {}

  // Liveness/readiness probe for load balancers and orchestrators. Exempt
  // from throttling — probes fire far more often than the global default. Checks
  // both backing stores: sessions live in Redis, so a Redis outage makes every
  // authenticated request fail even while the DB is fine — the probe must fail
  // too, or an orchestrator keeps routing traffic to a broken instance.
  @Get('health')
  @SkipThrottle()
  async health() {
    const [databaseOk, redisOk] = await Promise.all([
      this.checkDatabase(),
      this.metricsService.isRedisHealthy(),
    ]);

    if (!databaseOk || !redisOk) {
      throw new ServiceUnavailableException({
        status: 'unhealthy',
        database: databaseOk ? 'ok' : 'unreachable',
        redis: redisOk ? 'ok' : 'unreachable',
      });
    }

    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
