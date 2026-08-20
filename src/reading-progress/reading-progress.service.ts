import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {StoriesService} from 'src/stories/stories.service';
import {StoryStatus} from 'src/stories/enums/story-status.enum';
import type {Role} from 'src/users/enums/role';
import {Story} from 'src/stories/entities/story.entity';
import {ReadingProgress} from './entities/reading-progress.entity';
import {User} from 'src/users/entities/user.entity';
import {SeasonalEventsService} from 'src/seasonal-events/seasonal-events.service';
import {SeasonalEventCompletion} from 'src/seasonal-events/entities/seasonal-event-completion.entity';

// Below this, a read barely started — don't bother persisting (and don't
// wipe an existing row just because the reader briefly scrolled back up to
// re-read something).
const MIN_PERCENT = 5;
// At or above this, the story is effectively finished. Keep the row as reading
// history, but exclude it from the "continue reading" query.
const COMPLETE_PERCENT = 95;

export interface ReadingProgressRow {
  story: Story;
  percent: number;
  updatedAt: Date;
}

export interface SeasonalEventUnlock {
  eventId: string;
  title: string;
}

@Injectable()
export class ReadingProgressService {
  constructor(
    @InjectRepository(ReadingProgress)
    private readonly readingProgressRepository: Repository<ReadingProgress>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(SeasonalEventCompletion)
    private readonly eventCompletionsRepository: Repository<SeasonalEventCompletion>,
    private readonly storiesService: StoriesService,
    private readonly seasonalEventsService: SeasonalEventsService
  ) {}

  async weeklyGoal(userId: string) {
    const now = new Date();
    const day = now.getUTCDay();
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    start.setUTCDate(start.getUTCDate() - daysSinceMonday);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);

    const [user, completed] = await Promise.all([
      this.usersRepository.findOneByOrFail({id: userId}),
      this.readingProgressRepository
        .createQueryBuilder('progress')
        .where('progress.userId = :userId', {userId})
        .andWhere('progress.percent >= :completePercent', {
          completePercent: COMPLETE_PERCENT,
        })
        .andWhere('progress.updatedAt >= :start', {start})
        .andWhere('progress.updatedAt < :end', {end})
        .getCount(),
    ]);

