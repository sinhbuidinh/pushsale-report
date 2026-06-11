import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import {
  EntityCreatedAtColumn,
  EntityUpdatedAtColumn,
} from '../common/entity-timestamps';
import { SyncStatus, SyncTriggerSource } from '@sync-project/shared';

@Entity()
export class SyncLog {
  @PrimaryGeneratedColumn()
  id: number;

  @EntityCreatedAtColumn()
  created_at: Date | null;

  @EntityUpdatedAtColumn()
  updated_at: Date | null;

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
  error_details: string | null;

  @Column({ default: 0 })
  synced_count: number;

  /** PushSale page index (1-based). Null for legacy run-level logs. */
  @Column({ type: 'int', nullable: true })
  page_no: number | null;

  /** Raw PushSale GetOrderByConditions JSON response for this page. */
  @Column({ type: 'longtext', nullable: true })
  response: string | null;

  /** JSON: per-page timing / request metadata (not the full API payload). */
  @Column({ type: 'json', nullable: true })
  data: object | null;
}
