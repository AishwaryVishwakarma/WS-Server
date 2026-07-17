import {Injectable, Logger} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import type {Repository} from 'typeorm';
import {DataSource} from 'typeorm';
import type {RedisClientType} from 'redis';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';
import {Story} from 'src/stories/entities/story.entity';
import {StoryStatus} from 'src/stories/enums/story-status.enum';
import {Comment} from 'src/comments/entities/comment.entity';

// Owns a private prom-client Registry (not the global default one) so that
// spinning up multiple app instances in a single test process never triggers
// duplicate-metric registration errors. Everything the /metrics endpoint
// exposes is registered here.
@Injectable()
export class MetricsService {
  private readonly logger = new Logger('Metrics', {timestamp: true});
  readonly registry = new Registry();

  // Redis is created in app.setup (outside the Nest graph, shared with the
  // session store), so it is handed to us there via bindRedis().
  private redisClient?: RedisClientType;

  // --- HTTP (recorded by the metrics middleware) ---
  private readonly httpRequests = new Counter({
    name: 'ws_http_requests_total',
    help: 'Total HTTP requests, by method, matched route template and status.',
    labelNames: ['method', 'route', 'status'],
    registers: [this.registry],
  });
  private readonly httpDuration = new Histogram({
    name: 'ws_http_request_duration_seconds',
    help: 'HTTP request duration in seconds.',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });
  private readonly httpInFlight = new Gauge({
    name: 'ws_http_requests_in_flight',
    help: 'HTTP requests currently being served.',
    registers: [this.registry],
  });

  // --- Domain gauges (recomputed on scrape; see refreshOnScrape) ---
  private readonly storiesByStatus = new Gauge({
    name: 'ws_stories_by_status',
    help: 'Number of stories in each moderation status.',
    labelNames: ['status'],
    registers: [this.registry],
  });
  private readonly flaggedComments = new Gauge({
    name: 'ws_flagged_comments',
    help: 'Number of comments currently flagged for moderation.',
    registers: [this.registry],
  });

  // --- Dependency health (recomputed on scrape) ---
  private readonly dbUp = new Gauge({
    name: 'ws_db_up',
    help: 'Whether the database answered a probe query (1) or not (0).',
    registers: [this.registry],
  });
  private readonly redisUp = new Gauge({
    name: 'ws_redis_up',
    help: 'Whether Redis answered a PING (1) or not (0).',
    registers: [this.registry],
  });
  private readonly dbPool = new Gauge({
    name: 'ws_db_pool_connections',
    help: 'MySQL driver pool connections, by state (best-effort).',
    labelNames: ['state'],
    registers: [this.registry],
  });

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Story)
    private readonly storiesRepository: Repository<Story>,
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>
  ) {
    // Node process/runtime metrics (memory, CPU, event-loop lag, GC, ...).
    collectDefaultMetrics({register: this.registry});
  }

  bindRedis(client: RedisClientType) {
    this.redisClient = client;
  }

  incInFlight() {
    this.httpInFlight.inc();
  }

  observeHttp(
    method: string,
    route: string,
    status: number,
    durationSeconds: number
  ) {
    const labels = {method, route, status: String(status)};
    this.httpRequests.inc(labels);
    this.httpDuration.observe(labels, durationSeconds);
    this.httpInFlight.dec();
  }

  // Render the exposition text, refreshing point-in-time gauges first so the
  // scrape reflects the moment it was taken.
  async render(): Promise<string> {
    await this.refreshOnScrape();
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  private async refreshOnScrape() {
    await Promise.all([
      this.refreshModeration(),
      this.refreshDbHealth(),
      this.refreshRedisHealth(),
    ]);
  }

  private async refreshModeration() {
    try {
      const rows = await this.storiesRepository
        .createQueryBuilder('story')
        .select('story.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('story.status')
        .getRawMany<{status: StoryStatus; count: string}>();

      // Zero every known status first so a status that drops to 0 is reported
      // as 0 rather than going stale at its last non-zero value.
      for (const status of Object.values(StoryStatus)) {
        this.storiesByStatus.set({status}, 0);
      }
      for (const {status, count} of rows) {
        this.storiesByStatus.set({status}, Number(count));
      }

      this.flaggedComments.set(
        await this.commentsRepository.countBy({isFlagged: true})
      );
    } catch (error) {
      // A metrics scrape must never take the endpoint down; log and move on.
      this.logger.warn(`Failed to refresh moderation gauges: ${String(error)}`);
    }
  }

  private async refreshDbHealth() {
    try {
      await this.dataSource.query('SELECT 1');
      this.dbUp.set(1);
    } catch {
      this.dbUp.set(0);
    }

    // Best-effort pool stats from the mysql2 driver — guarded because it reads
    // library internals that are not part of TypeORM's public API.
    try {
      const pool = (this.dataSource.driver as {pool?: unknown}).pool as
        | {
            _allConnections?: {length: number};
            _freeConnections?: {length: number};
          }
        | undefined;
      if (pool?._allConnections && pool._freeConnections) {
        this.dbPool.set({state: 'total'}, pool._allConnections.length);
        this.dbPool.set({state: 'free'}, pool._freeConnections.length);
      }
    } catch {
      // Pool shape changed — drop the gauge rather than fail the scrape.
    }
  }

  private async refreshRedisHealth() {
    this.redisUp.set((await this.isRedisHealthy()) ? 1 : 0);
  }

  // Liveness check for the /health probe — shares the session Redis client
  // bound in app.setup. False if Redis is unbound or unreachable.
  async isRedisHealthy(): Promise<boolean> {
    if (!this.redisClient) return false;
    try {
      await this.redisClient.ping();
      return true;
    } catch {
      return false;
    }
  }
}
