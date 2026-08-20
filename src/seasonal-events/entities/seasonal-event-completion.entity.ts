import {
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import {User} from 'src/users/entities/user.entity';
import {SeasonalEvent} from './seasonal-event.entity';

@Entity()
@Unique('UQ_seasonal_event_completion_user_event', ['user', 'event'])
export class SeasonalEventCompletion {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => User, {nullable: false, onDelete: 'CASCADE'}) user: User;
  @ManyToOne(() => SeasonalEvent, {nullable: false, onDelete: 'CASCADE'})
  event: SeasonalEvent;
  @CreateDateColumn() completedAt: Date;
}
