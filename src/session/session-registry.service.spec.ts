import type {RedisClientType} from 'redis';
import {SessionRegistryService} from './session-registry.service';

describe('SessionRegistryService', () => {
  let service: SessionRegistryService;
  let redisClient: {
    sAdd: jest.Mock;
    sRem: jest.Mock;
    sMembers: jest.Mock;
    expire: jest.Mock;
    ttl: jest.Mock;
    del: jest.Mock;
    mGet: jest.Mock;
  };

  beforeEach(() => {
    service = new SessionRegistryService();
    redisClient = {
      sAdd: jest.fn().mockResolvedValue(1),
      sRem: jest.fn().mockResolvedValue(1),
      sMembers: jest.fn().mockResolvedValue([]),
      expire: jest.fn().mockResolvedValue(true),
      ttl: jest.fn().mockResolvedValue(-2), // key doesn't exist yet, by default
      del: jest.fn().mockResolvedValue(1),
      mGet: jest.fn().mockResolvedValue([]),
    };
  });

  describe('before bindRedis is called', () => {
    it('no-ops rather than throwing', async () => {
      await expect(service.track('user-1', 'sid-1')).resolves.toBeUndefined();
      await expect(service.untrack('user-1', 'sid-1')).resolves.toBeUndefined();
      await expect(service.invalidateAll('user-1')).resolves.toBeUndefined();
      await expect(
        service.invalidateOthers('user-1', 'sid-1')
      ).resolves.toBeUndefined();
      await expect(service.list('user-1', 'sid-1')).resolves.toEqual([]);
      await expect(
        service.invalidate('user-1', 'public-id', 'sid-1')
      ).resolves.toBe(false);
    });
  });

  describe('once bound', () => {
    beforeEach(() => {
      service.bindRedis(redisClient as unknown as RedisClientType);
    });

    it('track adds the sid to the user set and sets its TTL when unset', async () => {
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

    it('track uses a custom maxAge (e.g. a remember-me session)', async () => {
      const thirtyDaysMs = 1000 * 60 * 60 * 24 * 30;

      await service.track('user-1', 'sid-1', thirtyDaysMs);

      expect(redisClient.expire).toHaveBeenCalledWith(
        'user-sessions:user-1',
        30 * 24 * 60 * 60
      );
    });

    it('track raises the index TTL when a longer session is tracked', async () => {
      redisClient.ttl.mockResolvedValue(60 * 60); // 1 hour left

      await service.track('user-1', 'sid-1', 1000 * 60 * 60 * 24); // 1 day

      expect(redisClient.expire).toHaveBeenCalledWith(
        'user-sessions:user-1',
        24 * 60 * 60
      );
    });

    it('track never shrinks the index TTL below an existing longer-lived entry', async () => {
      redisClient.ttl.mockResolvedValue(30 * 24 * 60 * 60); // a remembered session

      await service.track('user-1', 'sid-2', 1000 * 60 * 60 * 24); // plain login, 1 day

      expect(redisClient.expire).not.toHaveBeenCalled();
    });

    it('untrack removes just that sid from the user set', async () => {
      await service.untrack('user-1', 'sid-1');

      expect(redisClient.sRem).toHaveBeenCalledWith(
        'user-sessions:user-1',
        'sid-1'
      );
    });

    it('lists active sessions without exposing their Redis ids', async () => {
      redisClient.sMembers.mockResolvedValue(['sid-current', 'sid-other']);
      redisClient.mGet.mockResolvedValue([
        JSON.stringify({
          cookie: {expires: '2026-08-13T00:00:00.000Z'},
          metadata: {
            device: 'Computer',
            browser: 'Chrome',
            location: 'Mumbai, IN',
            createdAt: '2026-08-12T00:00:00.000Z',
          },
        }),
        JSON.stringify({
          cookie: {expires: '2026-08-14T00:00:00.000Z'},
        }),
      ]);

      const sessions = await service.list('user-1', 'sid-current');

      expect(sessions).toHaveLength(2);
      expect(sessions[0]).toMatchObject({
        device: 'Computer',
        browser: 'Chrome',
        location: 'Mumbai, IN',
        current: true,
      });
      expect(sessions[0].id).not.toContain('sid-current');
      expect(sessions[1]).toMatchObject({
        device: 'Unknown device',
        current: false,
      });
    });

    it('cleans stale session ids while listing', async () => {
      redisClient.sMembers.mockResolvedValue(['sid-stale']);
      redisClient.mGet.mockResolvedValue([null]);

      await expect(service.list('user-1', 'sid-current')).resolves.toEqual([]);
      expect(redisClient.sRem).toHaveBeenCalledWith('user-sessions:user-1', [
        'sid-stale',
      ]);
    });

    it('revokes another owned session by its public id', async () => {
      redisClient.sMembers.mockResolvedValue(['sid-other']);
      const [session] = await (async () => {
        redisClient.mGet.mockResolvedValue([
          JSON.stringify({cookie: {expires: '2026-08-13T00:00:00.000Z'}}),
        ]);
        return service.list('user-1', 'sid-current');
      })();

      await expect(
        service.invalidate('user-1', session.id, 'sid-current')
      ).resolves.toBe(true);
      expect(redisClient.del).toHaveBeenCalledWith('sess:sid-other');
      expect(redisClient.sRem).toHaveBeenCalledWith(
        'user-sessions:user-1',
        'sid-other'
      );
    });

    it('does not revoke the current session through remote revocation', async () => {
      redisClient.sMembers.mockResolvedValue(['sid-current']);
      redisClient.mGet.mockResolvedValue([
        JSON.stringify({cookie: {expires: '2026-08-13T00:00:00.000Z'}}),
      ]);
      const [session] = await service.list('user-1', 'sid-current');

      await expect(
        service.invalidate('user-1', session.id, 'sid-current')
      ).resolves.toBe(false);
      expect(redisClient.del).not.toHaveBeenCalled();
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

    it('invalidateOthers preserves the current session and removes the rest', async () => {
      redisClient.sMembers.mockResolvedValue(['sid-current', 'sid-other']);

      await service.invalidateOthers('user-1', 'sid-current');

      expect(redisClient.del).toHaveBeenCalledWith(['sess:sid-other']);
      expect(redisClient.sRem).toHaveBeenCalledWith('user-sessions:user-1', [
        'sid-other',
      ]);
    });

    it('invalidateOthers does nothing when only the current session is tracked', async () => {
      redisClient.sMembers.mockResolvedValue(['sid-current']);

      await service.invalidateOthers('user-1', 'sid-current');

      expect(redisClient.del).not.toHaveBeenCalled();
      expect(redisClient.sRem).not.toHaveBeenCalled();
    });
  });
});
