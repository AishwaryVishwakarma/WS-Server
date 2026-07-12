import {ConflictException, Injectable, NotFoundException} from '@nestjs/common';
import {CreateTagDto} from './dto/create-tag.dto';
import {UpdateTagDto} from './dto/update-tag.dto';
import {InjectRepository} from '@nestjs/typeorm';
import {Tag} from './entities/tag.entity';
import {In, Repository} from 'typeorm';
import {getPaginatedResponse, paginate} from 'src/utils/pagination';
import {handleQueryFailedError} from 'src/utils/handle-query-error';
import {StoryStatus} from 'src/stories/enums/story-status.enum';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagsRepository: Repository<Tag>
  ) {}

  async create(createTagDto: CreateTagDto) {
    const tag = this.tagsRepository.create(createTagDto);

    try {
      return await this.tagsRepository.save(tag);
    } catch (error) {
      handleQueryFailedError(error, 'create');
    }
  }

  async findAll(page: number = 1, limit: number = 50) {
    const {skip, take} = paginate(page, limit);

    // Counts publicly visible (approved) stories per tag instead of loading
    // the stories themselves
    const [tags, total] = await this.tagsRepository
      .createQueryBuilder('tag')
      .loadRelationCountAndMap('tag.storyCount', 'tag.stories', 'story', (qb) =>
        qb.andWhere('story.status = :approvedStatus', {
          approvedStatus: StoryStatus.Approved,
        })
      )
      .orderBy('tag.name', 'ASC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return getPaginatedResponse<Tag>(tags, total, page, limit);
  }

  async findOne(id: string) {
    return await this.tagsRepository.findOneByOrFail({id}).catch(() => {
      throw new NotFoundException(`Tag with ID ${id} not found`);
    });
  }

  // Public lookup: accepts either the UUID or the URL slug. Safe as a single
  // OR query because ids are UUIDs and slugs never look like one.
  async findOneByIdOrSlug(idOrSlug: string) {
    return await this.tagsRepository
      .findOneOrFail({where: [{id: idOrSlug}, {slug: idOrSlug}]})
      .catch(() => {
        throw new NotFoundException(`Tag '${idOrSlug}' not found`);
      });
  }

  async findManyByIds(ids: string[]) {
    if (!ids.length) {
      return [];
    }

    return this.tagsRepository.findBy({
      id: In(ids),
    });
  }

  async update(id: string, updateTagDto: UpdateTagDto) {
    const tag = await this.findOne(id);

    Object.assign(tag, updateTagDto);

    try {
      return await this.tagsRepository.save(tag);
    } catch (error) {
      handleQueryFailedError(error, 'update');
    }
  }

  async remove(id: string) {
    const tag = await this.tagsRepository.findOne({
      where: {id},
      relations: ['stories'],
    });

    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`);
    }

    if (tag.stories.length) {
      throw new ConflictException(
        `Tag with ID ${id} cannot be deleted because it is associated with stories`
      );
    }

    return await this.tagsRepository.delete(id);
  }
}
