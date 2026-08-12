import type {ThrottlerStorage} from '@nestjs/throttler';
import {Injectable, type OnApplicationShutdown} from '@nestjs/common';
import {createClient, type RedisClientType} from 'redis';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

const SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blocked = hits > tonumber(ARGV[2])
local blockTtl = ttl
if blocked and tonumber(ARGV[3]) > 0 then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  blockTtl = redis.call('PTTL', KEYS[2])
elseif redis.call('EXISTS', KEYS[2]) == 1 then
  blocked = true
  blockTtl = redis.call('PTTL', KEYS[2])
end
return {hits, ttl, blocked and 1 or 0, blockTtl}
`;

/** Shared rate-limit counters so limits hold across API replicas. */
@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  private client?: RedisClientType;
  private connecting?: Promise<void>;

  private async ensureConnected(): Promise<void> {
    this.client ??= createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    if (this.client.isReady) return;
    this.connecting ??= this.client.connect().then(() => undefined);
    await this.connecting;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ): Promise<ThrottlerStorageRecord> {
    await this.ensureConnected();
    const base = `throttle:${throttlerName}:${key}`;
    const result = (await this.client!.eval(SCRIPT, {
      keys: [base, `${base}:blocked`],
      arguments: [String(ttl), String(limit), String(blockDuration)],
    })) as [number, number, number, number];

    return {
      totalHits: Number(result[0]),
      timeToExpire: Math.max(0, Math.ceil(Number(result[1]) / 1000)),
      isBlocked: Number(result[2]) === 1,
      timeToBlockExpire: Math.max(0, Math.ceil(Number(result[3]) / 1000)),
    };
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit().catch(() => undefined);
    }
  }
}
