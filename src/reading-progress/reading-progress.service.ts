import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {StoriesService} from 'src/stories/stories.service';
import {StoryStatus} from 'src/stories/enums/story-status.enum';
import type {Role} from 'src/users/enums/role';
import {Story} from 'src/stories/entities/story.entity';
import {ReadingProgress} from './entities/reading-progress.entity';

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

@Injectable()
export class ReadingProgressService {
  constructor(
    @InjectRepository(ReadingProgress)
    private readonly readingProgressRepository: Repository<ReadingProgress>,
    private readonly storiesService: StoriesService
  ) {}

  // Record how far a member has scrolled into a story. Validates visibility
  // first (same 404-if-not-visible guard as bookmarking), then applies the
  // thresholds above: too little to record, too much to still be "in
  // progress" (row dropped), or a genuine upsert in between.
  async set(
    userId: string,
    storyId: string,
    percent: number,
    role?: Role
  ): Promise<void> {
    if (percent < MIN_PERCENT) return;

    await this.storiesService.assertVisible(storyId, userId, role);

    await this.readingProgressRepository.upsert(
      {
        user: {id: userId},
        story: {id: storyId},
        percent: percent >= COMPLETE_PERCENT ? 100 : percent,
      },
      {conflictPaths: ['user', 'story']}
    );
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
}
