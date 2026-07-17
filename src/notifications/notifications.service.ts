import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {getPaginatedResponse, paginate} from 'src/utils/pagination';
import {Notification} from './entities/notification.entity';

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
    private readonly notificationsRepository: Repository<Notification>
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
    return this.notificationsRepository.save(notification);
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
    await this.notificationsRepository
      .createQueryBuilder()
      .update()
      .set({isRead: true})
      .where('id = :id AND recipientId = :userId', {id, userId})
      .execute();
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
