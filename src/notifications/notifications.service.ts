import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {getPaginatedResponse, paginate} from 'src/utils/pagination';
import {
  Notification,
  type NotificationType,
} from './entities/notification.entity';
import {groupNotifications} from './group-notifications';
import {NotificationsStream} from './notifications-stream.service';

interface NotificationInput {
  type: NotificationType;
  recipientId: string;
  actorName: string;
  actorId: string;
  // Story/comment context — present for 'comment'/'reply', omitted for 'follow'.
  storyId?: string | null;
  storyTitle?: string | null;
  commentId?: string | null;
  // Only set for a 'reply' — the top-level thread the reply lives under.
  parentId?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    private readonly stream: NotificationsStream
  ) {}

  async createNotification(input: NotificationInput) {
    const notification = this.notificationsRepository.create({
      recipient: {id: input.recipientId},
      type: input.type,
      actorName: input.actorName,
      actorId: input.actorId,
      storyId: input.storyId ?? null,
      storyTitle: input.storyTitle ?? null,
      commentId: input.commentId ?? null,
      parentId: input.parentId ?? null,
    });
    const saved = await this.notificationsRepository.save(notification);
    // Push a live signal to any open SSE stream for the recipient (best-effort;
    // the client also polls as a fallback). The storyId lets a reader currently
    // viewing that story refresh its thread without a full reload.
    await this.stream.publish(input.recipientId, input.storyId ?? undefined);
    return saved;
  }

  // Bundles same-story/-thread notifications ("Alice, Bob and 3 others
  // replied") within the fetched page — see groupNotifications for the
  // grouping rule and its page-boundary trade-off. total/totalPages still
  // reflect the raw (ungrouped) row count: the bell has no pagination UI, so
  // nothing depends on them exactly matching the grouped item count.
  async findAllForUser(userId: string, page: number = 1, limit: number = 20) {
    const {skip, take} = paginate(page, limit);
    const [items, total] = await this.notificationsRepository.findAndCount({
      where: {recipient: {id: userId}},
      order: {createdAt: 'DESC'},
      skip,
      take,
    });
    return getPaginatedResponse(groupNotifications(items), total, page, limit);
  }

  // Counts distinct (type, storyId, parentId) groups among unread
  // notifications, not raw rows — so the badge matches how many items the
  // bell will actually show, not how many individual events fired.
  async unreadCount(userId: string) {
    const rows = await this.notificationsRepository
      .createQueryBuilder('notification')
      .select([
        'notification.type',
        'notification.storyId',
        'notification.parentId',
      ])
      .distinct(true)
      .where('notification.recipientId = :userId', {userId})
      .andWhere('notification.isRead = :isRead', {isRead: false})
      .getRawMany();
    return rows.length;
  }

  async markRead(id: string, userId: string) {
    // Scope the lookup to the caller so a missing id and someone else's
    // notification are indistinguishable — both 404 rather than silently
    // "succeeding". A row UPDATE can't tell these apart from an idempotent
    // re-read (MySQL reports 0 changed rows for both), so check existence.
    const notification = await this.notificationsRepository.findOne({
      where: {id, recipient: {id: userId}},
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (!notification.isRead) {
      notification.isRead = true;
      await this.notificationsRepository.save(notification);
    }
  }

  async markAllRead(userId: string) {
    await this.notificationsRepository
      .createQueryBuilder()
      .update()
      .set({isRead: true})
      .where('recipientId = :userId AND isRead = false', {userId})
      .execute();
  }

  async remove(id: string, userId: string) {
    // Same scoping as markRead: a missing id and someone else's notification
    // both 404 rather than silently no-op. Notifications are ephemeral, so this
    // is a hard delete.
    const notification = await this.notificationsRepository.findOne({
      where: {id, recipient: {id: userId}},
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    await this.notificationsRepository.remove(notification);
  }

  async clearRead(userId: string) {
    await this.notificationsRepository
      .createQueryBuilder()
      .delete()
      .where('recipientId = :userId AND isRead = true', {userId})
      .execute();
  }
}
