import {User} from 'src/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import {Story} from './story.entity';
import {RecommendationFeedbackAction} from '../enums/recommendation-feedback-action.enum';

@Entity()
@Unique('IDX_recommendation_feedback_user_story', ['user', 'story'])
export class RecommendationFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, {onDelete: 'CASCADE'})
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_recommendation_feedback_user',
  })
  user: User;

  @ManyToOne(() => Story, {onDelete: 'CASCADE'})
  @JoinColumn({
    name: 'storyId',
    foreignKeyConstraintName: 'FK_recommendation_feedback_story',
  })
  story: Story;

  @Column({type: 'varchar', length: 20})
  action: RecommendationFeedbackAction;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
