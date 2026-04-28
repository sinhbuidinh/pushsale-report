import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from '../products/product.entity';

@Entity()
@Index(['sync_date', 'ad_account_id'])
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
  product_item_code: string | null;

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

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
