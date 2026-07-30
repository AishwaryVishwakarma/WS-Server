import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {Story} from './story.entity';
import {StoryStatus} from '../enums/story-status.enum';

// A snapshot of a story's content taken right before a "content changed" edit
// (see StoriesService.update) — view-only history, no restore in v1. Only
// taken for non-draft stories, so draft autosave never spams this table.
@Entity()
export class StoryRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Story, (story) => story.revisions, {
    onDelete: 'CASCADE',
  })
  story: Story;

  @Column({length: 255})
  title: string;

  @Column({length: 300})
  excerpt: string;

  @Column('mediumtext')
  content: string;

  @Column({type: 'varchar', nullable: true})
  coverImageUrl: string | null;

  // Denormalized snapshots, not relations — survive the live tags/warnings
  // changing again later, mirrors Notification's own denormalized fields.
  @Column({type: 'varchar', length: 255, default: ''})
  contentWarnings: string;

  @Column({type: 'simple-array', nullable: true})
  tagNames: string[] | null;

  @Column({type: 'enum', enum: StoryStatus})
  statusBefore: StoryStatus;

  @CreateDateColumn()
  createdAt: Date;
}
