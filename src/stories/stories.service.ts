import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {CreateStoryDto} from './dto/create-story.dto';
import {UpdateStoryDto} from './dto/update-story.dto';
import {InjectRepository} from '@nestjs/typeorm';
import {Story} from './entities/story.entity';
import {Repository} from 'typeorm';
import {getPaginatedResponse, paginate} from 'src/utils/pagination';
import {TagsService} from 'src/tags/tags.service';
import {Role} from 'src/users/enums/role';
import {UsersService} from 'src/users/users.service';

const SELECTED_FIELDS = {
  id: true,
  title: true,
  coverImageUrl: true,
  scareLevel: true,
  isFlagged: true,
  status: true,
  excerpt: true,
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

    const isOwner = story.author.id === userId;

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
    const {tags: tagIds, excerpt, ...rest} = createStoryDto;

    const author = await this.usersService.findOne(userId);

    const story = this.storiesRepository.create({
      ...rest,
      excerpt: excerpt || rest.content.slice(0, 280) + '...',
      author,
    });

    if (tagIds?.length) {
      story.tags = await this._getTagsIfExists(tagIds);
    }

    return this.storiesRepository.save(story);
  }

  async findAll(page: number = 1, limit: number = 20) {
    const {skip, take} = paginate(page, limit);

    const [stories, total] = await this.storiesRepository.findAndCount({
      skip,
      take,
      relations: ['author', 'tags'],
      select: SELECTED_FIELDS,
    });

    return getPaginatedResponse<Story>(stories, total, page, limit);
  }

  async findAllByUserId(userId: string, page: number = 1, limit: number = 20) {
    const {skip, take} = paginate(page, limit);

    const [stories, total] = await this.storiesRepository.findAndCount({
      where: {author: {id: userId}},
      relations: ['tags'],
      skip,
      take,
      select: SELECTED_FIELDS,
    });

    return getPaginatedResponse<Story>(stories, total, page, limit);
  }

  async findOne(id: string) {
    return await this.storiesRepository
      .findOneOrFail({
        where: {id},
        relations: ['author', 'tags'],
      })
      .catch(() => {
        throw new NotFoundException(`Story with ID ${id} not found`);
      });
  }

  async update(
    id: string,
    updateStoryDto: UpdateStoryDto,
    userId: string,
    role: Role
  ) {
    const story = await this._getStoryIfAuthorized(id, userId, role);

    const {tags: tagIds, ...rest} = updateStoryDto;

    if (tagIds?.length) {
      story.tags = await this._getTagsIfExists(tagIds);
    }

    Object.assign(story, rest);
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
