import {DataSource} from 'typeorm';
import {AdminAnalyticsService} from './admin-analytics.service';

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
      ]);
    const service = new AdminAnalyticsService({query} as unknown as DataSource);

    const first = await service.getOverview(30);
    const second = await service.getOverview(30);

    expect(query).toHaveBeenCalledTimes(5);
    expect(second).toBe(first);
    expect(first).toMatchObject({
      rangeDays: 30,
      metrics: {users: {total: 10, current: 2, previous: 1}, views: 42},
      moderation: {pendingStories: 2, reportedComments: 3},
      trends: [{users: 1, stories: 2, comments: 3, likes: 4, bookmarks: 5}],
      topStories: [{views: 8, likes: 2, comments: 1}],
    });
  });
});
