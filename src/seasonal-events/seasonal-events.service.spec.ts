import {BadRequestException, ConflictException} from '@nestjs/common';
import {SeasonalEventsService} from './seasonal-events.service';

describe('SeasonalEventsService', () => {
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getExists: jest.fn(),
  };
  const repository = {
    create: jest.fn(() => ({})),
    save: jest.fn((event) => Promise.resolve(event)),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const completions = {count: jest.fn()};
  const progress = {createQueryBuilder: jest.fn()};
  const tags = {findManyByIds: jest.fn()};
  const service = new SeasonalEventsService(
    repository as never,
    completions as never,
    progress as never,
    tags as never
  );
  const selectedTag = {
    id: '38bbbfc9-a0f7-463a-b2d0-bb5bcb582e72',
    name: 'Ghostly',
    slug: 'ghostly',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository.createQueryBuilder.mockReturnValue(queryBuilder);
    queryBuilder.getExists.mockResolvedValue(false);
    tags.findManyByIds.mockResolvedValue([selectedTag]);
  });

  it('rejects an invalid event window', async () => {
    await expect(
      service.create({
        title: 'Long Night',
        description: 'Read after dark.',
        goal: 3,
        startsAt: '2030-11-02T00:00:00.000Z',
        endsAt: '2030-11-01T00:00:00.000Z',
        isPublished: false,
        tagIds: [selectedTag.id],
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects overlapping published windows', async () => {
    queryBuilder.getExists.mockResolvedValue(true);

    await expect(
      service.create({
        title: 'Long Night',
        description: 'Read after dark.',
        goal: 3,
        startsAt: '2030-11-01T00:00:00.000Z',
        endsAt: '2030-11-30T00:00:00.000Z',
        isPublished: true,
        tagIds: [selectedTag.id],
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns zeroed analytics when an event has no tags', async () => {
    repository.findOne.mockResolvedValue({
      id: 'event-1',
      tags: [],
      startsAt: new Date('2030-11-01T00:00:00.000Z'),
      endsAt: new Date('2030-11-30T00:00:00.000Z'),
    });
    completions.count.mockResolvedValue(2);

    await expect(service.analytics('event-1')).resolves.toEqual({
      participants: 0,
      completions: 2,
      completionRate: 0,
      stories: [],
    });
    expect(progress.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('lists only published events for the public archive', async () => {
    repository.find.mockResolvedValue([
      {
        id: 'event-1',
        isPublished: true,
        startsAt: new Date('2030-11-01T00:00:00.000Z'),
        endsAt: new Date('2030-11-30T00:00:00.000Z'),
        tags: [selectedTag],
      },
    ]);

    const result = await service.publicList();

    expect(repository.find).toHaveBeenCalledWith({
      where: {isPublished: true},
      order: {startsAt: 'DESC'},
    });
    expect(result[0]).toMatchObject({
      id: 'event-1',
      tagSlugs: ['ghostly'],
    });
  });
});
