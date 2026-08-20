import {Test} from '@nestjs/testing';
import {getQueueToken} from '@nestjs/bullmq';
import {getRepositoryToken} from '@nestjs/typeorm';
import {SeriesService} from './series.service';
import {Series} from './entities/series.entity';
import {SeriesSubscription} from './entities/series-subscription.entity';
import {Story} from 'src/stories/entities/story.entity';
import {SERIES_NOTIFY_QUEUE} from 'src/jobs/queue.constants';

// notifySubscribers fans out onto SERIES_NOTIFY_QUEUE rather than creating
// notifications inline — this is what caught the unbounded-per-subscriber
// write pattern that risked exhausting the connection pool inside
// bulkUpdateStatus's transaction. These tests cover the guard clauses and
// the queue payload, not notification delivery itself (that's
// NotificationsService's own concern, exercised via SeriesNotifyProcessor).
describe('SeriesService', () => {
  let service: SeriesService;
  let subscriptionsRepository: {createQueryBuilder: jest.Mock};
  let storiesRepository: {update: jest.Mock};
  let seriesNotifyQueue: {addBulk: jest.Mock};
  let getRawMany: jest.Mock;

  const author = {id: 'author-1', name: 'Author', slug: 'author-slug'};
  const baseStory = {
    id: 'story-1',
    slug: 'story-slug',
    title: 'Story Title',
    author,
    series: {id: 'series-1'},
    seriesNotifiedAt: null,
    scheduledFor: null,
  } as unknown as Story;

  beforeEach(async () => {
    getRawMany = jest.fn().mockResolvedValue([]);
    subscriptionsRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany,
      }),
    };
    storiesRepository = {update: jest.fn().mockResolvedValue(undefined)};
    seriesNotifyQueue = {addBulk: jest.fn().mockResolvedValue(undefined)};

    const module = await Test.createTestingModule({
      providers: [
        SeriesService,
        {provide: getRepositoryToken(Series), useValue: {}},
        {
          provide: getRepositoryToken(SeriesSubscription),
          useValue: subscriptionsRepository,
        },
        {provide: getRepositoryToken(Story), useValue: storiesRepository},
        {
          provide: getQueueToken(SERIES_NOTIFY_QUEUE),
          useValue: seriesNotifyQueue,
        },
      ],
    }).compile();

    service = module.get(SeriesService);
  });

  describe('notifySubscribers', () => {
    it('does nothing when the story has no series', async () => {
      await service.notifySubscribers({
        ...baseStory,
        series: null,
      } as unknown as Story);

      expect(subscriptionsRepository.createQueryBuilder).not.toHaveBeenCalled();
      expect(storiesRepository.update).not.toHaveBeenCalled();
    });

    it('does nothing when already notified', async () => {
      await service.notifySubscribers({
        ...baseStory,
        seriesNotifiedAt: new Date(),
      } as unknown as Story);

      expect(subscriptionsRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('does nothing when scheduled for the future', async () => {
      await service.notifySubscribers({
        ...baseStory,
        scheduledFor: new Date(Date.now() + 60_000),
      } as unknown as Story);

      expect(subscriptionsRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('queues one job per subscriber, excluding the author', async () => {
      getRawMany.mockResolvedValue([
        {userId: 'subscriber-1'},
        {userId: 'subscriber-2'},
        {userId: author.id},
      ]);

      await service.notifySubscribers(baseStory);

      expect(seriesNotifyQueue.addBulk).toHaveBeenCalledTimes(1);
      const jobs = seriesNotifyQueue.addBulk.mock.calls[0][0];
      expect(jobs).toHaveLength(2);
      expect(
        jobs.map((job: {data: {recipientId: string}}) => job.data.recipientId)
      ).toEqual(expect.arrayContaining(['subscriber-1', 'subscriber-2']));
      expect(jobs[0].data).toMatchObject({
        actorId: author.id,
        actorName: author.name,
        actorSlug: author.slug,
        storyId: baseStory.id,
        storySlug: baseStory.slug,
        storyTitle: baseStory.title,
      });
      expect(storiesRepository.update).toHaveBeenCalledWith(baseStory.id, {
        seriesNotifiedAt: expect.any(Date),
      });
    });

    it('skips the queue call but still latches seriesNotifiedAt when there are no subscribers', async () => {
      getRawMany.mockResolvedValue([{userId: author.id}]);

      await service.notifySubscribers(baseStory);

      expect(seriesNotifyQueue.addBulk).not.toHaveBeenCalled();
      expect(storiesRepository.update).toHaveBeenCalledWith(baseStory.id, {
        seriesNotifiedAt: expect.any(Date),
      });
    });
  });
});
