import {ForbiddenException, NotFoundException} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import {TagsService} from 'src/tags/tags.service';
import {Role} from 'src/users/enums/role';
import {UsersService} from 'src/users/users.service';
import {Story} from './entities/story.entity';
import {StoryStatus} from './enums/story-status.enum';
import {StoriesService} from './stories.service';

describe('StoriesService', () => {
  let service: StoriesService;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    count: jest.Mock;
    findAndCount: jest.Mock;
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    increment: jest.Mock;
    delete: jest.Mock;
  };
  let usersService: {findOne: jest.Mock};
  let tagsService: {findManyByIds: jest.Mock};

  const author = {id: 'author-1'};

  beforeEach(async () => {
    repository = {
      create: jest.fn((data) => data),
      save: jest.fn((story) => Promise.resolve(story)),
      // Publish-limit probe (_assertWithinPublishLimit) — under the free cap.
      count: jest.fn().mockResolvedValue(0),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      increment: jest.fn().mockResolvedValue({affected: 1}),
      delete: jest.fn(),
    };
    usersService = {findOne: jest.fn().mockResolvedValue(author)};
    tagsService = {findManyByIds: jest.fn()};

    const module = await Test.createTestingModule({
      providers: [
        StoriesService,
        {provide: getRepositoryToken(Story), useValue: repository},
        {provide: UsersService, useValue: usersService},
        {provide: TagsService, useValue: tagsService},
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

    it('keeps isFlagged in sync when flagging', async () => {
      const story = await service.updateStatus('story-1', StoryStatus.Flagged);

      expect(story.status).toBe(StoryStatus.Flagged);
      expect(story.isFlagged).toBe(true);
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
});
