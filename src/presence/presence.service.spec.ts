import {NotFoundException} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import {Story} from 'src/stories/entities/story.entity';
import {StoryStatus} from 'src/stories/enums/story-status.enum';
import {PresenceService} from './presence.service';

describe('PresenceService', () => {
  let service: PresenceService;
  let repository: {findOne: jest.Mock};
  let redisClient: {
    zAdd: jest.Mock;
    zRemRangeByScore: jest.Mock;
    expire: jest.Mock;
    zCard: jest.Mock;
    zRem: jest.Mock;
  };

  beforeEach(async () => {
    repository = {findOne: jest.fn()};
    redisClient = {
      zAdd: jest.fn().mockResolvedValue(1),
      zRemRangeByScore: jest.fn().mockResolvedValue(0),
      expire: jest.fn().mockResolvedValue(true),
      zCard: jest.fn().mockResolvedValue(1),
      zRem: jest.fn().mockResolvedValue(1),
    };

    const module = await Test.createTestingModule({
      providers: [
        PresenceService,
        {provide: getRepositoryToken(Story), useValue: repository},
      ],
    }).compile();

    service = module.get(PresenceService);
  });

  describe('heartbeat', () => {
    it('throws NotFoundException for a missing story', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.heartbeat('story-1', 'tab-1')).rejects.toThrow(
        NotFoundException
      );
    });

    it('returns 0 without touching Redis for a non-approved story', async () => {
      repository.findOne.mockResolvedValue({
        id: 'story-1',
        status: StoryStatus.Pending,
        scheduledFor: null,
      });
      service.bindRedis(redisClient as never);

      const count = await service.heartbeat('story-1', 'tab-1');

      expect(count).toBe(0);
      expect(redisClient.zAdd).not.toHaveBeenCalled();
    });

    it('returns 0 without touching Redis for a still-scheduled story', async () => {
      repository.findOne.mockResolvedValue({
        id: 'story-1',
        status: StoryStatus.Approved,
        scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
      });
      service.bindRedis(redisClient as never);

      const count = await service.heartbeat('story-1', 'tab-1');

      expect(count).toBe(0);
      expect(redisClient.zAdd).not.toHaveBeenCalled();
    });

    it('returns 0 defensively when Redis has not been bound yet', async () => {
      repository.findOne.mockResolvedValue({
        id: 'story-1',
        status: StoryStatus.Approved,
        scheduledFor: null,
      });

      const count = await service.heartbeat('story-1', 'tab-1');

      expect(count).toBe(0);
    });

    it('registers the tab and returns the count excluding itself', async () => {
      repository.findOne.mockResolvedValue({
        id: 'story-1',
        status: StoryStatus.Approved,
        scheduledFor: null,
      });
      redisClient.zCard.mockResolvedValue(3);
      service.bindRedis(redisClient as never);

      const count = await service.heartbeat('story-1', 'tab-1');

      expect(count).toBe(2);
      expect(redisClient.zAdd).toHaveBeenCalledWith(
        'presence:story:story-1',
        expect.objectContaining({value: 'tab-1'})
      );
      expect(redisClient.zRemRangeByScore).toHaveBeenCalledWith(
        'presence:story:story-1',
        '-inf',
        expect.any(Number)
      );
      expect(redisClient.expire).toHaveBeenCalledWith(
        'presence:story:story-1',
        120
      );
    });

    it('never returns a negative count', async () => {
      repository.findOne.mockResolvedValue({
        id: 'story-1',
        status: StoryStatus.Approved,
        scheduledFor: null,
      });
      redisClient.zCard.mockResolvedValue(0);
      service.bindRedis(redisClient as never);

      const count = await service.heartbeat('story-1', 'tab-1');

      expect(count).toBe(0);
    });

    it('treats an already-past scheduledFor as live', async () => {
      repository.findOne.mockResolvedValue({
        id: 'story-1',
        status: StoryStatus.Approved,
        scheduledFor: new Date(Date.now() - 60 * 60 * 1000),
      });
      redisClient.zCard.mockResolvedValue(1);
      service.bindRedis(redisClient as never);

      const count = await service.heartbeat('story-1', 'tab-1');

      expect(count).toBe(0);
      expect(redisClient.zAdd).toHaveBeenCalled();
    });
  });

  describe('leave', () => {
    it('removes the tab from the story presence set', async () => {
      service.bindRedis(redisClient as never);

      await service.leave('story-1', 'tab-1');

      expect(redisClient.zRem).toHaveBeenCalledWith(
        'presence:story:story-1',
        'tab-1'
      );
    });

    it('is a no-op when Redis has not been bound yet', async () => {
      await expect(service.leave('story-1', 'tab-1')).resolves.toBeUndefined();
    });
  });
});
