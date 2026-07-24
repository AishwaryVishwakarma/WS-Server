import {
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import {User} from './user.entity';

// A single member flagging another member's profile (name/bio/avatar) as
// offensive. The unique constraint keeps one person from inflating a target's
// report count; UsersService derives the count from these rows for the admin
// moderation queue. Mirrors CommentReport/StoryReport.
@Entity()
@Unique(['reporter', 'reportedUser'])
export class UserReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.reports, {
    onDelete: 'CASCADE',
  })
  reportedUser: User;

  @ManyToOne(() => User, {
    onDelete: 'CASCADE',
  })
  reporter: User;

  @CreateDateColumn()
  createdAt: Date;
}
