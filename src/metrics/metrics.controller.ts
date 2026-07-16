import {Controller, Get, Header, Res, UseGuards} from '@nestjs/common';
import {SkipThrottle} from '@nestjs/throttler';
import type {Response} from 'express';
import {MetricsService} from './metrics.service';
import {MetricsTokenGuard} from './metrics-token.guard';

// Prometheus scrape target. Bearer-token protected and throttle-exempt (a
// scraper polls far more often than the global limit, like the health probe).
@Controller('metrics')
@UseGuards(MetricsTokenGuard)
@SkipThrottle()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async scrape(@Res() res: Response) {
    res.setHeader('Content-Type', this.metricsService.contentType);
    res.send(await this.metricsService.render());
  }
}
