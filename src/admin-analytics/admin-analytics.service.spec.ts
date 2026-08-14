import {DataSource} from 'typeorm';
import {AdminAnalyticsService} from './admin-analytics.service';
import {AnalyticsCacheService} from './analytics-cache.service';

describe('AdminAnalyticsService', () => {
  it('normalizes database counts and caches each range briefly', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          users: '10',
          stories: '8',
          publishedStories: '5',
          views: '42',
          likes: '7',
          comments: '6',
          bookmarks: '4',
          pendingStories: '2',
          pendingOver24Hours: '1',
          pendingOver72Hours: '0',
          reportedStories: '1',
          reportedComments: '3',
          reportedUsers: '0',
        },
      ])
      .mockResolvedValueOnce([
        {
          usersCurrent: '2',
          usersPrevious: '1',
          storiesCurrent: '3',
          storiesPrevious: '2',
          commentsCurrent: '4',
          commentsPrevious: '3',
          likesCurrent: '5',
          likesPrevious: '4',
          bookmarksCurrent: '1',
          bookmarksPrevious: '0',
        },
      ])
      .mockResolvedValueOnce([
        {
          date: '2026-08-12',
          users: '1',
          stories: '2',
          comments: '3',
          likes: '4',
          bookmarks: '5',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'story',
          title: 'Story',
          authorId: 'author',
          author: 'Author',
          views: '8',
          likes: '2',
          comments: '1',
        },
      ])
      .mockResolvedValueOnce([
        {id: 'author', name: 'Author', stories: '2', views: '8', likes: '2'},
      ])
      .mockResolvedValueOnce([
        {
          periodViews: '3',
          moderationDecisions: '2',
          averageReviewHours: '4',
          oldestPendingHours: '8',
          cohortUsers: '2',
          retained7: '1',
          retained30: '1',
        },
      ]);
    let cached: unknown = null;
    const cacheGet = jest.fn(() => Promise.resolve(cached));
    const cacheSet = jest.fn((_key: string, value: unknown) => {
      cached = value;
      return Promise.resolve();
    });
    const cache = {
      get: cacheGet,
      set: cacheSet,
    } as unknown as AnalyticsCacheService;
    const service = new AdminAnalyticsService(
      {query} as unknown as DataSource,
      cache
    );

    const range = {days: 30, end: new Date('2026-08-12T00:00:00.000Z')};
    const first = await service.getOverview(range);
    const second = await service.getOverview(range);

    expect(query).toHaveBeenCalledTimes(6);
    expect(cacheGet).toHaveBeenCalledTimes(2);
    expect(cacheSet).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(first).toMatchObject({
      rangeDays: 30,
      metrics: {users: {total: 10, current: 2, previous: 1}, views: 42},
      moderation: {
        pendingStories: 2,
        pendingOver24Hours: 1,
        pendingOver72Hours: 0,
        reportedComments: 3,
      },
      trends: [{users: 1, stories: 2, comments: 3, likes: 4, bookmarks: 5}],
      topStories: [{views: 8, likes: 2, comments: 1}],
    });
  });
});
