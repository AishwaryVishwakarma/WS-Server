import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectQueue} from '@nestjs/bullmq';
import {InjectRepository} from '@nestjs/typeorm';
import type {Queue} from 'bullmq';
import {IsNull, LessThanOrEqual, Not, Repository} from 'typeorm';
import {Series} from './entities/series.entity';
import {User} from 'src/users/entities/user.entity';
import {SeriesSubscription} from './entities/series-subscription.entity';
import {Story} from 'src/stories/entities/story.entity';
import {Interval} from '@nestjs/schedule';
import {StoryStatus} from 'src/stories/enums/story-status.enum';
import {SERIES_NOTIFY_QUEUE} from 'src/jobs/queue.constants';
import {DURABLE_JOB_OPTIONS} from 'src/jobs/queue.options';

@Injectable()
export class SeriesService {
  constructor(
    @InjectRepository(Series)
    private readonly seriesRepository: Repository<Series>,
    @InjectRepository(SeriesSubscription)
    private readonly subscriptionsRepository: Repository<SeriesSubscription>,
    @InjectRepository(Story)
    private readonly storiesRepository: Repository<Story>,
    @InjectQueue(SERIES_NOTIFY_QUEUE)
    private readonly seriesNotifyQueue: Queue
  ) {}

  async subscribe(userId: string, seriesId: string): Promise<void> {
    await this.findOne(seriesId);
    await this.subscriptionsRepository.upsert(
      {user: {id: userId}, series: {id: seriesId}},
      {conflictPaths: ['user', 'series']}
    );
  }

  async unsubscribe(userId: string, seriesId: string): Promise<void> {
    await this.subscriptionsRepository.delete({
      user: {id: userId},
      series: {id: seriesId},
    });
  }

  async subscriptionIds(userId: string): Promise<string[]> {
    const rows = await this.subscriptionsRepository
      .createQueryBuilder('subscription')
      .select('subscription.seriesId', 'seriesId')
      .where('subscription.userId = :userId', {userId})
      .getRawMany<{seriesId: string}>();
    return rows.map((row) => row.seriesId);
  }

  async subscriptions(userId: string): Promise<Series[]> {
    const rows = await this.subscriptionsRepository.find({
      where: {user: {id: userId}},
      relations: {series: {author: true}},
      order: {createdAt: 'DESC'},
    });
    return rows.map((row) => row.series);
  }

  // Fans out onto SERIES_NOTIFY_QUEUE rather than creating notifications
  // inline: a series can have arbitrarily many subscribers, and this is
  // called from bulkUpdateStatus inside an open DB transaction — unbounded
  // per-subscriber writes there risked exhausting the connection pool on a
  // large bulk approval. Only subscriber ids are loaded (not full User
  // relations), and the queue add is the only DB-adjacent work left on this
  // path.
  async notifySubscribers(story: Story): Promise<void> {
    if (
      !story.series ||
      story.seriesNotifiedAt ||
      (story.scheduledFor && story.scheduledFor > new Date())
    )
      return;
    const subscriptions = await this.subscriptionsRepository
      .createQueryBuilder('subscription')
      .select('subscription.userId', 'userId')
      .where('subscription.seriesId = :seriesId', {seriesId: story.series.id})
      .getRawMany<{userId: string}>();

    const recipientIds = subscriptions
      .map((row) => row.userId)
      .filter((userId) => userId !== story.author.id);

    if (recipientIds.length > 0) {
      await this.seriesNotifyQueue.addBulk(
        recipientIds.map((recipientId) => ({
          name: 'series-notify',
          data: {
            recipientId,
            actorId: story.author.id,
            actorName: story.author.name,
            actorSlug: story.author.slug,
            storyId: story.id,
            storySlug: story.slug,
            storyTitle: story.title,
          },
          opts: {
            ...DURABLE_JOB_OPTIONS,
            jobId: `series-notify-${story.id}-${recipientId}`,
          },
        }))
      );
    }

    await this.storiesRepository.update(story.id, {
      seriesNotifiedAt: new Date(),
    });
  }

  @Interval(60_000)
  async notifyScheduledParts(): Promise<void> {
    const now = new Date();
    const stories = await this.storiesRepository.find({
      where: [
        {
          status: StoryStatus.Approved,
          series: Not(IsNull()),
          scheduledFor: IsNull(),
          seriesNotifiedAt: IsNull(),
        },
        {
          status: StoryStatus.Approved,
          series: Not(IsNull()),
          scheduledFor: LessThanOrEqual(now),
          seriesNotifiedAt: IsNull(),
        },
      ],
      relations: {series: true, author: true},
      take: 100,
    });
    for (const story of stories) await this.notifySubscribers(story);
  }

  // Resolves this author's series by title, creating one if they've never
  // used it before. The story editor's Series field is a single free-text
  // input — picking an existing name and typing a new one are the same
  // action here, so there's no separate "create a series" step to call
  // first.
  async findOrCreateForAuthor(author: User, title: string): Promise<Series> {
    const trimmed = title.trim();
    const existing = await this.seriesRepository.findOne({
      where: {author: {id: author.id}, title: trimmed},
    });
    if (existing) {
      return existing;
    }

    return this.seriesRepository.save(
      this.seriesRepository.create({author, title: trimmed})
    );
  }

  async findOne(id: string): Promise<Series> {
    return await this.seriesRepository
      .findOneOrFail({where: {id}, relations: ['author']})
      .catch(() => {
        throw new NotFoundException(`Series with ID ${id} not found`);
      });
  }

  // Backs the public series page — a clean cutover, not a dual id-or-slug
  // lookup, mirroring StoriesService.findOneVisibleBySlug.
  async findOneBySlug(slug: string): Promise<Series> {
    return await this.seriesRepository
      .findOneOrFail({where: {slug}, relations: ['author']})
      .catch(() => {
        throw new NotFoundException(`Series '${slug}' not found`);
      });
  }

  // The author's own series, for the story editor's "you already have"
  // hints — so retyping an exact existing title (rather than a near-miss)
  // is easy to get right — and for /me's My Series list, which shows each
  // series' story count. Eager-loads `stories` (every status, matching
  // this endpoint's existing "regardless of moderation status" scope) so
  // SeriesResponseDto can compute storyCount from it.
  async findAllByAuthor(authorId: string): Promise<Series[]> {
    return this.seriesRepository.find({
      where: {author: {id: authorId}},
      relations: ['stories'],
      order: {title: 'ASC'},
    });
  }
}
