import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import {
  EntityCreatedAtColumn,
  EntityUpdatedAtColumn,
} from '../common/entity-timestamps';

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  item_code: string;

  @Column()
  item_name: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  cost_price: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  selling_price: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  delivery_fee: number;

  /** VAT percentage applied to this product, e.g. 6.5, 8.5. */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  tax_value: number;

  @Column({ type: 'int', default: 0 })
  weight_gram: number;

  @EntityCreatedAtColumn()
  created_at: Date | null;

  @EntityUpdatedAtColumn()
  updated_at: Date | null;
}
