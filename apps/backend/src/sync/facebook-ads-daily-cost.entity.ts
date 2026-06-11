import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import {
  EntityCreatedAtColumn,
  EntityUpdatedAtColumn,
} from '../common/entity-timestamps';
import { Product } from '../products/product.entity';

@Entity()
@Index(
  'UQ_ad_account_daily_spend_for_product',
  ['sync_date', 'ad_account_id', 'product_id', 'product_code'],
  { unique: true },
)
@Index(['sync_date', 'product_id'])
export class FacebookAdsDailyCost {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  sync_date: string;

  @Column()
  ad_account_id: string;

  @Column({ type: 'int', nullable: true })
  product_id: number | null;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  product_code: string | null;

  /** Member product IDs when spend is attributed to a multi-item_code campaign group. */
  @Column({ type: 'simple-array', nullable: true })
  product_ids: number[] | null;

  /** Normalized sorted item_code key for multi-product campaign groups. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  campaign_group_key: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  spend: number;

  @Column({ default: 'VND' })
  currency: string;

  @Column({ type: 'int', default: 0 })
  matched_ads_count: number;

  @Column({ type: 'int', default: 0 })
  unmatched_ads_count: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @EntityCreatedAtColumn()
  created_at: Date | null;

  @EntityUpdatedAtColumn()
  updated_at: Date | null;
}
