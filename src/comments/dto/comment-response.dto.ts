import {Expose, Transform, Type} from 'class-transformer';
import {UserPreviewResponseDto} from 'src/users/dto/user-response.dto';
import type {StoryStatus} from 'src/stories/enums/story-status.enum';

export class CommentPreviewResponseDto {
  @Expose() id: string;
  @Expose() content: string;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  // Present on top-level comments (mapped by loadRelationCountAndMap); omitted
  // on reply rows, which never carry their own replies.
  @Expose() replyCount?: number;

  @Expose()
  @Type(() => UserPreviewResponseDto)
  user: UserPreviewResponseDto;

  constructor(partial: Partial<CommentPreviewResponseDto>) {
    Object.assign(this, partial);
  }
}

// Compact story context embedded in a member's own comment activity, so the
// frontend can link back to (and group by) the story without a second fetch.
export class CommentStoryPreviewDto {
  @Expose() id: string;
  @Expose() title: string;
  @Expose() excerpt: string;
  @Expose() coverImageUrl?: string;
  @Expose() scareLevel: number;
  @Expose() status: StoryStatus;
}

/**
 * [self] GET /users/me/comments — the member's comment activity. Deliberately
 * omits `user` (it is always the caller) and the moderation fields
 * (reportCount/isFlagged) that live on the raw entity.
 */
export class MyCommentActivityResponseDto {
  @Expose() id: string;
  @Expose() content: string;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  // Engagement on a comment the member started; 0 on their own replies.
  @Expose() replyCount: number;

  // null = a top-level comment the member started; set = it is their reply to
  // that parent (so the frontend can render "you replied" vs "N replies").
  @Expose()
  @Transform(
    ({value}: {value: string | undefined}): string | null => value ?? null
  )
  parentId: string | null;

  @Expose()
  @Type(() => CommentStoryPreviewDto)
  story: CommentStoryPreviewDto;

  constructor(partial: Partial<MyCommentActivityResponseDto>) {
    Object.assign(this, partial);
  }
}
