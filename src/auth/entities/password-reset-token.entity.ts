import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {User} from 'src/users/entities/user.entity';

// A reset link's token is only ever stored hashed (SHA-256) here — mirrors
// why User.password is bcrypt-hashed, never reversible even if this row
// leaks. PasswordResetService keeps at most one live row per user: requesting
// a fresh link or consuming one deletes the rest, so an old link can never
// be replayed alongside a newer one.
@Entity()
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, {onDelete: 'CASCADE', nullable: false})
  user: User;

  @Column({length: 64, unique: true})
  tokenHash: string;

  @Column()
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
