import {Expose, Transform, Type} from 'class-transformer';
import type {StoryStatus} from '../enums/story-status.enum';
import type {StoryReportReason} from '../enums/story-report-reason.enum';
import type {ContentWarning} from '../enums/content-warning.enum';
import type {Story} from '../entities/story.entity';
import type {MembershipTier} from 'src/users/enums/membership-tier.enum';
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
  // Drives the member badge/avatar ring on the byline — exposed
  // unconditionally, same as UserPreviewResponseDto's own field.
  @Expose() membershipTier: MembershipTier;

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
  /** Safety labels the reader should see before/while reading — a fixed
   *  vocabulary, distinct from `tags`. */
  @Expose() contentWarnings: ContentWarning[];
  @Expose() excerpt: string;
  @Expose() wordCount: number;
  @Expose() commentCount: number;
  @Expose() viewCount: number;
  @Expose() likeCount: number;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  // Reader-voted "how scary was this, really?" aggregate — distinct from the
  // author's own self-assigned scareLevel above. Derived here (not stored)
  // from the sum/count columns, mirroring how StorySeriesResponseDto combines
  // story.series with the sibling seriesPosition column.
  @Expose()
  @Transform(({obj}: {obj: Story}) =>
    obj.scareRatingCount > 0
      ? Math.round((obj.scareRatingSum / obj.scareRatingCount) * 10) / 10
      : null
  )
  scareRatingAverage: number | null;

  @Expose() scareRatingCount: number;

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
  /** Set only when status is rejected (see StoriesService.updateStatus) —
   *  a rejected story is only ever visible here to its own author/an admin. */
  @Expose() rejectionReason?: string | null;
  /** Set when the author timed the story's debut for later — a story with a
   *  future scheduledFor is only ever visible here to its own author/an
   *  admin (see StoriesService.findOneVisible). */
  @Expose() scheduledFor?: Date | null;

  // `author` is inherited from StoryPreviewResponseDto.

  constructor(partial: Partial<StoryWithAuthorPreviewResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}

/**
 * [admin] — one report against a story: the reporter's own reason/detail.
 * Only populated on the single-story admin fetch (see
 * StoriesService.findOneWithReports), never the paginated moderation list.
 */
export class StoryReportResponseDto {
  @Expose() id: string;
  @Expose() reason: StoryReportReason;
  @Expose() details?: string;
  @Expose() createdAt: Date;

  @Expose()
  @Type(() => StoryAuthorResponseDto)
  user: StoryAuthorResponseDto;

  constructor(partial: Partial<StoryReportResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * [private, admin] — a snapshot of a story's content from before a past edit.
 * View-only in v1 (no restore). Only ever fetched for the story's own
 * author/an admin (see StoriesService.findRevisions).
 */
export class StoryRevisionResponseDto {
  @Expose() id: string;
  @Expose() title: string;
  @Expose() excerpt: string;
  @Expose() content: string;
  @Expose() coverImageUrl?: string;
  @Expose() contentWarnings: string;
  @Expose() tagNames: string[];
  @Expose() statusBefore: StoryStatus;
  @Expose() createdAt: Date;

  constructor(partial: Partial<StoryRevisionResponseDto>) {
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
  /** Set only when status is rejected — cleared on every other transition. */
  @Expose() rejectionReason?: string | null;
  /** Set when the author timed the story's debut for later — see
   *  StoryWithAuthorPreviewResponseDto. */
  @Expose() scheduledFor?: Date | null;
  /** Member reports; drives the admin ?reported=true queue ordering. */
  @Expose() reportCount: number;

  /** The individual reports against this story — see StoryReportResponseDto. */
  @Expose()
  @Type(() => StoryReportResponseDto)
  reports?: StoryReportResponseDto[];

  constructor(partial: Partial<StoryResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}
