import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import {QueryFailedError} from 'typeorm';
import {TagsService} from 'src/tags/tags.service';
import {SeriesService} from 'src/series/series.service';
import {Role} from 'src/users/enums/role';
import {UsersService} from 'src/users/users.service';
import {Story} from './entities/story.entity';
import {StoryReport} from './entities/story-report.entity';
import {StoryStatus} from './enums/story-status.enum';
import {StoryReportReason} from './enums/story-report-reason.enum';
import {StoriesService} from './stories.service';

const duplicateEntryError = () => {
  const error = new QueryFailedError('INSERT', [], new Error('dup'));
  (error as any).code = 'ER_DUP_ENTRY';
  return error;
};

describe('StoriesService', () => {
  let service: StoriesService;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    count: jest.Mock;
    find: jest.Mock;
    findAndCount: jest.Mock;
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    increment: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let reportsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    countBy: jest.Mock;
    delete: jest.Mock;
    find: jest.Mock;
  };
  let usersService: {findOne: jest.Mock; markHasPublishedStory: jest.Mock};
  let tagsService: {findManyByIds: jest.Mock};
  let seriesService: {findOrCreateForAuthor: jest.Mock};
  // Shared by findRandomApprovedId (select/where/orderBy/getOne) and
  // _assignSeries's MAX(seriesPosition) aggregate (select/where/getRawOne).
  let randomQueryBuilder: {
    select: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
    getOne: jest.Mock;
    getRawOne: jest.Mock;
  };

  const author = {id: 'author-1'};

  beforeEach(async () => {
    randomQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getRawOne: jest.fn().mockResolvedValue({max: null}),
    };
    repository = {
      create: jest.fn((data) => data),
      save: jest.fn((story) => Promise.resolve(story)),
      // Publish-limit probe (_assertWithinPublishLimit) — under the free cap.
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      increment: jest.fn().mockResolvedValue({affected: 1}),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(() => randomQueryBuilder),
    };
    reportsRepository = {
      create: jest.fn((data) => data),
      save: jest.fn((report) => Promise.resolve(report)),
      countBy: jest.fn().mockResolvedValue(0),
      delete: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    usersService = {
      findOne: jest.fn().mockResolvedValue(author),
      markHasPublishedStory: jest.fn().mockResolvedValue(undefined),
    };
    tagsService = {findManyByIds: jest.fn()};
    seriesService = {findOrCreateForAuthor: jest.fn()};

    const module = await Test.createTestingModule({
      providers: [
        StoriesService,
        {provide: getRepositoryToken(Story), useValue: repository},
        {provide: getRepositoryToken(StoryReport), useValue: reportsRepository},
        {provide: UsersService, useValue: usersService},
        {provide: TagsService, useValue: tagsService},
        {provide: SeriesService, useValue: seriesService},
      ],
    }).compile();

    service = module.get(StoriesService);
  });

  describe('create', () => {
    const baseDto = {title: 'A Story', content: 'x'.repeat(500)};

    it('generates an excerpt from content when none is provided', async () => {
      const story = await service.create(baseDto, 'author-1');

      expect(story.excerpt).toBe('x'.repeat(280) + '...');
      expect(story.author).toBe(author);
    });

    it('keeps a provided excerpt', async () => {
      const story = await service.create(
        {...baseDto, excerpt: 'Custom excerpt'},
        'author-1'
      );

      expect(story.excerpt).toBe('Custom excerpt');
    });

    it('attaches tags when they all exist', async () => {
      const tags = [{id: 'tag-1'}, {id: 'tag-2'}];
      tagsService.findManyByIds.mockResolvedValue(tags);

      const story = await service.create(
        {...baseDto, tags: ['tag-1', 'tag-2']},
        'author-1'
      );

      expect(story.tags).toEqual(tags);
    });

    it('throws NotFoundException when a tag is missing', async () => {
      tagsService.findManyByIds.mockResolvedValue([{id: 'tag-1'}]);

      await expect(
        service.create({...baseDto, tags: ['tag-1', 'missing']}, 'author-1')
      ).rejects.toThrow(NotFoundException);
    });

    it('attaches a series and assigns the next position', async () => {
      const series = {id: 'series-1', title: 'Hollow Lane'};
      seriesService.findOrCreateForAuthor.mockResolvedValue(series);
      randomQueryBuilder.getRawOne.mockResolvedValue({max: '2'});

      const story = await service.create(
        {...baseDto, seriesTitle: 'Hollow Lane'},
        'author-1'
      );

      expect(seriesService.findOrCreateForAuthor).toHaveBeenCalledWith(
        author,
        'Hollow Lane'
      );
      expect(story.series).toBe(series);
      expect(story.seriesPosition).toBe(3);
    });

    it('starts a brand new series at position 1', async () => {
      seriesService.findOrCreateForAuthor.mockResolvedValue({
        id: 'series-1',
        title: 'Hollow Lane',
      });
      randomQueryBuilder.getRawOne.mockResolvedValue({max: null});

      const story = await service.create(
        {...baseDto, seriesTitle: 'Hollow Lane'},
        'author-1'
      );

      expect(story.seriesPosition).toBe(1);
    });

    it('leaves the story out of any series when seriesTitle is omitted', async () => {
      const story = await service.create(baseDto, 'author-1');

      expect(seriesService.findOrCreateForAuthor).not.toHaveBeenCalled();
      expect(story.series).toBeUndefined();
    });
  });

  describe('update', () => {
    beforeEach(() => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        author,
      });
    });

    it('allows the author to update their story', async () => {
      const story = await service.update(
        'story-1',
        {title: 'New title'},
        'author-1',
        Role.User
      );

      expect(story.title).toBe('New title');
    });

    it('allows an admin to update any story', async () => {
      const story = await service.update(
        'story-1',
        {title: 'New title'},
        'someone-else',
        Role.Admin
      );

      expect(story.title).toBe('New title');
    });

    it('rejects a non-owner non-admin user', async () => {
      await expect(
        service.update('story-1', {title: 'Nope'}, 'someone-else', Role.User)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update — series membership', () => {
    it('attaches a new series when none was set', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        author,
        series: null,
      });
      const series = {id: 'series-1', title: 'Hollow Lane'};
      seriesService.findOrCreateForAuthor.mockResolvedValue(series);
      randomQueryBuilder.getRawOne.mockResolvedValue({max: null});

      const story = await service.update(
        'story-1',
        {seriesTitle: 'Hollow Lane'},
        'author-1',
        Role.User
      );

      expect(seriesService.findOrCreateForAuthor).toHaveBeenCalledWith(
        author,
        'Hollow Lane'
      );
      expect(story.series).toBe(series);
      expect(story.seriesPosition).toBe(1);
    });

    it('detaches from its series when seriesTitle is explicitly null', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        author,
        series: {id: 'series-1', title: 'Hollow Lane'},
        seriesPosition: 2,
      });

      const story = await service.update(
        'story-1',
        {seriesTitle: null},
        'author-1',
        Role.User
      );

      expect(story.series).toBeNull();
      expect(story.seriesPosition).toBeNull();
      expect(seriesService.findOrCreateForAuthor).not.toHaveBeenCalled();
    });

    it('leaves the position alone when re-saved under the same series title', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        author,
        series: {id: 'series-1', title: 'Hollow Lane'},
        seriesPosition: 2,
      });

      const story = await service.update(
        'story-1',
        {seriesTitle: 'Hollow Lane'},
        'author-1',
        Role.User
      );

      expect(seriesService.findOrCreateForAuthor).not.toHaveBeenCalled();
      expect(story.seriesPosition).toBe(2);
    });

    it('leaves an existing series untouched when seriesTitle is omitted', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        author,
        series: {id: 'series-1', title: 'Hollow Lane'},
        seriesPosition: 2,
      });

      const story = await service.update(
        'story-1',
        {title: 'New title'},
        'author-1',
        Role.User
      );

      expect(story.series).toEqual({id: 'series-1', title: 'Hollow Lane'});
      expect(story.seriesPosition).toBe(2);
    });
  });

  describe('updateStatus', () => {
    beforeEach(() => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        status: StoryStatus.Pending,
        isFlagged: false,
        author,
      });
    });

    it('approves a story', async () => {
      const story = await service.updateStatus('story-1', StoryStatus.Approved);

      expect(story.status).toBe(StoryStatus.Approved);
      expect(story.isFlagged).toBe(false);
      expect(repository.save).toHaveBeenCalled();
    });

    it('marks the author as having published once approved', async () => {
      await service.updateStatus('story-1', StoryStatus.Approved);

      expect(usersService.markHasPublishedStory).toHaveBeenCalledWith(
        'author-1'
      );
    });

    it('keeps isFlagged in sync when flagging', async () => {
      const story = await service.updateStatus('story-1', StoryStatus.Flagged);

      expect(story.status).toBe(StoryStatus.Flagged);
      expect(story.isFlagged).toBe(true);
    });

    it('does not mark the author as published for a non-approved status', async () => {
      await service.updateStatus('story-1', StoryStatus.Rejected);

      expect(usersService.markHasPublishedStory).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a missing story', async () => {
      repository.findOneOrFail.mockRejectedValue(new Error('not found'));

      await expect(
        service.updateStatus('missing', StoryStatus.Approved)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      repository.findOneOrFail.mockResolvedValue({id: 'story-1', author});
    });

    it('deletes when the requester is the author', async () => {
      repository.delete.mockResolvedValue({affected: 1});

      await expect(
        service.remove('story-1', 'author-1', Role.User)
      ).resolves.toBeUndefined();
      expect(repository.delete).toHaveBeenCalledWith('story-1');
    });

    it('rejects a non-owner non-admin user', async () => {
      await expect(
        service.remove('story-1', 'someone-else', Role.User)
      ).rejects.toThrow(ForbiddenException);
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });

  describe('report', () => {
    it('rejects reporting your own story', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        status: StoryStatus.Approved,
        author: {id: 'author-1'},
      });

      await expect(
        service.report('story-1', 'author-1', StoryReportReason.Spam)
      ).rejects.toThrow(BadRequestException);
      expect(reportsRepository.save).not.toHaveBeenCalled();
    });

    it('saves a report (with reason and detail) and recomputes reportCount from the rows', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-2',
        status: StoryStatus.Approved,
        author: {id: 'author-1'},
        updatedAt: new Date('2020-01-01'),
      });
      reportsRepository.countBy.mockResolvedValue(3);

      const story = await service.report(
        'story-2',
        'reader-1',
        StoryReportReason.Plagiarism,
        'This is copied from another site.'
      );

      expect(reportsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: StoryReportReason.Plagiarism,
          details: 'This is copied from another site.',
        })
      );
      expect(reportsRepository.save).toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledWith(
        'story-2',
        expect.objectContaining({reportCount: 3})
      );
      expect(story.reportCount).toBe(3);
    });

    it('stores null details when none are given', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-2',
        status: StoryStatus.Approved,
        author: {id: 'author-1'},
        updatedAt: new Date(),
      });

      await service.report('story-2', 'reader-1', StoryReportReason.Spam);

      expect(reportsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({details: null})
      );
    });

    it('maps a duplicate report to ConflictException', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-2',
        status: StoryStatus.Approved,
        author: {id: 'author-1'},
        updatedAt: new Date(),
      });
      reportsRepository.save.mockRejectedValue(duplicateEntryError());

      await expect(
        service.report('story-2', 'reader-1', StoryReportReason.Spam)
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('resolveReports', () => {
    it('drops the report rows and zeroes the count', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-2',
        updatedAt: new Date(),
        reportCount: 5,
      });

      const story = await service.resolveReports('story-2');

      expect(reportsRepository.delete).toHaveBeenCalledWith({
        story: {id: 'story-2'},
      });
      expect(repository.update).toHaveBeenCalledWith(
        'story-2',
        expect.objectContaining({reportCount: 0})
      );
      expect(story.reportCount).toBe(0);
    });
  });

  describe('findOneWithReports', () => {
    it('attaches the individual reports, most recent first', async () => {
      repository.findOneOrFail.mockResolvedValue({id: 'story-2'});
      const reports = [
        {id: 'r1', reason: StoryReportReason.Spam, user: {id: 'a'}},
        {id: 'r2', reason: StoryReportReason.Plagiarism, user: {id: 'b'}},
      ];
      reportsRepository.find.mockResolvedValue(reports);

      const story = await service.findOneWithReports('story-2');

      expect(reportsRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {story: {id: 'story-2'}},
          relations: ['user'],
        })
      );
      expect(story.reports).toBe(reports);
    });
  });

  describe('findAllApprovedByUserId', () => {
    it('only queries approved stories for the given author', async () => {
      await service.findAllApprovedByUserId('author-1', 1, 20);

      expect(repository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {author: {id: 'author-1'}, status: StoryStatus.Approved},
        })
      );
    });
  });

  describe('findApprovedBySeriesId', () => {
    it('queries approved stories in that series, ordered by position', async () => {
      await service.findApprovedBySeriesId('series-1');

      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {series: {id: 'series-1'}, status: StoryStatus.Approved},
          order: {seriesPosition: 'ASC'},
        })
      );
    });
  });

  describe('recordView', () => {
    const approved = {
      id: 'story-1',
      status: StoryStatus.Approved,
      viewCount: 5,
      author: {id: 'author-1'},
    };

    it('increments an approved story once and marks the session', async () => {
      repository.findOne.mockResolvedValue({...approved});
      const session: {viewedStoryIds?: string[]} = {};

      const result = await service.recordView('story-1', session, 'reader-1');

      expect(result).toEqual({counted: true, viewCount: 6});
      expect(repository.increment).toHaveBeenCalledWith(
        {id: 'story-1'},
        'viewCount',
        1
      );
      expect(session.viewedStoryIds).toEqual(['story-1']);
    });

    it('does not double-count within the same session', async () => {
      repository.findOne.mockResolvedValue({...approved});
      const session = {viewedStoryIds: ['story-1']};

      const result = await service.recordView('story-1', session, 'reader-1');

      expect(result).toEqual({counted: false, viewCount: 5});
      expect(repository.increment).not.toHaveBeenCalled();
    });

    it('does not count a non-approved story', async () => {
      repository.findOne.mockResolvedValue({
        ...approved,
        status: StoryStatus.Pending,
      });

      const result = await service.recordView('story-1', {}, 'reader-1');

      expect(result.counted).toBe(false);
      expect(repository.increment).not.toHaveBeenCalled();
    });

    it("does not count the author's own view", async () => {
      repository.findOne.mockResolvedValue({...approved});

      const result = await service.recordView('story-1', {}, 'author-1');

      expect(result.counted).toBe(false);
      expect(repository.increment).not.toHaveBeenCalled();
    });

    it('counts an anonymous view (no viewerId)', async () => {
      repository.findOne.mockResolvedValue({...approved});

      const result = await service.recordView('story-1', {});

      expect(result).toEqual({counted: true, viewCount: 6});
    });

    it('throws NotFoundException for a missing story', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.recordView('missing', {})).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('findRandomApprovedId', () => {
    it('returns the id of the story RAND() picked', async () => {
      randomQueryBuilder.getOne.mockResolvedValue({id: 'story-7'});

      const id = await service.findRandomApprovedId();

      expect(id).toBe('story-7');
      expect(randomQueryBuilder.where).toHaveBeenCalledWith(
        'story.status = :status',
        {status: StoryStatus.Approved}
      );
      expect(randomQueryBuilder.orderBy).toHaveBeenCalledWith('RAND()');
    });

    it('throws NotFoundException when there are no approved stories', async () => {
      randomQueryBuilder.getOne.mockResolvedValue(null);

      await expect(service.findRandomApprovedId()).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
