import {User} from 'src/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {StoryStatus} from '../enums/story-status.enum';

@Entity()
export class Story {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({length: 255})
  title: string;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
