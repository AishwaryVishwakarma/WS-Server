import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {StoriesService} from 'src/stories/stories.service';
import {CommentsService} from 'src/comments/comments.service';
import {Comment} from 'src/comments/entities/comment.entity';
import type {Role} from 'src/users/enums/role';
import {CommentReaction} from './entities/comment-reaction.entity';

@Injectable()
export class CommentReactionsService {
  constructor(
    @InjectRepository(CommentReaction)
    private readonly reactionsRepository: Repository<CommentReaction>,
    private readonly commentsService: CommentsService,
    private readonly storiesService: StoriesService
  ) {}

  // React to a comment. Validates the comment exists (findOne 404s
  // otherwise) and that its parent story is still visible to the requester
  // (findOneVisible 404s otherwise), then upserts — the unique
  // (user, comment) constraint makes a repeat reaction a no-op, so the
  // denormalized comment.reactionCount only moves on a genuinely new
  // reaction. Deliberately no notification — a popular comment could rack
  // up many reactions in quick succession, and notifying per-reaction would
  // spam its author far more than a single story-level like ever would.
  async react(userId: string, commentId: string, role?: Role): Promise<void> {
    const comment = await this.commentsService.findOne(commentId);
    await this.storiesService.findOneVisible(comment.story.id, userId, role);

    const exists = await this.reactionsRepository.existsBy({
      user: {id: userId},
      comment: {id: commentId},
    });
    if (exists) return;

    await this.reactionsRepository.save(
      this.reactionsRepository.create({
        user: {id: userId},
        comment: {id: commentId},
      })
    );
    await this.reactionsRepository.manager.increment(
      Comment,
      {id: commentId},
      'reactionCount',
      1
    );
  }

  // Remove a reaction. Decrements the counter only when a row was actually
  // deleted, so a repeat un-react is a safe no-op.
  async unreact(userId: string, commentId: string): Promise<void> {
    const result = await this.reactionsRepository.delete({
      user: {id: userId},
      comment: {id: commentId},
    });
    if (result.affected) {
      await this.reactionsRepository.manager.decrement(
        Comment,
        {id: commentId},
        'reactionCount',
        1
      );
    }
  }

  // The ids of comments the member has reacted to — fetched once so comment
  // rows can show reaction state without the hot comments query joining
  // per-viewer.
  async reactedIds(userId: string): Promise<string[]> {
    const rows = await this.reactionsRepository
      .createQueryBuilder('reaction')
      .select('reaction.commentId', 'commentId')
      .where('reaction.user = :userId', {userId})
      .getRawMany<{commentId: string}>();

    return rows.map((row) => row.commentId);
  }
}
