import {Controller, Get, ServiceUnavailableException} from '@nestjs/common';
import {SkipThrottle} from '@nestjs/throttler';
import {DataSource} from 'typeorm';
import {AppService} from './app.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dataSource: DataSource
  ) {}

  // Liveness/readiness probe for load balancers and orchestrators. Exempt
  // from throttling — probes fire far more often than the global 10/min.
  @Get('health')
  @SkipThrottle()
  async health() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        status: 'unhealthy',
        database: 'unreachable',
      });
    }

    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
