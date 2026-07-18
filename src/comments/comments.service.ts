import {
  BadRequestException,
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
import {Story} from 'src/stories/entities/story.entity';
import {Comment} from './entities/comment.entity';
import {CommentReport} from './entities/comment-report.entity';
import {getPaginatedResponse, paginate} from 'src/utils/pagination';
import {UsersService} from 'src/users/users.service';
import {Role} from 'src/users/enums/role';
import {handleQueryFailedError} from 'src/utils/handle-query-error';
import {NotificationsService} from 'src/notifications/notifications.service';

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

    @InjectRepository(CommentReport)
    private readonly reportsRepository: Repository<CommentReport>,

    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,

    @Inject(forwardRef(() => StoriesService))
    private readonly storiesService: StoriesService,

    private readonly notificationsService: NotificationsService
  ) {}

  private async _findOrThrow(id: string) {
    const comment = await this.commentsRepository.findOne({
      where: {id},
      relations: ['user', 'story'],
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

  async create(createCommentDto: CreateCommentDto, userId: string, role: Role) {
    // findOneVisible blocks commenting on stories the user can't see
    // (pending/rejected/flagged stories that aren't theirs).
    const story = await this.storiesService.findOneVisible(
      createCommentDto.storyId,
      userId,
      role
    );
    const user = await this.usersService.findOne(userId);

    const parent = createCommentDto.parentId
      ? await this._resolveReplyParent(createCommentDto.parentId, story.id)
      : null;

    const comment = this.commentsRepository.create({
      content: createCommentDto.content,
      story,
      user,
      parent,
    });

    const saved = await this.commentsRepository.save(comment);

    await this.commentsRepository.manager.increment(
      Story,
      {id: story.id},
      'commentCount',
      1
    );

    await this._notify(parent, story, user, saved.id, userId);

    return saved;
  }

  // Fire the right notification for a new comment. A reply notifies the parent
  // thread's author; a top-level comment notifies the story's author. In both
  // cases we skip self-actions and recipients who were since removed.
  private async _notify(
    parent: Comment | null,
    story: Story,
    actor: {name: string},
    commentId: string,
    actorId: string
  ) {
    if (parent) {
      if (parent.user && parent.user.id !== actorId) {
        await this.notificationsService.createNotification({
          type: 'reply',
          recipientId: parent.user.id,
          actorName: actor.name,
          storyId: story.id,
          storyTitle: story.title,
          commentId,
          parentId: parent.id,
        });
      }
      return;
    }

    if (
      story.author &&
      !story.author.deletedAt &&
      story.author.id !== actorId
    ) {
      await this.notificationsService.createNotification({
        type: 'comment',
        recipientId: story.author.id,
        actorName: actor.name,
        storyId: story.id,
        storyTitle: story.title,
        commentId,
        parentId: null,
      });
    }
  }

  // Resolve the effective parent for a reply. Enforces that the target lives on
  // the same story, and keeps threading one level deep by re-rooting a reply
  // aimed at another reply onto its top-level parent.
  private async _resolveReplyParent(parentId: string, storyId: string) {
    const target = await this.commentsRepository.findOne({
      where: {id: parentId},
      // `user`/`parent.user` so the caller can notify the parent's author.
      relations: ['story', 'parent', 'user', 'parent.user'],
    });

    if (!target) {
      throw new NotFoundException(`Comment with ID ${parentId} not found`);
    }
    if (target.story.id !== storyId) {
      throw new BadRequestException(
        `Cannot reply to a comment from a different story`
      );
    }

    return target.parent ?? target;
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    search?: string,
    flagged?: boolean
  ) {
    const {skip, take} = paginate(page, limit);

    const qb = this.commentsRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.user', 'user')
      .leftJoin('comment.story', 'story')
      .addSelect(STORY_SELECTED_FIELDS)
      .skip(skip)
      .take(take);

    // The moderation queue: only reported comments, most-reported first so the
    // worst offenders surface at the top. Otherwise the full list, newest first.
    if (flagged) {
      qb.where('comment.isFlagged = :isFlagged', {isFlagged: true})
        .orderBy('comment.reportCount', 'DESC')
        .addOrderBy('comment.createdAt', 'DESC');
    } else {
      qb.orderBy('comment.createdAt', 'DESC');
    }

    if (search) {
      const escaped = search.replace(/[\\%_]/g, '\\$&');
      qb.andWhere('comment.content LIKE :search', {search: `%${escaped}%`});
    }

    const [comments, total] = await qb.getManyAndCount();

    return getPaginatedResponse<Comment>(comments, total, page, limit);
  }

  // A member flags a comment for moderation. The unique (user, comment)
  // constraint blocks double-reporting (mapped to 409); the denormalized
  // reportCount is recomputed from the rows so it can never drift.
  async report(commentId: string, userId: string) {
    const comment = await this._findOrThrow(commentId);

    if (comment.user.id === userId) {
      throw new BadRequestException(`You cannot report your own comment`);
    }

    const user = await this.usersService.findOne(userId);

    try {
      await this.reportsRepository.save(
        this.reportsRepository.create({comment, user})
      );
    } catch (error) {
      handleQueryFailedError(error, 'report comment');
    }

    const reportCount = await this.reportsRepository.countBy({
      comment: {id: commentId},
    });

    // A report is moderation metadata, not a content edit — persist it with a
    // targeted update that carries the existing updatedAt, so it never trips
    // the client's "edited" indicator. (TypeORM only auto-bumps the update-date
    // column when it isn't among the columns being set.)
    await this.commentsRepository.update(commentId, {
      isFlagged: true,
      reportCount,
      updatedAt: comment.updatedAt,
    });

    comment.isFlagged = true;
    comment.reportCount = reportCount;
    return comment;
  }

  // Admin dismisses the reports on a comment (without deleting the comment):
  // drop the report rows and clear the flag so it leaves the queue.
  async resolve(commentId: string) {
    const comment = await this._findOrThrow(commentId);

    await this.reportsRepository.delete({comment: {id: commentId}});

    // Same as report(): clearing the flag is not an edit, so preserve updatedAt.
    await this.commentsRepository.update(commentId, {
      isFlagged: false,
      reportCount: 0,
      updatedAt: comment.updatedAt,
    });

    comment.isFlagged = false;
    comment.reportCount = 0;
    return comment;
  }

  async findAllByStoryId(
    storyId: string,
    page: number = 1,
    limit: number = 20
  ) {
    const {skip, take} = paginate(page, limit);

    // Top-level comments only; replies are fetched on demand via findReplies.
    // replyCount is loaded per row so the client can render a "view replies"
    // affordance without a denormalized counter to keep in sync.
    const [comments, total] = await this.commentsRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.user', 'user')
      .loadRelationCountAndMap('comment.replyCount', 'comment.replies')
      .where('comment.story = :storyId', {storyId})
      .andWhere('comment.parent IS NULL')
      .orderBy('comment.createdAt', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return getPaginatedResponse<Comment>(comments, total, page, limit);
  }

  async findReplies(parentId: string, page: number = 1, limit: number = 50) {
    const {skip, take} = paginate(page, limit);

    // Replies read best oldest-first (the conversation flows downward).
    const [replies, total] = await this.commentsRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.user', 'user')
      .where('comment.parent = :parentId', {parentId})
      .orderBy('comment.createdAt', 'ASC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return getPaginatedResponse<Comment>(replies, total, page, limit);
  }

  async findAllByUserId(
    userId: string,
    page: number = 1,
    limit: number = 20,
    search?: string
  ) {
    const {skip, take} = paginate(page, limit);

    // An activity feed of the member's own comments: each carries its story
    // (for an in-context link) plus replyCount (engagement on comments they
    // started) and parentId (null = they started the thread, set = it's their
    // reply). The story is joined but not selected wholesale — only the preview
    // fields, so nothing sensitive rides along.
    const qb = this.commentsRepository
      .createQueryBuilder('comment')
      .innerJoin('comment.user', 'user')
      .leftJoin('comment.story', 'story')
      .addSelect(STORY_SELECTED_FIELDS)
      .loadRelationCountAndMap('comment.replyCount', 'comment.replies')
      .loadRelationIdAndMap('comment.parentId', 'comment.parent')
      .where('user.id = :userId', {userId})
      .skip(skip)
      .take(take)
      .orderBy('comment.createdAt', 'DESC');

    if (search) {
      const escaped = search.replace(/[\\%_]/g, '\\$&');
      qb.andWhere('comment.content LIKE :search', {search: `%${escaped}%`});
    }

    const [comments, total] = await qb.getManyAndCount();

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

    // A top-level comment cascades to its replies at the DB level, so the
    // story's commentCount must shed all of them, not just this one row.
    const replyCount = await this.commentsRepository.count({
      where: {parent: {id}},
    });

    const result = await this.commentsRepository.delete(id);

    await this.commentsRepository.manager.decrement(
      Story,
      {id: comment.story.id},
      'commentCount',
      1 + replyCount
    );

    return result;
  }
}
