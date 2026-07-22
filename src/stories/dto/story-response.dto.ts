import {Expose, Type} from 'class-transformer';
import type {StoryStatus} from '../enums/story-status.enum';
import {TagResponseDto} from 'src/tags/dto/tag-response.dto';

/**
 * [public] — the byline author on a story listing/detail. A deliberately slim
 * projection: cards and the reader only render the name, avatar, and profile
 * link, so `bio`/`isVerified`/timestamps don't ride along on every card.
 */
export class StoryAuthorResponseDto {
  @Expose() id: string;
  @Expose() name: string;
  @Expose() profileImageUrl?: string;

  constructor(partial: Partial<StoryAuthorResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * [public]
 */
export class StoryPreviewResponseDto {
  @Expose() id: string;
  @Expose() title: string;
  @Expose() coverImageUrl?: string;
  @Expose() scareLevel: number;
  @Expose() excerpt: string;
  @Expose() wordCount: number;
  @Expose() commentCount: number;
  @Expose() viewCount: number;
  @Expose() likeCount: number;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  @Expose()
  @Type(() => TagResponseDto)
  tags: TagResponseDto[];

  // Populated when the query loads the author relation (public GET /stories).
  // Omitted where it isn't (e.g. an author's own listing, where it's redundant)
  // and null for stories whose author was soft-deleted.
  @Expose()
  @Type(() => StoryAuthorResponseDto)
  author?: StoryAuthorResponseDto;

  constructor(partial: Partial<StoryPreviewResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * [public] — status is exposed but harmless: anonymous readers only ever see
 * approved stories (findOneVisible 404s the rest), while authors reading
 * their own work need it to know draft/pending/rejected state.
 */
export class StoryWithAuthorPreviewResponseDto extends StoryPreviewResponseDto {
  @Expose() content: string;
  @Expose() status: StoryStatus;

  // `author` is inherited from StoryPreviewResponseDto.

  constructor(partial: Partial<StoryWithAuthorPreviewResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}

/**
 * [private, admin]
 */
export class StoryResponseDto extends StoryPreviewResponseDto {
  @Expose() content: string;
  @Expose() isFlagged: boolean;
  @Expose() status: StoryStatus;

  constructor(partial: Partial<StoryResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}
