import {User} from 'src/users/entities/user.entity';
import {Story} from 'src/stories/entities/story.entity';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import {buildSlug} from 'src/utils/slug';

// An author's own ordered grouping of their stories (e.g. "Part 1", "Part
// 2"). Created implicitly the first time a story is saved with a new series
// title (see SeriesService.findOrCreateForAuthor) — there is no standalone
// create/rename/delete endpoint in v1. Unmoderated: it's just a label an
// author picks for their own work, the same trust level as a story's own
// title, not a public vocabulary like tags.
@Entity()
@Unique(['author', 'title'])
export class Series {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({length: 100})
  title: string;

  // Derived from title on creation. There's no rename endpoint for a series
  // (see findOrCreateForAuthor above), so unlike Story/User this never needs
  // to regenerate later.
  @Column({length: 100, unique: true})
  slug: string;

  @ManyToOne(() => User, (user) => user.seriesList, {onDelete: 'CASCADE'})
  author: User;

  @OneToMany(() => Story, (story) => story.series)
  stories: Story[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @BeforeInsert()
  assignSlug() {
    if (!this.slug) {
      this.slug = buildSlug(this.title, 'series');
    }
  }
}
