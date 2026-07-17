import {ServiceUnavailableException} from '@nestjs/common';
import {AppController} from './app.controller';
import {AppService} from './app.service';
import type {DataSource} from 'typeorm';
import type {MetricsService} from './metrics/metrics.service';

// The /health probe must fail if *either* backing store is down — sessions live
// in Redis, so a Redis outage breaks authenticated traffic even with a live DB.
describe('AppController health', () => {
  const makeController = (opts: {dbOk: boolean; redisOk: boolean}) => {
    const dataSource = {
      query: opts.dbOk
        ? jest.fn().mockResolvedValue([{'1': 1}])
        : jest.fn().mockRejectedValue(new Error('db down')),
    } as unknown as DataSource;
    const metricsService = {
      isRedisHealthy: jest.fn().mockResolvedValue(opts.redisOk),
    } as unknown as MetricsService;
    return new AppController(new AppService(), dataSource, metricsService);
  };

  it('reports ok when both the database and Redis are live', async () => {
    const result = await makeController({dbOk: true, redisOk: true}).health();
    expect(result.status).toBe('ok');
    expect(typeof result.uptime).toBe('number');
  });

  it('503s when the database is unreachable', async () => {
    await expect(
      makeController({dbOk: false, redisOk: true}).health()
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('503s when Redis is unreachable, even with a live database', async () => {
    const controller = makeController({dbOk: true, redisOk: false});
    await expect(controller.health()).rejects.toMatchObject({
      response: {status: 'unhealthy', database: 'ok', redis: 'unreachable'},
    });
  });
});
