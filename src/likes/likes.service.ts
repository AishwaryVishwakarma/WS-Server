import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {StoriesService} from 'src/stories/stories.service';
import {Story} from 'src/stories/entities/story.entity';
import type {Role} from 'src/users/enums/role';
import {StoryLike} from './entities/story-like.entity';

@Injectable()
export class LikesService {
  constructor(
    @InjectRepository(StoryLike)
    private readonly likesRepository: Repository<StoryLike>,
    private readonly storiesService: StoriesService
  ) {}

  // Like a story. Validates it's visible to the member (findOneVisible 404s
  // otherwise), then upserts — the unique (user, story) constraint makes a
  // repeat like a no-op, so the endpoint is idempotent and the denormalized
  // story.likeCount only moves on a genuinely new like (mirrors commentCount).
  async like(userId: string, storyId: string, role?: Role): Promise<void> {
    await this.storiesService.findOneVisible(storyId, userId, role);

    const exists = await this.likesRepository.existsBy({
      user: {id: userId},
      story: {id: storyId},
    });
    if (exists) return;

    await this.likesRepository.save(
      this.likesRepository.create({
        user: {id: userId},
        story: {id: storyId},
      })
    );
    await this.likesRepository.manager.increment(
      Story,
      {id: storyId},
      'likeCount',
      1
    );
  }

  // Remove a like. Decrements the counter only when a row was actually deleted,
  // so a repeat unlike is a safe no-op.
  async unlike(userId: string, storyId: string): Promise<void> {
    const result = await this.likesRepository.delete({
      user: {id: userId},
      story: {id: storyId},
    });
    if (result.affected) {
      await this.likesRepository.manager.decrement(
        Story,
        {id: storyId},
        'likeCount',
        1
      );
    }
  }

  // The ids of stories the member has liked — fetched once so cards/reader can
  // show like state without the hot feed query joining per-viewer.
  async likedIds(userId: string): Promise<string[]> {
    const rows = await this.likesRepository
      .createQueryBuilder('like')
      .select('like.storyId', 'storyId')
      .where('like.user = :userId', {userId})
      .getRawMany<{storyId: string}>();

    return rows.map((row) => row.storyId);
  }
}
