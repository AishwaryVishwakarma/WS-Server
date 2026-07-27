import {Expose, Transform, Type} from 'class-transformer';
import type {StoryStatus} from '../enums/story-status.enum';
import type {Story} from '../entities/story.entity';
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
 * [public] — a story's own series membership: which series, and where in
 * it. Combines the `series` relation (id/title) with the sibling
 * `seriesPosition` column via the `@Transform` below, since they don't live
 * on the same entity.
 */
export class StorySeriesResponseDto {
  @Expose() id: string;
  @Expose() title: string;
  @Expose() position: number | null;

  constructor(partial: Partial<StorySeriesResponseDto>) {
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

  // Populated only when the query loads the `series` relation (the reader's
  // single-story fetch and the series page's own listing) — omitted on bulk
  // feed listings, which don't join it.
  @Expose()
  @Transform(({obj}: {obj: Story}) =>
    obj.series
      ? new StorySeriesResponseDto({
          id: obj.series.id,
          title: obj.series.title,
          position: obj.seriesPosition,
        })
      : undefined
  )
  series?: StorySeriesResponseDto;

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
  /** Member reports; drives the admin ?reported=true queue ordering. */
  @Expose() reportCount: number;

  constructor(partial: Partial<StoryResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}
