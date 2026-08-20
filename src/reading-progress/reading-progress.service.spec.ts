import {ReadingProgressService} from './reading-progress.service';
import {Role} from 'src/users/enums/role';

describe('ReadingProgressService', () => {
  const repository = {
    upsert: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const stories = {assertVisible: jest.fn()};
  const events = {active: jest.fn()};
  const completionQuery = {
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };
  const completions = {createQueryBuilder: jest.fn(() => completionQuery)};
  const users = {};
  const service = new ReadingProgressService(
    repository as never,
    users as never,
    completions as never,
    stories as never,
    events as never
  );

  beforeEach(() => jest.clearAllMocks());

  it('does no database work below the persistence threshold', async () => {
    await service.set('user-1', 'story-1', 4, Role.User);

    expect(stories.assertVisible).not.toHaveBeenCalled();
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('uses the lightweight visibility guard before upserting progress', async () => {
    await service.set('user-1', 'story-1', 42, Role.User);

    expect(stories.assertVisible).toHaveBeenCalledWith(
      'story-1',
      'user-1',
      Role.User
    );
    expect(repository.upsert).toHaveBeenCalledWith(
      {
        user: {id: 'user-1'},
        story: {id: 'story-1'},
        percent: 42,
      },
      {conflictPaths: ['user', 'story']}
    );
  });

  it('records an event achievement when a finished story meets the goal', async () => {
    const progressQuery = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({completed: '1'}),
    };
    repository.createQueryBuilder.mockReturnValue(progressQuery);
    events.active.mockResolvedValue({
      id: 'event-1',
      title: 'Summer Seance',
      goal: 1,
      startsAt: new Date('2026-08-01T00:00:00Z'),
      endsAt: new Date('2026-09-01T00:00:00Z'),
      tags: [{id: 'tag-1'}],
    });
    completionQuery.execute.mockResolvedValue({
      identifiers: [{id: 'award-1'}],
      raw: [{id: 'award-1'}],
    });

    const result = await service.set('user-1', 'story-1', 100, Role.User);

    expect(completionQuery.values).toHaveBeenCalledWith({
      user: {id: 'user-1'},
      event: {id: 'event-1'},
    });
    expect(completionQuery.orIgnore).toHaveBeenCalled();
    expect(completionQuery.returning).toHaveBeenCalledWith('id');
    expect(completionQuery.execute).toHaveBeenCalled();
    expect(result).toEqual({
      eventAchievement: {eventId: 'event-1', title: 'Summer Seance'},
    });
  });

  it('does not announce an event achievement already in the ledger', async () => {
    const progressQuery = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({completed: '1'}),
    };
    repository.createQueryBuilder.mockReturnValue(progressQuery);
    events.active.mockResolvedValue({
      id: 'event-1',
      title: 'Summer Seance',
      goal: 1,
      startsAt: new Date('2026-08-01T00:00:00Z'),
      endsAt: new Date('2026-09-01T00:00:00Z'),
      tags: [{id: 'tag-1'}],
    });
    completionQuery.execute.mockResolvedValue({
      identifiers: [{id: 'attempted-id'}],
      raw: [],
    });

    await expect(
      service.set('user-1', 'story-1', 100, Role.User)
    ).resolves.toEqual({eventAchievement: null});
  });
});
