import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {CreateStoryDto} from './dto/create-story.dto';
import {UpdateStoryDto} from './dto/update-story.dto';
import {InjectRepository} from '@nestjs/typeorm';
import {Story} from './entities/story.entity';
import {Like, Not, Repository, type FindOptionsWhere} from 'typeorm';
import {getPaginatedResponse, paginate} from 'src/utils/pagination';
import {TagsService} from 'src/tags/tags.service';
import {Role} from 'src/users/enums/role';
import {UsersService} from 'src/users/users.service';
import {StoryStatus} from './enums/story-status.enum';
import type {StorySortOption} from './dto/story-query.dto';

interface StoryFilters {
  tag?: string;
  search?: string;
  scareLevel?: number;
  sort?: StorySortOption;
}

const SELECTED_FIELDS = {
  id: true,
  title: true,
  coverImageUrl: true,
  scareLevel: true,
  isFlagged: true,
  status: true,
  excerpt: true,
  wordCount: true,
  commentCount: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class StoriesService {
  constructor(
    @InjectRepository(Story)
    private readonly storiesRepository: Repository<Story>,
    private readonly usersService: UsersService,
    private readonly tagsService: TagsService
  ) {}

  private async _getStoryIfAuthorized(
    storyId: string,
    userId: string,
    role: Role
  ): Promise<Story> {
    const story = await this.findOne(storyId);

    const isOwner = story.author?.id === userId;

    if (!isOwner && role !== Role.Admin) {
      throw new ForbiddenException(
        `You do not have permission to modify this story`
      );
    }

    return story;
  }

  private async _getTagsIfExists(tagIds: string[]) {
    const tags = await this.tagsService.findManyByIds(tagIds);

    if (tags.length !== tagIds.length) {
      throw new NotFoundException('One or more tags not found');
    }

    return tags;
  }

  async create(createStoryDto: CreateStoryDto, userId: string) {
    const {tags: tagIds, excerpt, draft, ...rest} = createStoryDto;

    const author = await this.usersService.findOne(userId);

    const story = this.storiesRepository.create({
      ...rest,
      excerpt: excerpt || rest.content.slice(0, 280) + '...',
      status: draft ? StoryStatus.Draft : StoryStatus.Pending,
      author,
    });

    if (tagIds?.length) {
      story.tags = await this._getTagsIfExists(tagIds);
    }

    return this.storiesRepository.save(story);
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    status?: StoryStatus,
    search?: string
  ) {
    const {skip, take} = paginate(page, limit);

    // Drafts are the author's private business — never listed for admins
    const base: FindOptionsWhere<Story> = status
      ? {status}
      : {status: Not(StoryStatus.Draft)};
    let where: FindOptionsWhere<Story> | FindOptionsWhere<Story>[] = base;

    if (search) {
      const like = Like(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
      where = [
        {...base, title: like},
        {...base, excerpt: like},
      ];
    }

    const [stories, total] = await this.storiesRepository.findAndCount({
      skip,
      take,
      where,
      relations: ['author', 'tags'],
      select: SELECTED_FIELDS,
      order: {createdAt: 'DESC'},
      // Admins should see stories whose authors were soft-deleted
      withDeleted: true,
    });

    return getPaginatedResponse<Story>(stories, total, page, limit);
  }

  async findAllApprovedByUserId(
    userId: string,
    page: number = 1,
    limit: number = 20
  ) {
    const {skip, take} = paginate(page, limit);

    const [stories, total] = await this.storiesRepository.findAndCount({
      where: {author: {id: userId}, status: StoryStatus.Approved},
      relations: ['tags'],
      skip,
      take,
      select: SELECTED_FIELDS,
      order: {createdAt: 'DESC'},
    });

    return getPaginatedResponse<Story>(stories, total, page, limit);
  }

  async findAllByUserId(
    userId: string,
    page: number = 1,
    limit: number = 20,
    search?: string,
    status?: StoryStatus
  ) {
    const {skip, take} = paginate(page, limit);

    const base: FindOptionsWhere<Story> = {
      author: {id: userId},
      ...(status ? {status} : {}),
    };
    let where: FindOptionsWhere<Story> | FindOptionsWhere<Story>[] = base;

    if (search) {
      const like = Like(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
      where = [
        {...base, title: like},
        {...base, excerpt: like},
      ];
    }

    const [stories, total] = await this.storiesRepository.findAndCount({
      where,
      relations: ['tags'],
      skip,
      take,
      select: SELECTED_FIELDS,
      order: {createdAt: 'DESC'},
    });

    return getPaginatedResponse<Story>(stories, total, page, limit);
  }

  async findOne(id: string) {
    return await this.storiesRepository
      .findOneOrFail({
        where: {id},
        relations: ['author', 'tags'],
        // Include soft-deleted authors so a story by a removed user stays
        // readable instead of null-ing out author and throwing.
        withDeleted: true,
      })
      .catch(() => {
        throw new NotFoundException(`Story with ID ${id} not found`);
      });
  }

  // Public read: non-approved stories are visible only to their author and
  // admins. Others — including anonymous visitors — get a 404 (not 403) so
  // story existence isn't leaked.
  async findOneVisible(id: string, userId?: string, role?: Role) {
    const story = await this.findOne(id);

    const isOwner = userId !== undefined && story.author?.id === userId;

    if (
      story.status !== StoryStatus.Approved &&
      !isOwner &&
      role !== Role.Admin
    ) {
      throw new NotFoundException(`Story with ID ${id} not found`);
    }

    return story;
  }

  async findAllApproved(
    page: number = 1,
    limit: number = 20,
    filters: StoryFilters = {}
  ) {
    const {skip, take} = paginate(page, limit);
    const {tag, search, scareLevel, sort} = filters;

    const qb = this.storiesRepository
      .createQueryBuilder('story')
      .select(Object.keys(SELECTED_FIELDS).map((field) => `story.${field}`))
      .leftJoinAndSelect('story.author', 'author')
      .leftJoinAndSelect('story.tags', 'tags')
      .where('story.status = :status', {status: StoryStatus.Approved})
      .skip(skip)
      .take(take)
      // Same rationale as findOne: keep stories by soft-deleted authors.
      .withDeleted();

    if (sort === 'most-commented') {
      qb.orderBy('story.commentCount', 'DESC').addOrderBy(
        'story.createdAt',
        'DESC'
      );
    } else {
      qb.orderBy('story.createdAt', sort === 'oldest' ? 'ASC' : 'DESC');
    }

    if (tag) {
      // Second join purely as a filter — `tags` above still loads the story's
      // full tag list, not just the matched one.
      qb.innerJoin('story.tags', 'tagFilter', 'tagFilter.slug = :tagSlug', {
        tagSlug: tag,
      });
    }

    if (search) {
      const escaped = search.replace(/[\\%_]/g, '\\$&');
      qb.andWhere('(story.title LIKE :search OR story.excerpt LIKE :search)', {
        search: `%${escaped}%`,
      });
    }

    if (scareLevel) {
      qb.andWhere('story.scareLevel = :scareLevel', {scareLevel});
    }

    const [stories, total] = await qb.getManyAndCount();

    return getPaginatedResponse<Story>(stories, total, page, limit);
  }

  async update(
    id: string,
    updateStoryDto: UpdateStoryDto,
    userId: string,
    role: Role
  ) {
    const story = await this._getStoryIfAuthorized(id, userId, role);

    // `draft` only applies at creation; submission goes through submitDraft
    const {tags: tagIds, draft: _draft, ...rest} = updateStoryDto;

    if (tagIds?.length) {
      story.tags = await this._getTagsIfExists(tagIds);
    }

    Object.assign(story, rest);

    // A non-admin editing an already-moderated story sends it back to pending
    // so content changes can't bypass review. Drafts stay drafts — they were
    // never in moderation.
    const contentChanged =
      tagIds !== undefined ||
      rest.title !== undefined ||
      rest.content !== undefined ||
      rest.coverImageUrl !== undefined ||
      rest.excerpt !== undefined;

    if (
      contentChanged &&
      role !== Role.Admin &&
      story.status !== StoryStatus.Pending &&
      story.status !== StoryStatus.Draft
    ) {
      story.status = StoryStatus.Pending;
      story.isFlagged = false;
    }

    return await this.storiesRepository.save(story);
  }

  // Author action: move a private draft into the moderation queue
  async submitDraft(id: string, userId: string, role: Role) {
    const story = await this._getStoryIfAuthorized(id, userId, role);

    if (story.status !== StoryStatus.Draft) {
      throw new BadRequestException('Only drafts can be submitted for review');
    }

    story.status = StoryStatus.Pending;

    return await this.storiesRepository.save(story);
  }

  async updateStatus(id: string, status: StoryStatus) {
    const story = await this.findOne(id);

    story.status = status;
    story.isFlagged = status === StoryStatus.Flagged;

    return await this.storiesRepository.save(story);
  }

  async remove(id: string, userId: string, role: Role) {
    await this._getStoryIfAuthorized(id, userId, role);

    const result = await this.storiesRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Story with ID ${id} not found`);
    }
  }
}
