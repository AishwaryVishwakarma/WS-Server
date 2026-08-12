import {Test} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import {Story} from 'src/stories/entities/story.entity';
import {StoriesService} from 'src/stories/stories.service';
import {ScareVote} from './entities/scare-vote.entity';
import {ScareRatingsService} from './scare-ratings.service';

describe('ScareRatingsService', () => {
  let service: ScareRatingsService;
  let votesRepository: {
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: {increment: jest.Mock; transaction: jest.Mock};
  };
  let storiesService: {findOneVisible: jest.Mock};

  beforeEach(async () => {
    votesRepository = {
      findOneBy: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn((vote) => Promise.resolve(vote)),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
      manager: {increment: jest.fn(), transaction: jest.fn()},
    };
    votesRepository.manager.transaction.mockImplementation(
      async (work: (manager: unknown) => Promise<unknown>) =>
        work({
          query: jest.fn(),
          getRepository: () => votesRepository,
          increment: votesRepository.manager.increment,
        })
    );
    storiesService = {findOneVisible: jest.fn().mockResolvedValue({})};

    const module = await Test.createTestingModule({
      providers: [
        ScareRatingsService,
        {provide: getRepositoryToken(ScareVote), useValue: votesRepository},
        {provide: StoriesService, useValue: storiesService},
      ],
    }).compile();

    service = module.get(ScareRatingsService);
  });

  describe('castVote', () => {
    it('checks visibility before casting', async () => {
      votesRepository.findOneBy.mockResolvedValue(null);

      await service.castVote('user-1', 'story-1', 4, undefined);

      expect(storiesService.findOneVisible).toHaveBeenCalledWith(
        'story-1',
        'user-1',
        undefined
      );
    });

    it('creates a new vote and increments both sum and count', async () => {
      votesRepository.findOneBy.mockResolvedValue(null);

      await service.castVote('user-1', 'story-1', 4);

      expect(votesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          user: {id: 'user-1'},
          story: {id: 'story-1'},
          value: 4,
        })
      );
      expect(votesRepository.manager.increment).toHaveBeenCalledWith(
        Story,
        {id: 'story-1'},
        'scareRatingSum',
        4
      );
      expect(votesRepository.manager.increment).toHaveBeenCalledWith(
        Story,
        {id: 'story-1'},
        'scareRatingCount',
        1
      );
    });

    it('changing to a different value adjusts sum by the delta only', async () => {
      votesRepository.findOneBy.mockResolvedValue({id: 'vote-1', value: 2});

      await service.castVote('user-1', 'story-1', 5);

      expect(votesRepository.update).toHaveBeenCalledWith('vote-1', {value: 5});
      expect(votesRepository.manager.increment).toHaveBeenCalledWith(
        Story,
        {id: 'story-1'},
        'scareRatingSum',
        3
      );
      expect(votesRepository.manager.increment).toHaveBeenCalledTimes(1);
    });

    it('re-casting the same value is a no-op', async () => {
      votesRepository.findOneBy.mockResolvedValue({id: 'vote-1', value: 3});

      await service.castVote('user-1', 'story-1', 3);

      expect(votesRepository.update).not.toHaveBeenCalled();
      expect(votesRepository.save).not.toHaveBeenCalled();
      expect(votesRepository.manager.increment).not.toHaveBeenCalled();
    });
  });

  describe('removeVote', () => {
    it('deletes the vote and decrements sum/count by its value', async () => {
      votesRepository.findOneBy.mockResolvedValue({id: 'vote-1', value: 4});

      await service.removeVote('user-1', 'story-1');

      expect(votesRepository.delete).toHaveBeenCalledWith('vote-1');
      expect(votesRepository.manager.increment).toHaveBeenCalledWith(
        Story,
        {id: 'story-1'},
        'scareRatingSum',
        -4
      );
      expect(votesRepository.manager.increment).toHaveBeenCalledWith(
        Story,
        {id: 'story-1'},
        'scareRatingCount',
        -1
      );
    });

    it('is a no-op when no vote exists', async () => {
      votesRepository.findOneBy.mockResolvedValue(null);

      await service.removeVote('user-1', 'story-1');

      expect(votesRepository.delete).not.toHaveBeenCalled();
      expect(votesRepository.manager.increment).not.toHaveBeenCalled();
    });
  });

  describe('myVotes', () => {
    it('returns a storyId-to-value map', async () => {
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {storyId: 'story-1', value: 5},
          {storyId: 'story-2', value: 2},
        ]),
      };
      votesRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.myVotes('user-1');

      expect(result).toEqual({'story-1': 5, 'story-2': 2});
      expect(queryBuilder.where).toHaveBeenCalledWith('vote.user = :userId', {
        userId: 'user-1',
      });
    });
  });
});
