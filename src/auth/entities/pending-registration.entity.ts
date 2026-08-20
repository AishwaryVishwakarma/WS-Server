import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// No User exists until OTP confirmation; email uniquely identifies this row.
@Entity()
export class PendingRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({unique: true})
  email: string;

  @Column({length: 100})
  name: string;

  // bcrypt hash — never the plaintext password, even for this short-lived row.
  @Column({length: 255})
  passwordHash: string;

  // Nullable unions need an explicit TypeORM column type.
  @Column({type: 'varchar', length: 500, nullable: true})
  bio: string | null;

  // Short TTL and attempt lockout provide brute-force resistance.
  @Column({length: 64})
  codeHash: string;

  @Column()
  expiresAt: Date;

  // Resend resets attempts; MAX_VERIFY_ATTEMPTS deletes the row.
  @Column({type: 'int', default: 0})
  attempts: number;

  @CreateDateColumn()
  createdAt: Date;
}
