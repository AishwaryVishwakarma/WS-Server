import {Injectable, NotFoundException} from '@nestjs/common';
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

  async create(createStoryDto: CreateStoryDto) {
    const {authorId, ...rest} = createStoryDto;

    const author = await this.usersService.findOne(authorId);

    const story = this.storiesRepository.create({
      ...rest,
      author,
    });

    return this.storiesRepository.save(story);
  }

  async findAll(page: number = 1, limit: number = 20) {
    const {skip, take} = paginate(page, limit);

    const [stories, total] = await this.storiesRepository.findAndCount({
      skip,
      take,
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
    const story = await this.storiesRepository.findOneBy({id});

    if (!story) {
      throw new NotFoundException(`Story with ID ${id} not found`);
    }

    return story;
  }

  async update(id: string, updateStoryDto: UpdateStoryDto) {
    const user = await this.findOne(id);

    Object.assign(user, updateStoryDto);
    return await this.storiesRepository.save(user);
  }

  async remove(id: string) {
    const result = await this.storiesRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
  }
}
