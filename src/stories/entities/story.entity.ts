import {User} from 'src/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
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
}
