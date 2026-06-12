import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';
import { EntityCreatedAtColumn } from '../common/entity-timestamps';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  user_id: number;

  @Index({ unique: true })
  @Column({ length: 64 })
  token_hash: string;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  revoked_at: Date | null;

  @EntityCreatedAtColumn()
  created_at: Date | null;
}
