import type {RedisClientType} from 'redis';
import {SessionRegistryService} from './session-registry.service';

describe('SessionRegistryService', () => {
  let service: SessionRegistryService;
  let redisClient: {
    sAdd: jest.Mock;
    sRem: jest.Mock;
    sMembers: jest.Mock;
    expire: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(() => {
    service = new SessionRegistryService();
    redisClient = {
      sAdd: jest.fn().mockResolvedValue(1),
      sRem: jest.fn().mockResolvedValue(1),
      sMembers: jest.fn().mockResolvedValue([]),
      expire: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(1),
    };
  });

  describe('before bindRedis is called', () => {
    it('no-ops rather than throwing', async () => {
      await expect(service.track('user-1', 'sid-1')).resolves.toBeUndefined();
      await expect(service.untrack('user-1', 'sid-1')).resolves.toBeUndefined();
      await expect(service.invalidateAll('user-1')).resolves.toBeUndefined();
    });
  });

  describe('once bound', () => {
    beforeEach(() => {
      service.bindRedis(redisClient as unknown as RedisClientType);
    });

    it('track adds the sid to the user set and refreshes its TTL', async () => {
      await service.track('user-1', 'sid-1');

      expect(redisClient.sAdd).toHaveBeenCalledWith(
        'user-sessions:user-1',
        'sid-1'
      );
      expect(redisClient.expire).toHaveBeenCalledWith(
        'user-sessions:user-1',
        24 * 60 * 60
      );
    });

    it('untrack removes just that sid from the user set', async () => {
      await service.untrack('user-1', 'sid-1');

      expect(redisClient.sRem).toHaveBeenCalledWith(
        'user-sessions:user-1',
        'sid-1'
      );
    });

    it('invalidateAll deletes every tracked session and the index itself', async () => {
      redisClient.sMembers.mockResolvedValue(['sid-1', 'sid-2']);

      await service.invalidateAll('user-1');

      expect(redisClient.del).toHaveBeenCalledWith([
        'sess:sid-1',
        'sess:sid-2',
      ]);
      expect(redisClient.del).toHaveBeenCalledWith('user-sessions:user-1');
    });

    it('invalidateAll skips the session delete when nothing is tracked', async () => {
      redisClient.sMembers.mockResolvedValue([]);

      await service.invalidateAll('user-1');

      expect(redisClient.del).toHaveBeenCalledTimes(1);
      expect(redisClient.del).toHaveBeenCalledWith('user-sessions:user-1');
    });

    it('invalidateAll still clears the index even if deleting sessions fails', async () => {
      redisClient.sMembers.mockResolvedValue(['sid-1']);
      redisClient.del.mockImplementation((key: string | string[]) =>
        Array.isArray(key)
          ? Promise.reject(new Error('redis down'))
          : Promise.resolve(1)
      );

      await expect(service.invalidateAll('user-1')).resolves.toBeUndefined();

      expect(redisClient.del).toHaveBeenCalledWith('user-sessions:user-1');
    });
  });
});
