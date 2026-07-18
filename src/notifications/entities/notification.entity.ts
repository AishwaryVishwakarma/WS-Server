import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {User} from 'src/users/entities/user.entity';

// 'reply' — someone replied to your comment; 'comment' — someone left a
// top-level comment on your story.
export type NotificationType = 'reply' | 'comment';

@Entity()
// The bell polls unread-count (recipient + isRead) and lists the feed (recipient
// ordered by createdAt); index both beyond the recipient FK alone.
@Index('IDX_notification_recipient_isRead', ['recipient', 'isRead'])
@Index('IDX_notification_recipient_createdAt', ['recipient', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Recipient. Their notifications are removed when the account is deleted
  // (MySQL indexes the FK column, so per-user queries are cheap).
  @ManyToOne(() => User, {onDelete: 'CASCADE', nullable: false})
  recipient: User;

  @Column({type: 'varchar', length: 20, default: 'reply'})
  type: NotificationType;

  // Display fields are denormalized snapshots: the list query needs no joins
  // and a notification stays readable even if the actor or story is later
  // deleted (it's a point-in-time event, not a live view).
  @Column({length: 100})
  actorName: string;

  @Column('uuid')
  storyId: string;

  @Column({length: 255})
  storyTitle: string;

  @Column('uuid')
  commentId: string;

  // The top-level parent comment id when this notification targets a reply, so
  // the reader can expand the right thread before scrolling to it. Null for a
  // top-level comment notification (the target is itself top-level).
  @Column('uuid', {nullable: true})
  parentId: string | null;

  @Column({default: false})
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
