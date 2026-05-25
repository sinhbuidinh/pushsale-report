import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  EntityCreatedAtColumn,
  EntityUpdatedAtColumn,
} from '../common/entity-timestamps';
import { Order } from './order.entity';

@Entity()
export class OrderDetail {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column()
  item_code: string;

  @Column()
  item_name: string;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  price: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total_price: number;

  @EntityCreatedAtColumn()
  created_at: Date | null;

  @EntityUpdatedAtColumn()
  updated_at: Date | null;
}
