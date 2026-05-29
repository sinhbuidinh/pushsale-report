import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import {
  EntityCreatedAtColumn,
  EntityUpdatedAtColumn,
} from '../common/entity-timestamps';

/**
 * One row per (sync_date, ad_account_id): raw Meta ad-level insights response
 * and the request parameters used (secrets redacted at write time).
 */
@Entity({ name: 'facebook_ads_insights_snapshot' })
@Index('UQ_fb_insights_snapshot_sync_account', ['sync_date', 'ad_account_id'], {
  unique: true,
})
export class FacebookAdsInsightsSnapshot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  sync_date: string;

  @Column()
  ad_account_id: string;

  @Column({ type: 'json' })
  request_params: Record<string, unknown>;

  /** Full list of insight objects as returned by Graph (merged across pages). */
  @Column({ type: 'json' })
  response: unknown[];

  @EntityCreatedAtColumn()
  created_at: Date | null;

  @EntityUpdatedAtColumn()
  updated_at: Date | null;
}
