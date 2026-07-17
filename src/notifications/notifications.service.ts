import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {getPaginatedResponse, paginate} from 'src/utils/pagination';
import {Notification} from './entities/notification.entity';
import {NotificationsStream} from './notifications-stream.service';

interface ReplyNotificationInput {
  recipientId: string;
  actorName: string;
  storyId: string;
  storyTitle: string;
  commentId: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    private readonly stream: NotificationsStream
  ) {}

  async createReplyNotification(input: ReplyNotificationInput) {
    const notification = this.notificationsRepository.create({
      recipient: {id: input.recipientId},
      type: 'reply',
      actorName: input.actorName,
      storyId: input.storyId,
      storyTitle: input.storyTitle,
      commentId: input.commentId,
    });
    const saved = await this.notificationsRepository.save(notification);
    // Push a live signal to any open SSE stream for the recipient (best-effort;
    // the client also polls as a fallback).
    await this.stream.publish(input.recipientId);
    return saved;
  }

  async findAllForUser(userId: string, page: number = 1, limit: number = 20) {
    const {skip, take} = paginate(page, limit);
    const [items, total] = await this.notificationsRepository.findAndCount({
      where: {recipient: {id: userId}},
      order: {createdAt: 'DESC'},
      skip,
      take,
    });
    return getPaginatedResponse<Notification>(items, total, page, limit);
  }

  async unreadCount(userId: string) {
    return this.notificationsRepository.count({
      where: {recipient: {id: userId}, isRead: false},
    });
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
}
