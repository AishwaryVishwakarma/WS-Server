import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {CreateCommentDto} from './dto/create-comment.dto';
import {UpdateCommentDto} from './dto/update-comment.dto';
import {InjectRepository} from '@nestjs/typeorm';
import type {Repository} from 'typeorm';
import {StoriesService} from 'src/stories/stories.service';
import {Comment} from './entities/comment.entity';
import {getPaginatedResponse, paginate} from 'src/utils/pagination';
import {UsersService} from 'src/users/users.service';
import {Role} from 'src/users/enums/role';

const STORY_SELECTED_FIELDS = [
  'story.id',
  'story.title',
  'story.excerpt',
  'story.coverImageUrl',
  'story.scareLevel',
  'story.createdAt',
  'story.updatedAt',
  'story.isFlagged',
  'story.status',
];

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,

    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,

    @Inject(forwardRef(() => StoriesService))
    private readonly storiesService: StoriesService
  ) {}

  private async _findOrThrow(id: string) {
    const comment = await this.commentsRepository.findOne({
      where: {id},
      relations: ['user'],
    });
    if (!comment)
      throw new NotFoundException(`Comment with ID ${id} not found`);
    return comment;
  }

  private _authorize(ownerId: string, requesterId: string, role: Role) {
    if (role !== Role.Admin && ownerId !== requesterId) {
      throw new ForbiddenException(
        `You do not have permission to perform this action`
      );
    }
  }

  async create(createCommentDto: CreateCommentDto, userId: string) {
    const story = await this.storiesService.findOne(createCommentDto.storyId);
    const user = await this.usersService.findOne(userId);

    const comment = this.commentsRepository.create({
      content: createCommentDto.content,
      story,
      user,
    });

    return this.commentsRepository.save(comment);
  }

  async findAll(page: number = 1, limit: number = 20) {
    const {skip, take} = paginate(page, limit);

    const [comments, total] = await this.commentsRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.user', 'user')
      .leftJoin('comment.story', 'story')
      .addSelect(STORY_SELECTED_FIELDS)
      .skip(skip)
      .take(take)
      .orderBy('comment.createdAt', 'DESC')
      .getManyAndCount();

    return getPaginatedResponse<Comment>(comments, total, page, limit);
  }

  async findAllByStoryId(
    storyId: string,
    page: number = 1,
    limit: number = 20
  ) {
    const {skip, take} = paginate(page, limit);

    const [comments, total] = await this.commentsRepository.findAndCount({
      where: {story: {id: storyId}},
      relations: ['user'],
      skip,
      take,
    });

    return getPaginatedResponse<Comment>(comments, total, page, limit);
  }

  async findAllByUserId(userId: string, page: number = 1, limit: number = 20) {
    const {skip, take} = paginate(page, limit);

    const [comments, total] = await this.commentsRepository
      .createQueryBuilder('comment')
      .innerJoin('comment.user', 'user')
      .leftJoin('comment.story', 'story')
      .addSelect(STORY_SELECTED_FIELDS)
      .where('user.id = :userId', {userId})
      .skip(skip)
      .take(take)
      .orderBy('comment.createdAt', 'DESC')
      .getManyAndCount();

    return getPaginatedResponse<Comment>(comments, total, page, limit);
  }

  async findOne(id: string) {
    const comment = await this.commentsRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.user', 'user')
      .leftJoin('comment.story', 'story')
      .addSelect(STORY_SELECTED_FIELDS)
      .where('comment.id = :id', {id})
      .getOne();

    if (!comment) {
      throw new NotFoundException(`Comment with ID ${id} not found`);
    }

    return comment;
  }

  async update(
    id: string,
    updateCommentDto: UpdateCommentDto,
    userId: string,
    role: Role
  ) {
    const comment = await this._findOrThrow(id);
    this._authorize(comment.user.id, userId, role);

    Object.assign(comment, updateCommentDto);
    return await this.commentsRepository.save(comment);
  }

  async remove(id: string, userId: string, role: Role) {
    const comment = await this._findOrThrow(id);
    this._authorize(comment.user.id, userId, role);

    return this.commentsRepository.delete(id);
  }
}
