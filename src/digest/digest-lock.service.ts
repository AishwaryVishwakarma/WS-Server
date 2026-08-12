import {Injectable} from '@nestjs/common';
import {randomUUID} from 'crypto';
import type {RedisClientType} from 'redis';

const LOCK_KEY = 'lock:weekly-digest';
const LOCK_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class DigestLockService {
  private client?: RedisClientType;

  bindRedis(client: RedisClientType): void {
    this.client = client;
  }

  async run<T>(work: () => Promise<T>): Promise<T | null> {
    if (!this.client) return null;
    const token = randomUUID();
    const acquired = await this.client.set(LOCK_KEY, token, {
      NX: true,
      PX: LOCK_TTL_MS,
    });
    if (!acquired) return null;

    try {
      return await work();
    } finally {
      await this.client
        .eval(
          "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
          {keys: [LOCK_KEY], arguments: [token]}
        )
        .catch(() => undefined);
    }
  }
}
