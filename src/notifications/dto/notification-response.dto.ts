import {Expose} from 'class-transformer';
import type {NotificationType} from '../entities/notification.entity';

/**
 * [private] — a recipient's own notification, possibly a bundle of several
 * (see groupNotifications). `id`/`actorName`/`commentId`/`createdAt` etc.
 * describe the newest member, so a single-item bundle behaves exactly like
 * the old one-row-per-event shape. `ids`/`actorNames`/`count` are new,
 * additive fields for the bundled case: `ids` is every underlying
 * notification's id (mark-read/delete act on all of them), `actorNames` is
 * every distinct actor (for "Alice, Bob and 3 others …" phrasing), and
 * `count` is the raw number of underlying events (may exceed
 * actorNames.length if one actor triggered it more than once).
 */
export class NotificationResponseDto {
  @Expose() id: string;
  @Expose() ids: string[];
  @Expose() type: NotificationType;
  @Expose() actorName: string;
  @Expose() actorNames: string[];
  @Expose() count: number;
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
