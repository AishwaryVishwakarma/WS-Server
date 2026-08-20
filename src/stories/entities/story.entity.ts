import {User} from 'src/users/entities/user.entity';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {StoryStatus} from '../enums/story-status.enum';
import {ContentWarning} from '../enums/content-warning.enum';
import {Tag} from 'src/tags/entities/tag.entity';
import {Comment} from 'src/comments/entities/comment.entity';
import {StoryReport} from './story-report.entity';
import {StoryRevision} from './story-revision.entity';
import {Series} from 'src/series/entities/series.entity';
import {buildSlug} from 'src/utils/slug';

@Entity()
// The public feed filters status='approved' and sorts by createdAt (newest/
// oldest) or commentCount (most-commented); these composite indexes turn those
// hot listings from a full scan + filesort into an index range scan.
@Index('IDX_story_status_createdAt', ['status', 'createdAt'])
@Index('IDX_story_status_commentCount', ['status', 'commentCount'])
@Index('IDX_story_status_viewCount', ['status', 'viewCount'])
@Index('IDX_story_status_likeCount', ['status', 'likeCount'])
// Author shelves, following feeds, digest discovery, and author statistics all
// constrain author + status. Including the stable feed tie-breakers also lets
// Postgres satisfy newest/oldest author listings from this index.
@Index('IDX_story_author_status_createdAt_id', [
  'author',
  'status',
  'createdAt',
  'id',
])
// The admin reported-stories queue filters reportCount > 0 and sorts by it,
// independent of status — index it so the queue is a range scan, not a table
// scan.
@Index('IDX_story_reportCount', ['reportCount'])
// Moderation SLA cards count and age only pending stories. A partial index is
// smaller than a general status/updatedAt index and directly supports those
// oldest-first threshold scans.
@Index('IDX_story_pending_updatedAt', ['updatedAt'], {
  where: `"status" = 'pending'`,
})
// Backs the public feed's word/prefix search over the title and excerpt; see
// StoriesService and story-search.ts. Postgres has no FULLTEXT index type —
// this pairs with the `searchVector` generated column below, indexed with a
// hand-patched `USING GIN` in the migration (TypeORM's @Index has no
// first-class GIN option, so double-check the generated migration).
@Index('IDX_story_fulltext', ['searchVector'])
// Backs admin-analytics day-bucketed queries across all stories regardless of
// status. Explicitly named to match the raw SQL that created it in
// AddAnalyticsEvents — without this, migration:generate can't see the index
// in entity metadata and proposes dropping it every time.
@Index('IDX_story_createdAt', ['createdAt'])
export class Story {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({length: 255})
  title: string;

  // Derived from title on creation (see assignSlug below); StoriesService's
  // update() regenerates it when the title actually changes, since a plain
  // @BeforeUpdate hook would reshuffle the slug (and the public URL) on
  // every save, including edits that never touch the title.
  @Column({length: 100, unique: true})
  slug: string;

  @Column({length: 300})
  excerpt: string;

  @Column('text')
  content: string;

  @Column({type: 'varchar', length: 180, nullable: true})
  discussionPrompt: string | null;

  // Auto-maintained by Postgres on every insert/update (STORED generated
  // column) — no app-side sync code needed, same as the MySQL FULLTEXT index
  // it replaces. Title is weighted 'A' (highest) so title matches rank above
  // excerpt-only matches; see StoriesService's search query.
  @Column({
    type: 'tsvector',
    asExpression:
      `setweight(to_tsvector('english', coalesce(title, '')), 'A') || ` +
      `setweight(to_tsvector('english', coalesce(excerpt, '')), 'B')`,
    generatedType: 'STORED',
  })
  searchVector: string;

  // Explicit type is required for nullable union properties: TypeScript emits
  // Object as their design:type, which TypeORM cannot map to PostgreSQL.
  @Column({type: 'varchar', nullable: true})
  coverImageUrl: string | null;

  @Column({type: 'varchar', length: 36, nullable: true, select: false})
  coverImageFileId: string | null;

  @Column({type: 'int', default: 1})
  scareLevel: number;

  // A fixed, developer-owned safety vocabulary (see ContentWarning) — distinct
  // from `tags` (open-ended, admin-curated topics). Stored as a plain
  // comma-joined varchar rather than a join table; a custom transformer (not
  // TypeORM's `simple-array`, which is always `text` and can't take a
  // `length`) keeps the column a bounded `varchar(255)` for this small fixed
  // vocabulary.
  @Column({
    type: 'varchar',
    length: 255,
    default: '',
    transformer: {
      to: (value: ContentWarning[] = []) => value.join(','),
      // On insert, TypeORM may re-hydrate the entity from the in-memory
      // value it already had rather than a round-tripped DB string
      // (depends on whether the driver's insert used RETURNING) — `from`
      // has to handle either shape.
      from: (value: string | ContentWarning[]): ContentWarning[] => {
        if (Array.isArray(value)) return value;
        return value ? (value.split(',') as ContentWarning[]) : [];
      },
    },
  })
  contentWarnings: ContentWarning[];

