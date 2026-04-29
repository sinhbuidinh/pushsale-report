import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { SyncStatus, SyncTriggerSource } from '@sync-project/shared';

@Entity()
export class SyncLog {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'date' })
  sync_date: string;

  @Column({
    type: 'enum',
    enum: SyncTriggerSource,
    default: SyncTriggerSource.Api,
  })
  trigger_source: SyncTriggerSource;

  @Column({
    type: 'enum',
    enum: SyncStatus,
    default: SyncStatus.Processing,
  })
  status: SyncStatus;

  @Column({ type: 'text', nullable: true })
  error_details: string;

  @Column({ default: 0 })
  synced_count: number;

  /** JSON: sync_date, pageBegin, per-page stats (page_N), optional error summary. */
  @Column({ type: 'json', nullable: true })
  data: object | null;
}
