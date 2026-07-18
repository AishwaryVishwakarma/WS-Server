import {Expose} from 'class-transformer';
import type {NotificationType} from '../entities/notification.entity';

/**
 * [private] — a recipient's own notification.
 */
export class NotificationResponseDto {
  @Expose() id: string;
  @Expose() type: NotificationType;
  @Expose() actorName: string;
  @Expose() storyId: string;
  @Expose() storyTitle: string;
  @Expose() commentId: string;
  @Expose() parentId: string | null;
  @Expose() isRead: boolean;
  @Expose() createdAt: Date;

  constructor(partial: Partial<NotificationResponseDto>) {
    Object.assign(this, partial);
  }
}
