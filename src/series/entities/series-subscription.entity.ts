import {User} from 'src/users/entities/user.entity';
import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import {Series} from './series.entity';

@Entity()
@Unique('IDX_series_subscription_user_series', ['user', 'series'])
@Index('IDX_series_subscription_series', ['series'])
export class SeriesSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, {onDelete: 'CASCADE'})
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_series_subscription_user',
  })
  user: User;

  @ManyToOne(() => Series, {onDelete: 'CASCADE'})
  @JoinColumn({
    name: 'seriesId',
    foreignKeyConstraintName: 'FK_series_subscription_series',
  })
  series: Series;

  @CreateDateColumn()
  createdAt: Date;
}
