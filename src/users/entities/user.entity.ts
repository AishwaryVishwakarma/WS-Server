import {Exclude} from 'class-transformer';
import {Story} from 'src/stories/entities/story.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {Role} from '../enums/role';
import {Comment} from 'src/comments/entities/comment.entity';
import {UserReport} from './user-report.entity';

@Entity()
// One Google identity maps to at most one account. Named + nullable-unique so
// password-only accounts (googleId NULL) coexist — MySQL permits many NULLs
// under a unique index.
@Index('IDX_user_googleId', ['googleId'], {unique: true})
// The admin reported-users queue filters reportCount > 0 and sorts by it —
// index it so the queue is a range scan, not a table scan.
@Index('IDX_user_reportCount', ['reportCount'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({length: 100})
  name: string;

  @Column({unique: true})
  email: string;

  // Nullable: OAuth-only accounts (Google sign-in) have no local password.
  // Explicit `type` because TypeORM can't infer `string | null` from reflection.
  @Column({type: 'varchar', length: 255, select: false, nullable: true})
  @Exclude()
  password: string | null;

  // The Google account subject (`sub`) once linked, else null. Uniqueness is
  // enforced by the named index on the class (IDX_user_googleId).
  @Column({type: 'varchar', length: 255, nullable: true})
  @Exclude()
  googleId: string | null;

  @Column({type: 'enum', enum: Role, default: Role.User})
  role: Role;

  @Column({default: false})
  isVerified: boolean;

  @Column({default: false})
  isBlocked: boolean;

  @Column({length: 500, nullable: true})
  profileImageUrl: string;

  @Column({length: 500, nullable: true})
  bio: string;

  // Recomputed from the user_report rows on every report/resolve (see
  // UsersService) — an orderable, drift-free mirror of the report count so the
  // admin queue can sort most-reported-first. Covers an offensive name/bio/
  // avatar — content the text filter (IsClean) can't fully catch (evasions)
  // and can't see at all (images).
  @Column({type: 'int', default: 0})
  reportCount: number;

  @OneToMany(() => Story, (story) => story.author)
  stories: Story[];

  @OneToMany(() => Comment, (comment) => comment.user)
  comments: Comment[];

  @OneToMany(() => UserReport, (report) => report.reportedUser)
  reports: UserReport[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
