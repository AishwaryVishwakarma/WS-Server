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
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const tags = {findManyByIds: jest.fn()};
  const service = new SeasonalEventsService(repository as never, tags as never);
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
});
