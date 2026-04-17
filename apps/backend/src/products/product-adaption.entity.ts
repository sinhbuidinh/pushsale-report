import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

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
}
