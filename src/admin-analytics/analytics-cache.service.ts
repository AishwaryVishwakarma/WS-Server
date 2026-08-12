import {Injectable, Logger, OnModuleDestroy} from '@nestjs/common';
import {createClient, type RedisClientType} from 'redis';

const PREFIX = 'admin-analytics:v2:';

@Injectable()
export class AnalyticsCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsCacheService.name);
  private client?: RedisClientType;
  private connecting?: Promise<void>;

  private async ready(): Promise<RedisClientType> {
    if (!this.client) {
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      });
      this.client.on('error', (error: unknown) =>
        this.logger.warn(
          `Redis analytics cache error: ${error instanceof Error ? error.message : 'unknown error'}`
        )
      );
    }
    if (!this.client.isOpen && !this.connecting) {
      this.connecting = this.client
        .connect()
        .then(() => undefined)
        .finally(() => {
          this.connecting = undefined;
        });
    }
    if (this.connecting) await this.connecting;
    return this.client;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await (await this.ready()).get(`${PREFIX}${key}`);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
    try {
      await (
        await this.ready()
      ).set(`${PREFIX}${key}`, JSON.stringify(value), {EX: ttlSeconds});
    } catch {
      // Cache failure deliberately degrades to database reads.
    }
  }

  async invalidate(): Promise<void> {
    try {
      const client = await this.ready();
      for await (const keys of client.scanIterator({
        MATCH: `${PREFIX}*`,
        COUNT: 100,
      })) {
        if (keys.length) await client.del(keys);
      }
    } catch {
      // Event writes remain successful when invalidation is unavailable.
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) await this.client.quit();
  }
}
