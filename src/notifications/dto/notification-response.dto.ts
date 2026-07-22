import {Expose} from 'class-transformer';
import type {NotificationType} from '../entities/notification.entity';

/**
 * [private] — a recipient's own notification.
 */
export class NotificationResponseDto {
  @Expose() id: string;
  @Expose() type: NotificationType;
  @Expose() actorName: string;
  @Expose() actorId: string | null;
  @Expose() storyId: string | null;
  @Expose() storyTitle: string | null;
  @Expose() commentId: string | null;
  @Expose() parentId: string | null;
  @Expose() isRead: boolean;
  @Expose() createdAt: Date;

  constructor(partial: Partial<NotificationResponseDto>) {
    Object.assign(this, partial);
  }
}
