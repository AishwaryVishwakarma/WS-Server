import {User} from 'src/users/entities/user.entity';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {StoryStatus} from '../enums/story-status.enum';
import {Tag} from 'src/tags/entities/tag.entity';
import {Comment} from 'src/comments/entities/comment.entity';

@Entity()
// The public feed filters status='approved' and sorts by createdAt (newest/
// oldest) or commentCount (most-commented); these composite indexes turn those
// hot listings from a full scan + filesort into an index range scan.
@Index('IDX_story_status_createdAt', ['status', 'createdAt'])
@Index('IDX_story_status_commentCount', ['status', 'commentCount'])
@Index('IDX_story_status_viewCount', ['status', 'viewCount'])
@Index('IDX_story_status_likeCount', ['status', 'likeCount'])
export class Story {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({length: 255})
  title: string;

  @Column({length: 300})
  excerpt: string;

  @Column('mediumtext')
  content: string;

  @Column({nullable: true})
  coverImageUrl: string;

  @Column({type: 'int', default: 1})
  scareLevel: number;

  @Column({default: false})
  isFlagged: boolean;

  /** Kept in sync by the hook below; powers reading-time estimates. */
  @Column({type: 'int', default: 0})
  wordCount: number;

  /** Denormalized counter maintained by CommentsService (create/remove). */
  @Column({type: 'int', default: 0})
  commentCount: number;

  /** Denormalized read counter, bumped by StoriesService.recordView (deduped
   *  per viewer session, approved stories only, self-views excluded). */
  @Column({type: 'int', default: 0})
  viewCount: number;

  /** Denormalized like counter, maintained by LikesService (like/unlike). */
  @Column({type: 'int', default: 0})
  likeCount: number;

  @Column({
    type: 'enum',
    enum: StoryStatus,
    default: StoryStatus.Pending,
  })
  status: StoryStatus;

  @ManyToOne(() => User, (user) => user.stories, {
    onDelete: 'CASCADE',
  })
  author: User;

  @ManyToMany(() => Tag, (tag) => tag.stories, {
    cascade: true,
  })
  @JoinTable()
  tags: Tag[];

  @OneToMany(() => Comment, (comment) => comment.story)
  comments: Comment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  computeWordCount() {
    if (this.content !== undefined) {
      this.wordCount = this.content.trim()
        ? this.content.trim().split(/\s+/).length
        : 0;
    }
  }
}
