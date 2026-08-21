import {ForbiddenException} from '@nestjs/common';
import {ImageStorageMaintenanceService} from './image-storage-maintenance.service';
import type {StoredImage} from './image-storage.service';

// snapshot/purge stream pages from ImageStorageService.listAllPages rather
// than materializing the whole bucket — these tests cover the aggregation
// and stale-file selection working correctly across multiple pages, not
// just a single one.
describe('ImageStorageMaintenanceService', () => {
  let service: ImageStorageMaintenanceService;
  let storage: {
    listAllPages: jest.Mock;
    belongsToNamespace: jest.Mock;
    capacityBytes: jest.Mock;
    namespace: jest.Mock;
    purgeEnabled: jest.Mock;
    delete: jest.Mock;
  };
  let stories: {createQueryBuilder: jest.Mock};
  let users: {createQueryBuilder: jest.Mock};

  const file = (
    id: string,
    overrides: Partial<StoredImage> = {}
  ): StoredImage => ({
    id,
    name: `production--${id}.jpg`,
    createdAt: '2020-01-01T00:00:00.000Z',
    size: 10,
    ...overrides,
  });

  const mockQueryBuilder = (rows: {fileId: string}[]) => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    withDeleted: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  });

  // `for await...of` (used by the service under test) accepts a plain sync
  // iterable just as well as a real AsyncGenerator, so a sync generator is
  // enough to fake listAllPages here without a pointless `await`.
  const asPages = function* (pages: {files: StoredImage[]; total: number}[]) {
    for (const page of pages) yield page;
  };

  beforeEach(() => {
    storage = {
      listAllPages: jest.fn(),
      belongsToNamespace: jest.fn((f: StoredImage) =>
        f.name.startsWith('production--')
      ),
      capacityBytes: jest.fn().mockReturnValue(1000),
      namespace: jest.fn().mockReturnValue('production'),
      purgeEnabled: jest.fn().mockReturnValue(true),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    stories = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder([])),
    };
    users = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder([])),
    };

    service = new ImageStorageMaintenanceService(
      storage as never,
      stories as never,
      users as never,
      {} as never
    );
  });

  describe('snapshot', () => {
    it('aggregates totals across multiple pages', async () => {
      storage.listAllPages.mockReturnValue(
        asPages([
          {files: [file('a', {size: 10}), file('b', {size: 20})], total: 3},
          {files: [file('c', {size: 30})], total: 3},
        ])
      );

      const result = await service.snapshot();

      expect(result.fileCount).toBe(3);
      expect(result.usedBytes).toBe(60);
      expect(result.namespaceFileCount).toBe(3);
      expect(result.namespaceUsedBytes).toBe(60);
    });

    it('counts a file as stale only once it is unreferenced and past the grace period', async () => {
      const old = '2000-01-01T00:00:00.000Z';
      storage.listAllPages.mockReturnValue(
        asPages([
          {
            files: [
              file('referenced', {createdAt: old}),
              file('too-recent', {createdAt: new Date().toISOString()}),
              file('stale', {createdAt: old}),
            ],
            total: 3,
          },
        ])
      );
      stories.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([{fileId: 'referenced'}])
      );

      const result = await service.snapshot();

      expect(result.staleFileCount).toBe(1);
      expect(result.staleBytes).toBe(10);
    });

    it('excludes files outside this deployment namespace from namespace/stale totals', async () => {
      storage.belongsToNamespace.mockReturnValue(false);
      storage.listAllPages.mockReturnValue(
        asPages([{files: [file('other-namespace')], total: 1}])
      );

      const result = await service.snapshot();

      expect(result.fileCount).toBe(1);
      expect(result.namespaceFileCount).toBe(0);
      expect(result.staleFileCount).toBe(0);
    });
  });

  describe('purge', () => {
    it('throws when purging is disabled', async () => {
      storage.purgeEnabled.mockReturnValue(false);

      await expect(service.purge()).rejects.toBeInstanceOf(ForbiddenException);
      expect(storage.listAllPages).not.toHaveBeenCalled();
    });

    it('deletes only stale, namespace-owned, unreferenced files', async () => {
      const old = '2000-01-01T00:00:00.000Z';
      storage.listAllPages.mockReturnValue(
        asPages([
          {
            files: [
              file('referenced', {createdAt: old}),
              file('too-recent', {createdAt: new Date().toISOString()}),
              file('stale-1', {createdAt: old, size: 5}),
            ],
            total: 3,
          },
          {files: [file('stale-2', {createdAt: old, size: 7})], total: 3},
        ])
      );
      stories.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([{fileId: 'referenced'}])
      );

      const result = await service.purge();

      expect(storage.delete).toHaveBeenCalledTimes(2);
      expect(storage.delete).toHaveBeenCalledWith('stale-1');
      expect(storage.delete).toHaveBeenCalledWith('stale-2');
      expect(result.deletedFileCount).toBe(2);
      expect(result.deletedBytes).toBe(12);
      expect(result.failedFileCount).toBe(0);
    });

    it('counts a failed deletion without aborting the rest of the purge', async () => {
      const old = '2000-01-01T00:00:00.000Z';
      storage.listAllPages.mockReturnValue(
        asPages([
          {
            files: [
              file('stale-1', {createdAt: old}),
              file('stale-2', {createdAt: old}),
            ],
            total: 2,
          },
        ])
      );
      storage.delete
        .mockRejectedValueOnce(new Error('gone'))
        .mockResolvedValue(undefined);

      const result = await service.purge();

      expect(result.deletedFileCount).toBe(1);
      expect(result.failedFileCount).toBe(1);
    });

    it('reports scan progress against the bucket total, not the stale count', async () => {
      const old = '2000-01-01T00:00:00.000Z';
      storage.listAllPages.mockReturnValue(
        asPages([{files: [file('stale', {createdAt: old})], total: 4}])
      );
      const job = {updateProgress: jest.fn().mockResolvedValue(undefined)};

      await service.purge(job);

      expect(job.updateProgress).toHaveBeenCalledWith(25);
    });
  });
});
