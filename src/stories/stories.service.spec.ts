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
import {MutesService} from 'src/mutes/mutes.service';
import {SettingsService} from 'src/settings/settings.service';
import {Role} from 'src/users/enums/role';
import {UsersService} from 'src/users/users.service';
import {Story} from './entities/story.entity';
import {StoryReport} from './entities/story-report.entity';
import {StoryRevision} from './entities/story-revision.entity';
import {StoryLike} from 'src/likes/entities/story-like.entity';
import {Bookmark} from 'src/bookmarks/entities/bookmark.entity';
import {ReadingProgress} from 'src/reading-progress/entities/reading-progress.entity';
import {StoryStatus} from './enums/story-status.enum';
import {StoryReportReason} from './enums/story-report-reason.enum';
import {ContentWarning} from './enums/content-warning.enum';
import {StoriesService} from './stories.service';

const duplicateEntryError = () => {
  const error = new QueryFailedError('INSERT', [], new Error('dup'));
  (error as any).code = '23505';
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
    manager: {transaction: jest.Mock};
  };
  let reportsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    countBy: jest.Mock;
    delete: jest.Mock;
    find: jest.Mock;
  };
  let revisionsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };
  let storyLikeRepository: {find: jest.Mock};
  let bookmarkRepository: {find: jest.Mock};
  let readingProgressRepository: {find: jest.Mock};
  let usersService: {
    findOne: jest.Mock;
    markHasPublishedStory: jest.Mock;
    recordActivity: jest.Mock;
  };
  let tagsService: {findManyByIds: jest.Mock};
  let seriesService: {findOrCreateForAuthor: jest.Mock};
  let mutesService: {mutedAuthorIds: jest.Mock};
  let settingsService: {
    requiresApproval: jest.Mock;
    allowsStoryCoverImage: jest.Mock;
  };
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
      // bulkUpdateStatus runs inside a transaction; withRepository() just
      // hands back this same mock, so its find/save calls behave identically
      // whether or not a "real" transaction is in play.
      manager: {
        transaction: jest.fn((callback) =>
          callback({withRepository: () => repository})
        ),
      },
    };
    reportsRepository = {
      create: jest.fn((data) => data),
      save: jest.fn((report) => Promise.resolve(report)),
      countBy: jest.fn().mockResolvedValue(0),
      delete: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    revisionsRepository = {
      create: jest.fn((data) => data),
      save: jest.fn((revision) => Promise.resolve(revision)),
      find: jest.fn().mockResolvedValue([]),
    };
    storyLikeRepository = {find: jest.fn().mockResolvedValue([])};
    bookmarkRepository = {find: jest.fn().mockResolvedValue([])};
    readingProgressRepository = {find: jest.fn().mockResolvedValue([])};
    usersService = {
      findOne: jest.fn().mockResolvedValue(author),
      markHasPublishedStory: jest.fn().mockResolvedValue(undefined),
      recordActivity: jest.fn().mockResolvedValue(undefined),
    };
    tagsService = {findManyByIds: jest.fn()};
    seriesService = {findOrCreateForAuthor: jest.fn()};
    mutesService = {mutedAuthorIds: jest.fn().mockResolvedValue([])};
    // Defaults to true (approval required) so every pre-existing test keeps
    // asserting today's behavior without needing to know about the setting.
    settingsService = {
      requiresApproval: jest.fn().mockResolvedValue(true),
      // Defaults to true (allowed) so every pre-existing test that sets
      // coverImageUrl keeps asserting today's behavior unchanged.
      allowsStoryCoverImage: jest.fn().mockResolvedValue(true),
    };

    const module = await Test.createTestingModule({
      providers: [
        StoriesService,
        {provide: getRepositoryToken(Story), useValue: repository},
        {provide: getRepositoryToken(StoryReport), useValue: reportsRepository},
        {
          provide: getRepositoryToken(StoryRevision),
          useValue: revisionsRepository,
        },
        {provide: getRepositoryToken(StoryLike), useValue: storyLikeRepository},
        {provide: getRepositoryToken(Bookmark), useValue: bookmarkRepository},
        {
          provide: getRepositoryToken(ReadingProgress),
          useValue: readingProgressRepository,
        },
        {provide: UsersService, useValue: usersService},
        {provide: TagsService, useValue: tagsService},
        {provide: SeriesService, useValue: seriesService},
        {provide: MutesService, useValue: mutesService},
        {provide: SettingsService, useValue: settingsService},
      ],
    }).compile();

    service = module.get(StoriesService);
  });

  describe('assertVisible', () => {
    it('uses a narrow projection instead of loading story content and tags', async () => {
      repository.findOne.mockResolvedValue({
        id: 'story-1',
        status: StoryStatus.Approved,
        scheduledFor: null,
        author,
      });

      await service.assertVisible('story-1', 'reader-1', Role.User);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: {id: 'story-1'},
        relations: {author: true},
        select: {
          id: true,
          status: true,
          scheduledFor: true,
          author: {id: true},
        },
        withDeleted: true,
      });
    });

    it('preserves the hidden scheduled-story rule', async () => {
      repository.findOne.mockResolvedValue({
        id: 'story-1',
        status: StoryStatus.Approved,
        scheduledFor: new Date(Date.now() + 60_000),
        author,
      });

      await expect(
        service.assertVisible('story-1', 'reader-1', Role.User)
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.assertVisible('story-1', author.id, Role.User)
      ).resolves.toBeUndefined();
    });
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

    it('drops coverImageUrl when the site setting disallows it', async () => {
      settingsService.allowsStoryCoverImage.mockResolvedValue(false);

      const story = await service.create(
        {...baseDto, coverImageUrl: 'https://example.com/cover.png'},
        'author-1'
      );

      expect(story.coverImageUrl).toBeUndefined();
    });

    it('keeps coverImageUrl when the site setting allows it', async () => {
      settingsService.allowsStoryCoverImage.mockResolvedValue(true);

      const story = await service.create(
        {...baseDto, coverImageUrl: 'https://example.com/cover.png'},
        'author-1'
      );

      expect(story.coverImageUrl).toBe('https://example.com/cover.png');
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

    it('defaults to pending and does not mark the author published', async () => {
      const story = await service.create(baseDto, 'author-1');

      expect(story.status).toBe(StoryStatus.Pending);
      expect(usersService.markHasPublishedStory).not.toHaveBeenCalled();
    });

    it('publishes immediately when the site does not require approval', async () => {
      settingsService.requiresApproval.mockResolvedValue(false);

      const story = await service.create(baseDto, 'author-1');

      expect(story.status).toBe(StoryStatus.Approved);
      expect(usersService.markHasPublishedStory).toHaveBeenCalledWith(
        'author-1'
      );
    });

    it('still saves a draft even when approval is not required', async () => {
      settingsService.requiresApproval.mockResolvedValue(false);

      const story = await service.create({...baseDto, draft: true}, 'author-1');

      expect(story.status).toBe(StoryStatus.Draft);
      expect(usersService.markHasPublishedStory).not.toHaveBeenCalled();
    });
  });

  describe('submitDraft', () => {
    beforeEach(() => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        status: StoryStatus.Draft,
        author,
      });
    });

    it('moves a draft into the pending queue by default', async () => {
      const story = await service.submitDraft('story-1', 'author-1', Role.User);

      expect(story.status).toBe(StoryStatus.Pending);
      expect(usersService.markHasPublishedStory).not.toHaveBeenCalled();
    });

    it('publishes immediately when the site does not require approval', async () => {
      settingsService.requiresApproval.mockResolvedValue(false);

      const story = await service.submitDraft('story-1', 'author-1', Role.User);

      expect(story.status).toBe(StoryStatus.Approved);
      expect(usersService.markHasPublishedStory).toHaveBeenCalledWith(
        'author-1'
      );
    });

    it('rejects submitting a story that is not a draft', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        status: StoryStatus.Pending,
        author,
      });

      await expect(
        service.submitDraft('story-1', 'author-1', Role.User)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        author,
        tags: [],
        contentWarnings: [],
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

    it('drops a coverImageUrl update when the site setting disallows it', async () => {
      settingsService.allowsStoryCoverImage.mockResolvedValue(false);
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        author,
        tags: [],
        contentWarnings: [],
        coverImageUrl: 'https://example.com/old.png',
      });

      const story = await service.update(
        'story-1',
        {coverImageUrl: 'https://example.com/new.png'},
        'author-1',
        Role.User
      );

      expect(story.coverImageUrl).toBe('https://example.com/old.png');
    });

    it('applies a coverImageUrl update when the site setting allows it', async () => {
      settingsService.allowsStoryCoverImage.mockResolvedValue(true);
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        author,
        tags: [],
        contentWarnings: [],
        coverImageUrl: 'https://example.com/old.png',
      });

      const story = await service.update(
        'story-1',
        {coverImageUrl: 'https://example.com/new.png'},
        'author-1',
        Role.User
      );

      expect(story.coverImageUrl).toBe('https://example.com/new.png');
    });
  });

  describe('update — scheduled publishing', () => {
    const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const past = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

    it('rejects a non-admin scheduling an already-public story into the future', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        author,
        status: StoryStatus.Approved,
        scheduledFor: null,
        tags: [],
        contentWarnings: [],
      });

      await expect(
        service.update(
          'story-1',
          {scheduledFor: future()},
          'author-1',
          Role.User
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('allows an admin to schedule an already-public story into the future', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        author,
        status: StoryStatus.Approved,
        scheduledFor: null,
        tags: [],
        contentWarnings: [],
      });
      const when = future();

      const story = await service.update(
        'story-1',
        {scheduledFor: when},
        'someone-else',
        Role.Admin
      );

      expect(story.scheduledFor).toEqual(new Date(when));
    });

    it('allows a non-admin to schedule a still-pending story', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        author,
        status: StoryStatus.Pending,
        scheduledFor: null,
        tags: [],
        contentWarnings: [],
      });
      const when = future();

      const story = await service.update(
        'story-1',
        {scheduledFor: when},
        'author-1',
        Role.User
      );

      expect(story.scheduledFor).toEqual(new Date(when));
    });

    it('allows a non-admin to push a not-yet-live approved story further out', async () => {
      // Approved, but its existing schedule hasn't passed yet — not actually
      // public, so the retroactive guard doesn't apply.
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        author,
        status: StoryStatus.Approved,
        scheduledFor: new Date(Date.now() + 30 * 60 * 1000),
        tags: [],
        contentWarnings: [],
      });
      const when = future();

      const story = await service.update(
        'story-1',
        {scheduledFor: when},
        'author-1',
        Role.User
      );

      expect(story.scheduledFor).toEqual(new Date(when));
    });

    it('changing only the schedule does not reset an already-public story to pending', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        author,
        status: StoryStatus.Approved,
        scheduledFor: null,
        tags: [],
        contentWarnings: [],
      });

      const story = await service.update(
        'story-1',
        {scheduledFor: past()},
        'author-1',
        Role.User
      );

      expect(story.status).toBe(StoryStatus.Approved);
      expect(revisionsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('update — auto-approve', () => {
    beforeEach(() => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        author,
        status: StoryStatus.Rejected,
        tags: [],
        contentWarnings: [],
      });
    });

    it('resets an edited, already-moderated story back to pending by default', async () => {
      const story = await service.update(
        'story-1',
        {title: 'New title'},
        'author-1',
        Role.User
      );

      expect(story.status).toBe(StoryStatus.Pending);
      expect(usersService.markHasPublishedStory).not.toHaveBeenCalled();
    });

    it('approves an edit outright when the site does not require approval', async () => {
      settingsService.requiresApproval.mockResolvedValue(false);

      const story = await service.update(
        'story-1',
        {title: 'New title'},
        'author-1',
        Role.User
      );

      expect(story.status).toBe(StoryStatus.Approved);
      expect(usersService.markHasPublishedStory).toHaveBeenCalledWith(
        'author-1'
      );
    });
  });

  describe('update — series membership', () => {
    it('attaches a new series when none was set', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        author,
        series: null,
        tags: [],
        contentWarnings: [],
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
        tags: [],
        contentWarnings: [],
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
        tags: [],
        contentWarnings: [],
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
        tags: [],
        contentWarnings: [],
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

  describe('update — revisions', () => {
    it('snapshots the pre-edit state on a content-changing edit to a non-draft story', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        excerpt: 'Old excerpt',
        content: 'Old content',
        coverImageUrl: null,
        contentWarnings: [ContentWarning.GraphicViolence],
        status: StoryStatus.Approved,
        author,
        tags: [{name: 'horror'}],
      });

      await service.update(
        'story-1',
        {title: 'New title'},
        'author-1',
        Role.User
      );

      expect(revisionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Old title',
          excerpt: 'Old excerpt',
          content: 'Old content',
          statusBefore: StoryStatus.Approved,
          tagNames: ['horror'],
        })
      );
      expect(revisionsRepository.save).toHaveBeenCalled();
    });

    it('does not snapshot a scareLevel-only edit', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        status: StoryStatus.Approved,
        author,
        tags: [],
      });

      await service.update('story-1', {scareLevel: 3}, 'author-1', Role.User);

      expect(revisionsRepository.create).not.toHaveBeenCalled();
    });

    it('does not snapshot an edit to a draft story, regardless of which fields change', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        title: 'Old title',
        status: StoryStatus.Draft,
        author,
        tags: [],
      });

      await service.update(
        'story-1',
        {title: 'New title', content: 'New content'},
        'author-1',
        Role.User
      );

      expect(revisionsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findRevisions', () => {
    it('returns the story revisions, newest first, for the owner', async () => {
      repository.findOneOrFail.mockResolvedValue({id: 'story-1', author});
      const revisions = [{id: 'rev-2'}, {id: 'rev-1'}];
      revisionsRepository.find.mockResolvedValue(revisions);

      const result = await service.findRevisions(
        'story-1',
        'author-1',
        Role.User
      );

      expect(revisionsRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {story: {id: 'story-1'}},
          order: {createdAt: 'DESC'},
        })
      );
      expect(result).toBe(revisions);
    });

    it('rejects a non-owner non-admin user', async () => {
      repository.findOneOrFail.mockResolvedValue({id: 'story-1', author});

      await expect(
        service.findRevisions('story-1', 'someone-else', Role.User)
      ).rejects.toThrow(ForbiddenException);
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

    it('stores the reason when rejecting', async () => {
      const story = await service.updateStatus(
        'story-1',
        StoryStatus.Rejected,
        'Too short for our guidelines.'
      );

      expect(story.rejectionReason).toBe('Too short for our guidelines.');
    });

    it('clears the reason on every other transition', async () => {
      repository.findOneOrFail.mockResolvedValue({
        id: 'story-1',
        status: StoryStatus.Rejected,
        rejectionReason: 'An old reason from before.',
        isFlagged: false,
        author,
      });

      const story = await service.updateStatus('story-1', StoryStatus.Approved);

      expect(story.rejectionReason).toBeNull();
    });
  });

  describe('bulkUpdateStatus', () => {
    it('transitions every story in one call', async () => {
      const stories = [
        {id: 'story-1', status: StoryStatus.Pending, author: {id: 'a1'}},
        {id: 'story-2', status: StoryStatus.Pending, author: {id: 'a2'}},
      ];
      repository.find.mockResolvedValue(stories);

      const result = await service.bulkUpdateStatus(
        ['story-1', 'story-2'],
        StoryStatus.Approved
      );

      expect(
        result.every((story) => story.status === StoryStatus.Approved)
      ).toBe(true);
      expect(repository.save).toHaveBeenCalledWith(stories);
    });

    it('always clears the rejection reason, even a pre-existing one', async () => {
      const stories = [
        {
          id: 'story-1',
          status: StoryStatus.Approved,
          rejectionReason: 'Stale from a prior rejection.',
          author: {id: 'a1'},
        },
      ];
      repository.find.mockResolvedValue(stories);

      const result = await service.bulkUpdateStatus(
        ['story-1'],
        StoryStatus.Rejected
      );

      expect(result[0].rejectionReason).toBeNull();
    });

    it('latches markHasPublishedStory once per distinct author when approving', async () => {
      const stories = [
        {id: 'story-1', status: StoryStatus.Pending, author: {id: 'a1'}},
        {id: 'story-2', status: StoryStatus.Pending, author: {id: 'a1'}},
      ];
      repository.find.mockResolvedValue(stories);

      await service.bulkUpdateStatus(
        ['story-1', 'story-2'],
        StoryStatus.Approved
      );

      expect(usersService.markHasPublishedStory).toHaveBeenCalledTimes(1);
      expect(usersService.markHasPublishedStory).toHaveBeenCalledWith('a1');
    });

    it('rejects the whole batch (and changes nothing) when an id is missing', async () => {
      repository.find.mockResolvedValue([
        {id: 'story-1', status: StoryStatus.Pending, author: {id: 'a1'}},
      ]);

      await expect(
        service.bulkUpdateStatus(
          ['story-1', 'does-not-exist'],
          StoryStatus.Approved
        )
      ).rejects.toThrow(NotFoundException);

      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('findAllBySeriesId', () => {
    it('returns every story in the series regardless of status, ordered by position', async () => {
      const stories = [
        {id: 'story-1', status: StoryStatus.Draft, seriesPosition: 1},
        {id: 'story-2', status: StoryStatus.Approved, seriesPosition: 2},
      ];
      repository.find.mockResolvedValue(stories);

      const result = await service.findAllBySeriesId('series-1');

      expect(result).toBe(stories);
      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {series: {id: 'series-1'}},
          order: {seriesPosition: 'ASC'},
        })
      );
    });
  });

  describe('reorderSeries', () => {
    it('assigns 1-based positions in the submitted order', async () => {
      const stories = [
        {id: 'story-1', seriesPosition: 1},
        {id: 'story-2', seriesPosition: 2},
        {id: 'story-3', seriesPosition: 3},
      ];
      repository.find.mockResolvedValue(stories);

      const result = await service.reorderSeries('series-1', [
        'story-3',
        'story-1',
        'story-2',
      ]);

      expect(repository.save).toHaveBeenCalledWith(stories);
      expect(result.map((story) => story.id)).toEqual([
        'story-3',
        'story-1',
        'story-2',
      ]);
      expect(stories.find((s) => s.id === 'story-3')!.seriesPosition).toBe(1);
      expect(stories.find((s) => s.id === 'story-1')!.seriesPosition).toBe(2);
      expect(stories.find((s) => s.id === 'story-2')!.seriesPosition).toBe(3);
    });

    it('rejects a storyIds set missing one of the series current stories', async () => {
      repository.find.mockResolvedValue([
        {id: 'story-1', seriesPosition: 1},
        {id: 'story-2', seriesPosition: 2},
      ]);

      await expect(
        service.reorderSeries('series-1', ['story-1'])
      ).rejects.toThrow(BadRequestException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects a storyIds set containing a foreign id', async () => {
      repository.find.mockResolvedValue([
        {id: 'story-1', seriesPosition: 1},
        {id: 'story-2', seriesPosition: 2},
      ]);

      await expect(
        service.reorderSeries('series-1', ['story-1', 'not-in-series'])
      ).rejects.toThrow(BadRequestException);
      expect(repository.save).not.toHaveBeenCalled();
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
          // An array of where-clauses (TypeORM OR's them): "no schedule" OR
          // "schedule already passed" — a still-scheduled story is excluded
          // even once approved.
          where: expect.arrayContaining([
            expect.objectContaining({
              series: {id: 'series-1'},
              status: StoryStatus.Approved,
            }),
          ]),
          order: {seriesPosition: 'ASC'},
        })
      );
      const {where} = repository.find.mock.calls[0][0];
      expect(where).toHaveLength(2);
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
    it('returns the id of the story RANDOM() picked', async () => {
      randomQueryBuilder.getOne.mockResolvedValue({id: 'story-7'});

      const id = await service.findRandomApprovedId();

      expect(id).toBe('story-7');
      expect(randomQueryBuilder.where).toHaveBeenCalledWith(
        'story.status = :status',
        {status: StoryStatus.Approved}
      );
      expect(randomQueryBuilder.orderBy).toHaveBeenCalledWith('RANDOM()');
    });

    it('throws NotFoundException when there are no approved stories', async () => {
      randomQueryBuilder.getOne.mockResolvedValue(null);

      await expect(service.findRandomApprovedId()).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('findForYouFeed', () => {
    it('returns empty without querying when the reader has no engagement history', async () => {
      const result = await service.findForYouFeed('reader-1', {});

      expect(result).toEqual({data: [], nextCursor: null, total: 0});
      expect(repository.find).not.toHaveBeenCalled();
    });

    it('returns empty when engaged stories carry no tags', async () => {
      storyLikeRepository.find.mockResolvedValue([{story: {id: 'story-1'}}]);
      repository.find.mockResolvedValue([{id: 'story-1', tags: []}]);

      const result = await service.findForYouFeed('reader-1', {});

      expect(result).toEqual({data: [], nextCursor: null, total: 0});
    });

    it('derives affinity tags and exclusions from likes/bookmarks/reading progress', async () => {
      storyLikeRepository.find.mockResolvedValue([{story: {id: 'story-1'}}]);
      bookmarkRepository.find.mockResolvedValue([{story: {id: 'story-2'}}]);
      readingProgressRepository.find.mockResolvedValue([
        {story: {id: 'story-1'}}, // already-seen id, should dedupe
      ]);
      repository.find.mockResolvedValue([
        {id: 'story-1', tags: [{id: 'tag-1'}, {id: 'tag-2'}]},
        {id: 'story-2', tags: [{id: 'tag-1'}]},
      ]);

      const feedResult = {
        data: [],
        nextCursor: null,
        total: 0,
      };
      const findApprovedFeedSpy = jest
        .spyOn(service, 'findApprovedFeed')
        .mockResolvedValue(feedResult);

      const result = await service.findForYouFeed('reader-1', {
        cursor: 'abc',
        limit: 10,
      });

      expect(result).toBe(feedResult);
      // tag-1 appears on both engaged stories (frequency 2) and should sort
      // ahead of tag-2 (frequency 1).
      expect(findApprovedFeedSpy).toHaveBeenCalledWith({
        cursor: 'abc',
        limit: 10,
        filters: {
          forYouTagIds: ['tag-1', 'tag-2'],
          excludeStoryIds: ['story-1', 'story-2'],
          excludeAuthorIds: ['reader-1'],
        },
      });
    });

    it('also excludes muted authors alongside the reader themselves', async () => {
      storyLikeRepository.find.mockResolvedValue([{story: {id: 'story-1'}}]);
      repository.find.mockResolvedValue([
        {id: 'story-1', tags: [{id: 'tag-1'}]},
      ]);
      mutesService.mutedAuthorIds.mockResolvedValue(['muted-1', 'muted-2']);

      const feedResult = {data: [], nextCursor: null, total: 0};
      const findApprovedFeedSpy = jest
        .spyOn(service, 'findApprovedFeed')
        .mockResolvedValue(feedResult);

      await service.findForYouFeed('reader-1', {});

      expect(findApprovedFeedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            excludeAuthorIds: ['reader-1', 'muted-1', 'muted-2'],
          }),
        })
      );
    });
  });
});