    return {
      goal: user.weeklyReadingGoal,
      completed,
      weekStartsAt: start,
      weekEndsAt: end,
    };
  }

  async updateWeeklyGoal(userId: string, goal: number) {
    await this.usersRepository.update(userId, {weeklyReadingGoal: goal});
    return this.weeklyGoal(userId);
  }

  async seasonalEvent(userId: string) {
    const event = await this.seasonalEventsService.active();
    if (!event) return null;
    const completed = await this.countSeasonalEventStories(userId, event);
    if (completed >= event.goal)
      await this.recordSeasonalEventCompletion(userId, event.id);
    return {...this.seasonalEventsService.view(event), completed};
  }

  private async countSeasonalEventStories(
    userId: string,
    event: NonNullable<Awaited<ReturnType<SeasonalEventsService['active']>>>
  ): Promise<number> {
    if (event.tags.length === 0) return 0;
    const result = await this.readingProgressRepository
      .createQueryBuilder('progress')
      .innerJoin('progress.story', 'story')
      .innerJoin('story.tags', 'tag')
      .select('COUNT(DISTINCT progress.storyId)', 'completed')
      .where('progress.userId = :userId', {userId})
      .andWhere('progress.percent >= :completePercent', {
        completePercent: COMPLETE_PERCENT,
      })
      .andWhere('progress.updatedAt >= :startsAt', {
        startsAt: event.startsAt,
      })
      .andWhere('progress.updatedAt < :endsAt', {endsAt: event.endsAt})
      .andWhere('tag.id IN (:...tagIds)', {
        tagIds: event.tags.map((tag) => tag.id),
      })
      .getRawOne<{completed: string}>();
    return Number(result?.completed) || 0;
  }

  private async recordSeasonalEventCompletion(
    userId: string,
    eventId: string
  ): Promise<boolean> {
    const result = await this.eventCompletionsRepository
      .createQueryBuilder()
      .insert()
      .values({user: {id: userId}, event: {id: eventId}})
      .orIgnore()
      .returning('id')
      .execute();
    // TypeORM may populate `identifiers` from the attempted entity even when
    // Postgres took the ON CONFLICT path. RETURNING rows are the reliable
    // signal that this request actually inserted the ledger record.
    return Array.isArray(result.raw) && result.raw.length > 0;
  }

  private async evaluateSeasonalEvent(
    userId: string
  ): Promise<SeasonalEventUnlock | null> {
    const event = await this.seasonalEventsService.active();
    if (!event) return null;
    const completed = await this.countSeasonalEventStories(userId, event);
    if (completed < event.goal) return null;
    const newlyUnlocked = await this.recordSeasonalEventCompletion(
      userId,
      event.id
    );
    return newlyUnlocked ? {eventId: event.id, title: event.title} : null;
  }

  // Record how far a member has scrolled into a story. Validates visibility
  // first (same 404-if-not-visible guard as bookmarking), then applies the
  // thresholds above: too little to record, too much to still be "in
  // progress" (row dropped), or a genuine upsert in between.
  async set(
    userId: string,
    storyId: string,
    percent: number,
    role?: Role
  ): Promise<{eventAchievement: SeasonalEventUnlock | null}> {
    if (percent < MIN_PERCENT) return {eventAchievement: null};

    await this.storiesService.assertVisible(storyId, userId, role);

    await this.readingProgressRepository.upsert(
      {
        user: {id: userId},
        story: {id: storyId},
        percent: percent >= COMPLETE_PERCENT ? 100 : percent,
      },
      {conflictPaths: ['user', 'story']}
    );
    const eventAchievement =
      percent >= COMPLETE_PERCENT
        ? await this.evaluateSeasonalEvent(userId)
        : null;
    return {eventAchievement};
  }

  async clear(userId: string, storyId: string): Promise<void> {
    await this.readingProgressRepository.delete({
      user: {id: userId},
      story: {id: storyId},
    });
  }

  // Every story the member has in progress, most-recently-read first —
  // unbounded, like BookmarksService.bookmarkedIds: personal data expected to
  // stay small, so no pagination. Excludes stories no longer approved (e.g.
  // since unpublished/rejected) the same way the reading list does.
  async listForUser(userId: string): Promise<ReadingProgressRow[]> {
    const rows = await this.readingProgressRepository
      .createQueryBuilder('progress')
      .innerJoinAndSelect('progress.story', 'story')
      .leftJoinAndSelect('story.author', 'author')
      .leftJoinAndSelect('story.tags', 'tags')
      .where('progress.user = :userId', {userId})
      .andWhere('progress.percent < :completePercent', {
        completePercent: COMPLETE_PERCENT,
      })
      .andWhere('story.status = :status', {status: StoryStatus.Approved})
      .orderBy('progress.updatedAt', 'DESC')
      // Keep stories by soft-deleted authors, as the reading list does.
      .withDeleted()
      .getMany();

    return rows.map((row) => ({
      story: row.story,
      percent: row.percent,
      updatedAt: row.updatedAt,
    }));
  }

  async historyForUser(userId: string): Promise<ReadingProgressRow[]> {
    const rows = await this.readingProgressRepository
      .createQueryBuilder('progress')
      .innerJoinAndSelect('progress.story', 'story')
      .leftJoinAndSelect('story.author', 'author')
      .leftJoinAndSelect('story.tags', 'tags')
      .where('progress.user = :userId', {userId})
      .andWhere('progress.percent >= :completePercent', {
        completePercent: COMPLETE_PERCENT,
      })
      .andWhere('story.status = :status', {status: StoryStatus.Approved})
      .orderBy('progress.updatedAt', 'DESC')
      .take(24)
      .withDeleted()
      .getMany();

    return rows.map((row) => ({
      story: row.story,
      percent: row.percent,
      updatedAt: row.updatedAt,
    }));
  }

  async completedSeasonalEvents(userId: string) {
    const rows = await this.eventCompletionsRepository
      .createQueryBuilder('completion')
      .innerJoinAndSelect('completion.event', 'event')
      .leftJoinAndSelect('event.tags', 'tag')
      .where('completion.userId = :userId', {userId})
      .orderBy('completion.completedAt', 'DESC')
      .getMany();

    return rows.map((row) => ({
      ...this.seasonalEventsService.view(row.event),
      completedAt: row.completedAt,
    }));
  }
}
