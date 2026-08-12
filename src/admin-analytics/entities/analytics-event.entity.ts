import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum AnalyticsEventType {
  StoryViewed = 'story_viewed',
  StoryStatusChanged = 'story_status_changed',
}

@Entity()
@Index('IDX_analytics_event_type_createdAt', ['type', 'createdAt'])
@Index('IDX_analytics_event_story_createdAt', ['storyId', 'createdAt'])
export class AnalyticsEvent {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({type: 'enum', enum: AnalyticsEventType})
  type: AnalyticsEventType;

  @Column({type: 'uuid', nullable: true})
  actorId: string | null;

  @Column({type: 'uuid', nullable: true})
  storyId: string | null;

  @Column({type: 'jsonb', default: {}})
  metadata: Record<string, string | number | boolean | null>;

  @CreateDateColumn() createdAt: Date;
}
