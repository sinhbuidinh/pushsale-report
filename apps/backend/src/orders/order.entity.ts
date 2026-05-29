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
import { Customer } from '../users/customer.entity';
import { User } from '../users/user.entity';

@Entity()
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  order_number: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'marketing_user_id' })
  marketing_user: User | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'sale_user_id' })
  sale_user: User | null;

  @Column({ type: 'simple-array', nullable: true })
  product_adaption_ids: number[];

  @Column({ type: 'simple-array' })
  product_ids: number[];

  @Column({ type: 'int' })
  total_quantity: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  total_amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  total_price: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total_deposit: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total_discount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total_shipping_cost: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total_cod: number;

  @Column({ nullable: true })
  reason_create: string;

  @Column({ nullable: true })
  confirm_time: string;

  @Column({ nullable: true })
  created_time: string;

  @Column({ nullable: true })
  updated_time: string;

  @EntityCreatedAtColumn()
  created_at: Date | null;

  @EntityUpdatedAtColumn()
  updated_at: Date | null;
}
