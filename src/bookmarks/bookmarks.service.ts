import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {getPaginatedResponse, paginate} from 'src/utils/pagination';
import {StoriesService} from 'src/stories/stories.service';
import {StoryStatus} from 'src/stories/enums/story-status.enum';
import type {Role} from 'src/users/enums/role';
import {Story} from 'src/stories/entities/story.entity';
import {Bookmark} from './entities/bookmark.entity';

@Injectable()
export class BookmarksService {
  constructor(
    @InjectRepository(Bookmark)
    private readonly bookmarksRepository: Repository<Bookmark>,
    private readonly storiesService: StoriesService
  ) {}

  // Save a story to the member's reading list. Validates the story is visible
  // to them first (findOneVisible 404s otherwise), then upserts — the unique
  // (user, story) constraint makes a repeat bookmark a no-op rather than an
  // error, so the endpoint is idempotent.
  async add(userId: string, storyId: string, role?: Role): Promise<void> {
    await this.storiesService.findOneVisible(storyId, userId, role);

    const exists = await this.bookmarksRepository.existsBy({
      user: {id: userId},
      story: {id: storyId},
    });
    if (exists) return;

    await this.bookmarksRepository.save(
      this.bookmarksRepository.create({
        user: {id: userId},
        story: {id: storyId},
      })
    );
  }

  // Remove a bookmark. A no-op (still 204) when it wasn't bookmarked, so the
  // toggle is safe to call from an out-of-date client.
  async remove(userId: string, storyId: string): Promise<void> {
    await this.bookmarksRepository.delete({
      user: {id: userId},
      story: {id: storyId},
    });
  }

  // The member's reading list: bookmarked stories that are still approved
  // (a story pulled from the feed shouldn't resurface here), newest-saved
  // first. Loads author + tags so it serializes exactly like the public feed.
  async listForUser(userId: string, page = 1, limit = 20) {
    const {skip, take} = paginate(page, limit);

    const qb = this.bookmarksRepository
      .createQueryBuilder('bookmark')
      .innerJoinAndSelect('bookmark.story', 'story')
      .leftJoinAndSelect('story.author', 'author')
      .leftJoinAndSelect('story.tags', 'tags')
      .where('bookmark.user = :userId', {userId})
      .andWhere('story.status = :status', {status: StoryStatus.Approved})
      .orderBy('bookmark.createdAt', 'DESC')
      .skip(skip)
      .take(take)
      // Keep stories by soft-deleted authors, as the public feed does.
      .withDeleted();

    const [bookmarks, total] = await qb.getManyAndCount();
    const stories = bookmarks.map((bookmark) => bookmark.story);

    return getPaginatedResponse<Story>(stories, total, page, limit);
  }

  // The ids of every story the member has bookmarked. The client fetches this
  // once and checks membership locally, so cards and the reader can show
  // bookmark state without the hot feed query joining per-viewer.
  async bookmarkedIds(userId: string): Promise<string[]> {
    const rows = await this.bookmarksRepository
      .createQueryBuilder('bookmark')
      .select('bookmark.storyId', 'storyId')
      .where('bookmark.user = :userId', {userId})
      .getRawMany<{storyId: string}>();

    return rows.map((row) => row.storyId);
  }
}
