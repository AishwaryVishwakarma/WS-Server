import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {StoriesService} from 'src/stories/stories.service';
import {Story} from 'src/stories/entities/story.entity';
import type {Role} from 'src/users/enums/role';
import {ScareVote} from './entities/scare-vote.entity';

@Injectable()
export class ScareRatingsService {
  constructor(
    @InjectRepository(ScareVote)
    private readonly votesRepository: Repository<ScareVote>,
    private readonly storiesService: StoriesService
  ) {}

  // Casts (or changes) a reader's own scare vote. Validates the story is
  // visible to the member first (findOneVisible 404s otherwise). Re-casting
  // the same value is a no-op; a genuinely different value adjusts
  // Story.scareRatingSum by the delta only — scareRatingCount only moves on
  // a brand-new vote (mirrors LikesService's increment-only-on-new-row shape).
  async castVote(
    userId: string,
    storyId: string,
    value: number,
    role?: Role
  ): Promise<void> {
    await this.storiesService.findOneVisible(storyId, userId, role);

    await this.votesRepository.manager.transaction(async (manager) => {
      // Serialize this user's vote for this story even when no row exists yet.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `scare-vote:${userId}:${storyId}`,
      ]);
      const repository = manager.getRepository(ScareVote);
      const existing = await repository.findOneBy({
        user: {id: userId},
        story: {id: storyId},
      });

      if (existing) {
        if (existing.value === value) return;
        await repository.update(existing.id, {value});
        await manager.increment(
          Story,
          {id: storyId},
          'scareRatingSum',
          value - existing.value
        );
        return;
      }

      await repository.save(
        repository.create({
          user: {id: userId},
          story: {id: storyId},
          value,
        })
      );
      await manager.increment(Story, {id: storyId}, 'scareRatingSum', value);
      await manager.increment(Story, {id: storyId}, 'scareRatingCount', 1);
    });
  }

  // Removes a reader's own vote. No-ops if none exists, mirroring
  // LikesService.unlike's affected-row check.
  async removeVote(userId: string, storyId: string): Promise<void> {
    await this.votesRepository.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `scare-vote:${userId}:${storyId}`,
      ]);
      const repository = manager.getRepository(ScareVote);
      const existing = await repository.findOneBy({
        user: {id: userId},
        story: {id: storyId},
      });
      if (!existing) return;

      await repository.delete(existing.id);
      await manager.increment(
        Story,
        {id: storyId},
        'scareRatingSum',
        -existing.value
      );
      await manager.increment(Story, {id: storyId}, 'scareRatingCount', -1);
    });
  }

  // The member's own votes, keyed by story id — fetched once so cards/reader
  // can show the reader's own vote without the hot feed query joining
  // per-viewer (mirrors LikesService.likedIds, but a value map since the
  // vote's value matters here, not just its presence).
  async myVotes(userId: string): Promise<Record<string, number>> {
    const rows = await this.votesRepository
      .createQueryBuilder('vote')
      .select('vote.storyId', 'storyId')
      .addSelect('vote.value', 'value')
      .where('vote.user = :userId', {userId})
      .getRawMany<{storyId: string; value: number}>();

    return Object.fromEntries(rows.map((row) => [row.storyId, row.value]));
  }
}
