import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import {
  EntityCreatedAtColumn,
  EntityUpdatedAtColumn,
} from '../common/entity-timestamps';

@Entity()
export class ProductAdaption {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  product_id: number;

  @Column({ type: 'date' })
  start_date: Date;

  @Column({ type: 'date', nullable: true })
  end_date: Date;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  cost_price: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  selling_price: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  delivery_fee: number;

  @EntityCreatedAtColumn()
  created_at: Date | null;

  @EntityUpdatedAtColumn()
  updated_at: Date | null;
}
