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
// At or above this, the story is effectively finished — nothing to
// "continue", so the row is dropped instead of sitting at ~100 forever.
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
    await this.storiesService.findOneVisible(storyId, userId, role);

    if (percent >= COMPLETE_PERCENT) {
      await this.readingProgressRepository.delete({
        user: {id: userId},
        story: {id: storyId},
      });
      return;
    }

    if (percent < MIN_PERCENT) return;

    const existing = await this.readingProgressRepository.findOneBy({
      user: {id: userId},
      story: {id: storyId},
    });

    if (existing) {
      existing.percent = percent;
      await this.readingProgressRepository.save(existing);
      return;
    }

    await this.readingProgressRepository.save(
      this.readingProgressRepository.create({
        user: {id: userId},
        story: {id: storyId},
        percent,
      })
    );
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
}
