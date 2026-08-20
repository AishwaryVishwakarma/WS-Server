import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {Tag} from 'src/tags/entities/tag.entity';

@Entity()
export class SeasonalEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({length: 80})
  title: string;

  @Column({length: 240})
  description: string;

  @Column({type: 'smallint'})
  goal: number;

  @Column({type: 'timestamptz'})
  startsAt: Date;

  @Column({type: 'timestamptz'})
  endsAt: Date;

  @Column({type: 'boolean', default: false})
  isPublished: boolean;

  @ManyToMany(() => Tag, {eager: true})
  @JoinTable({
    name: 'seasonal_event_tags',
    joinColumn: {name: 'eventId', referencedColumnName: 'id'},
    inverseJoinColumn: {name: 'tagId', referencedColumnName: 'id'},
  })
  tags: Tag[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
