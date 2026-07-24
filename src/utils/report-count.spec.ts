import {syncReportCount} from './report-count';

describe('syncReportCount', () => {
  const makeRepository = () => ({
    update: jest.fn().mockResolvedValue(undefined),
  });

  it('persists the new reportCount while preserving updatedAt', async () => {
    const repository = makeRepository();
    const updatedAt = new Date('2026-01-01T00:00:00Z');
    const entity = {id: 'story-1', updatedAt, reportCount: 0};

    await syncReportCount(repository, entity, 3);

    expect(repository.update).toHaveBeenCalledWith('story-1', {
      reportCount: 3,
      updatedAt,
    });
  });

  it('mutates the passed-in entity to match what was persisted', async () => {
    const repository = makeRepository();
    const entity = {id: 'story-1', updatedAt: new Date(), reportCount: 0};

    await syncReportCount(repository, entity, 5);

    expect(entity.reportCount).toBe(5);
  });

  it('merges extra fields into both the persisted update and the entity', async () => {
    const repository = makeRepository();
    const entity = {
      id: 'comment-1',
      updatedAt: new Date(),
      reportCount: 0,
      isFlagged: false,
    };

    await syncReportCount(repository, entity, 1, {isFlagged: true});

    expect(repository.update).toHaveBeenCalledWith(
      'comment-1',
      expect.objectContaining({isFlagged: true, reportCount: 1})
    );
    expect(entity.isFlagged).toBe(true);
    expect(entity.reportCount).toBe(1);
  });

  it('zeroes the count on resolve (no extra fields)', async () => {
    const repository = makeRepository();
    const entity = {id: 'user-1', updatedAt: new Date(), reportCount: 4};

    await syncReportCount(repository, entity, 0);

    expect(entity.reportCount).toBe(0);
  });
});
