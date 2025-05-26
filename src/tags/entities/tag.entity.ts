import {Story} from 'src/stories/entities/story.entity';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class Tag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({length: 20, unique: true})
  name: string;

  @ManyToMany(() => Story, (story) => story.tags)
  stories: Story[];

  @BeforeInsert()
  @BeforeUpdate()
  normalizeName() {
    if (this.name) {
      this.name = this.name.trim().toLowerCase();
    }
  }
}
