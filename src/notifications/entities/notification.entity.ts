import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {User} from 'src/users/entities/user.entity';
import type {NotificationType} from '../notification.types';

// 'reply' — someone replied to your comment; 'comment' — someone left a
// top-level comment on your story; 'follow' — someone started following you
// (no story/comment; links to the follower's profile via actorId); 'like' —
// someone liked your story (links to the story).
@Entity()
// The bell polls unread-count (recipient + isRead) and lists the feed (recipient
// ordered by createdAt); index both beyond the recipient FK alone.
@Index('IDX_notification_recipient_isRead', ['recipient', 'isRead'])
@Index('IDX_notification_recipient_createdAt', ['recipient', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Recipient. Their notifications are removed when the account is deleted;
  // the two composite indexes below both lead with `recipient`, so per-user
  // queries (and this cascade delete) stay index-backed without a bare
  // single-column index too.
  @ManyToOne(() => User, {onDelete: 'CASCADE', nullable: false})
  recipient: User;

  @Column({type: 'varchar', length: 20, default: 'reply'})
  type: NotificationType;

  // Display fields are denormalized snapshots: the list query needs no joins
  // and a notification stays readable even if the actor or story is later
  // deleted (it's a point-in-time event, not a live view).
  @Column({length: 100})
  actorName: string;

  // The actor's id, so the client can link to their profile. Nullable only for
  // legacy rows created before it was added; new notifications always set it.
  // Deliberately `varchar(36)`, not the 'uuid' type or a real FK — these are
  // denormalized point-in-time references (see the comment above the class),
  // so a later delete of the actor/story/comment must never cascade into or
  // invalidate this row.
  @Column({type: 'varchar', length: 36, nullable: true})
  actorId: string | null;

  // Denormalized alongside actorId, same reasoning: a snapshot at
  // notification-creation time, not a live join, so it goes stale (like
  // actorId/storyId already do) if the actor later renames themselves.
  @Column({type: 'varchar', length: 100, nullable: true})
  actorSlug: string | null;

  // Story/comment context. Null for a 'follow' (which has neither) — populated
  // for 'comment'/'reply'.
  @Column({type: 'varchar', length: 36, nullable: true})
  storyId: string | null;

  @Column({type: 'varchar', length: 100, nullable: true})
  storySlug: string | null;

  @Column({type: 'varchar', length: 255, nullable: true})
  storyTitle: string | null;

  @Column({type: 'varchar', length: 36, nullable: true})
  commentId: string | null;

  // The top-level parent comment id when this notification targets a reply, so
  // the reader can expand the right thread before scrolling to it. Null for a
  // top-level comment notification (the target is itself top-level).
  @Column({type: 'varchar', length: 36, nullable: true})
  parentId: string | null;

  @Column({default: false})
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
