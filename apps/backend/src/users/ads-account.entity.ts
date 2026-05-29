import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import {
  EntityCreatedAtColumn,
  EntityUpdatedAtColumn,
} from '../common/entity-timestamps';
import { User } from './user.entity';

/** Links Meta ad accounts to a marketing user (user.type === 'marketing'). */
@Entity('ads_account')
@Index(['user_id'])
@Unique(['ad_account_id'])
export class AdsAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** Facebook ad account id (digits only in UI; store as string). */
  @Column({ type: 'varchar', length: 64 })
  ad_account_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ad_account_name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  owner_name: string | null;

  @EntityCreatedAtColumn()
  created_at: Date | null;

  @EntityUpdatedAtColumn()
  updated_at: Date | null;
}
