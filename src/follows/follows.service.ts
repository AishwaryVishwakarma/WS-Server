import {BadRequestException, Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {getPaginatedResponse} from 'src/utils/pagination';
import {StoriesService} from 'src/stories/stories.service';
import {UsersService} from 'src/users/users.service';
import {NotificationsService} from 'src/notifications/notifications.service';
import {Follow} from './entities/follow.entity';

@Injectable()
export class FollowsService {
  constructor(
    @InjectRepository(Follow)
    private readonly followsRepository: Repository<Follow>,
    private readonly usersService: UsersService,
    private readonly storiesService: StoriesService,
    private readonly notificationsService: NotificationsService
  ) {}

  // Follow an author. Validates the target exists (findOne 404s otherwise) and
  // rejects self-follows; the unique (follower, following) constraint makes a
  // repeat follow a no-op, so the endpoint is idempotent — and only a genuinely
  // new follow notifies the author.
  async follow(followerId: string, targetId: string): Promise<void> {
    if (followerId === targetId) {
      throw new BadRequestException('You cannot follow yourself');
    }
    await this.usersService.findOne(targetId);

    const exists = await this.followsRepository.existsBy({
      follower: {id: followerId},
      following: {id: targetId},
    });
    if (exists) return;

    await this.followsRepository.save(
      this.followsRepository.create({
        follower: {id: followerId},
        following: {id: targetId},
      })
    );

    // Notify the followed author (best-effort). A follow carries no story/
    // comment — it links to the follower's profile via actorId.
    const follower = await this.usersService.findOne(followerId);
    await this.notificationsService.createNotification({
      type: 'follow',
      recipientId: targetId,
      actorName: follower.name,
      actorId: followerId,
    });
  }

  // Unfollow. A no-op (still 204) when not following, so the toggle is safe
  // from a stale client.
  async unfollow(followerId: string, targetId: string): Promise<void> {
    await this.followsRepository.delete({
      follower: {id: followerId},
      following: {id: targetId},
    });
  }

  // The author ids a member follows — fetched once so the client can show
  // follow state on profiles/cards without per-view joins.
  async followingIds(userId: string): Promise<string[]> {
    const rows = await this.followsRepository
      .createQueryBuilder('follow')
      .select('follow.followingId', 'followingId')
      .where('follow.follower = :userId', {userId})
      .getRawMany<{followingId: string}>();

    return rows.map((row) => row.followingId);
  }

  // Public counts for an author's profile: how many follow them, how many they
  // follow.
  async stats(userId: string): Promise<{followers: number; following: number}> {
    const [followers, following] = await Promise.all([
      this.followsRepository.countBy({following: {id: userId}}),
      this.followsRepository.countBy({follower: {id: userId}}),
    ]);
    return {followers, following};
  }

  // The Following feed: approved stories by the authors this member follows,
  // newest first. Short-circuits when they follow nobody (an empty IN () is
  // invalid SQL, and there's nothing to fetch anyway).
  async feed(userId: string, page = 1, limit = 20) {
    const authorIds = await this.followingIds(userId);
    if (authorIds.length === 0) {
      return getPaginatedResponse([], 0, page, limit);
    }
    return this.storiesService.findApprovedByAuthorIds(authorIds, page, limit);
  }
}
