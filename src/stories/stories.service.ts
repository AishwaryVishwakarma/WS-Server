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
import {paginate} from 'src/utils/pagination';
import {UsersService} from 'src/users/users.service';

@Injectable()
export class StoriesService {
  constructor(
    @InjectRepository(Story)
    private readonly storiesRepository: Repository<Story>,
    private readonly usersService: UsersService
  ) {}

  private async _getStoryIfAuthorized(
    storyId: string,
    userId: string,
    isAdmin: boolean
  ): Promise<Story> {
    const story = await this.findOne(storyId);

    const isOwner = story.author.id === userId;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        `You do not have permission to modify this story`
      );
    }

    return story;
  }

  async create(createStoryDto: CreateStoryDto, userId: string) {
    const author = await this.usersService.findOne(userId);

    const story = this.storiesRepository.create({
      ...createStoryDto,
      author,
    });

    return this.storiesRepository.save(story);
  }

  async findAll(page: number = 1, limit: number = 20) {
    const {skip, take} = paginate(page, limit);

    const [stories, total] = await this.storiesRepository.findAndCount({
      skip,
      take,
      select: {
        id: true,
        title: true,
        coverImageUrl: true,
        scareLevel: true,
        isFlagged: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      message: 'Success',
      data: stories,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const story = await this.storiesRepository.findOne({
      where: {id},
      relations: ['author'],
    });

    if (!story) {
      throw new NotFoundException(`Story with ID ${id} not found`);
    }

    return story;
  }

  async update(
    id: string,
    updateStoryDto: UpdateStoryDto,
    userId: string,
    isAdmin: boolean
  ) {
    const story = await this._getStoryIfAuthorized(id, userId, isAdmin);

    Object.assign(story, updateStoryDto);
    return await this.storiesRepository.save(story);
  }

  async remove(id: string, userId: string, isAdmin: boolean) {
    await this._getStoryIfAuthorized(id, userId, isAdmin);

    return await this.storiesRepository.delete(id);
  }
}