  @Column({default: false})
  isFlagged: boolean;

  // Set whenever an admin rejects the story via the single-story status
  // transition (required there — see UpdateStoryStatusDto). Cleared on any
  // other status transition (including bulk, which never supplies one) so a
  // later re-rejection never shows a stale explanation.
  @Column({type: 'varchar', length: 500, nullable: true})
  rejectionReason: string | null;

  // Set when the author wants the story's public debut timed for later —
  // it still goes through the normal moderation queue, but even once
  // approved, stays invisible to everyone but its author/an admin until
  // this moment passes (checked at read time; see StoriesService's
  // findOneVisible/_buildApprovedQuery — no scheduler/cron involved).
  @Column({type: 'timestamp', nullable: true})
  scheduledFor: Date | null;

  @Column({type: 'timestamp', nullable: true})
  seriesNotifiedAt: Date | null;

  /** Kept in sync by the hook below; powers reading-time estimates. */
  @Column({type: 'int', default: 0})
  wordCount: number;

  /** Denormalized counter maintained by CommentsService (create/remove). */
  @Column({type: 'int', default: 0})
  commentCount: number;

  /** Denormalized read counter, bumped by StoriesService.recordView (deduped
   *  per viewer session, approved stories only, self-views excluded). */
  @Column({type: 'int', default: 0})
  viewCount: number;

  /** Denormalized like counter, maintained by LikesService (like/unlike). */
  @Column({type: 'int', default: 0})
  likeCount: number;

  // "Trending" (see StoriesService) engagement blend, generated so it can be
  // ordered/keyset-paged as a genuine `story.trendingScore` column reference
  // rather than a raw computed SQL expression — a real column is what lets
  // TypeORM's join+pagination machinery (which builds two separate queries
  // under the hood, each resolving order-by criteria differently) treat it
  // consistently; a raw expression aliased only in the SELECT list broke one
  // of the two. Comments weigh most (most effortful engagement), then likes,
  // then views — see TRENDING_WINDOW_DAYS for the recency half of "trending".
  @Column({
    type: 'int',
    asExpression: '"likeCount" * 3 + "commentCount" * 4 + "viewCount"',
    generatedType: 'STORED',
  })
  trendingScore: number;

  /** Sum of all reader scare-vote values; paired with scareRatingCount to
   *  derive the average at the DTO layer (see StoryPreviewResponseDto).
   *  Distinct from the author's own self-assigned `scareLevel` above —
   *  maintained by ScareRatingsService (cast/change/remove). */
  @Column({type: 'int', default: 0})
  scareRatingSum: number;

  @Column({type: 'int', default: 0})
  scareRatingCount: number;

  // Recomputed from the story_report rows on every report/resolve (see
  // StoriesService) — an orderable, drift-free mirror of the report count so
  // the admin queue can sort most-reported-first. Distinct from `isFlagged`
  // (which mirrors status === flagged, an admin decision): a member report
  // surfaces a story for review without changing its public status.
  @Column({type: 'int', default: 0})
  reportCount: number;

  @Column({
    type: 'enum',
    enum: StoryStatus,
    default: StoryStatus.Pending,
  })
  status: StoryStatus;

  @ManyToOne(() => User, (user) => user.stories, {
    onDelete: 'CASCADE',
  })
  author: User;

  @ManyToMany(() => Tag, (tag) => tag.stories, {
    cascade: true,
  })
  @JoinTable()
  tags: Tag[];

  @OneToMany(() => Comment, (comment) => comment.story)
  comments: Comment[];

  @OneToMany(() => StoryReport, (report) => report.story)
  reports: StoryReport[];

  @OneToMany(() => StoryRevision, (revision) => revision.story)
  revisions: StoryRevision[];

  // At most one series per story. Nullable — most stories are standalone;
  // SET NULL rather than CASCADE so a story never disappears just because
  // its series does (there's no delete-series endpoint in v1, but the FK
  // stays defensive).
  @ManyToOne(() => Series, (series) => series.stories, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  series: Series | null;

  // This story's 1-based order within `series`. Assigned once, when the
  // story is first attached to a series (see StoriesService); gaps from
  // later removals are fine since display only ever needs relative order,
  // never a contiguous count.
  @Column({type: 'int', nullable: true})
  seriesPosition: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  computeWordCount() {
    if (this.content !== undefined) {
      this.wordCount = this.content.trim()
        ? this.content.trim().split(/\s+/).length
        : 0;
    }
  }

  @BeforeInsert()
  assignSlug() {
    if (!this.slug) {
      this.slug = buildSlug(this.title, 'story');
    }
  }
}
