import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  order_number: string;

  @Column()
  customer_id: number;

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
}
