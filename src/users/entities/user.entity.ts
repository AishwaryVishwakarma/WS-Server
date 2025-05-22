import {Exclude} from 'class-transformer';
import {Story} from 'src/stories/entities/story.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({length: 100})
  name: string;

  @Column({unique: true})
  email: string;

  @Column({length: 255, select: false})
  @Exclude()
  password: string;

  @Column({default: false})
  isAdmin: boolean;

  @Column({default: false})
  isVerified: boolean;

  @Column({default: false})
  isBlocked: boolean;

  @Column({length: 500, nullable: true})
  profileImageUrl: string;

  @Column({length: 500, nullable: true})
  bio: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;

  @OneToMany(() => Story, (story) => story.author)
  stories: Story[];
}
