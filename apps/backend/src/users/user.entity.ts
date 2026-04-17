import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column({ nullable: true })
  password?: string;

  @Column()
  display_name: string;

  @Column()
  type: string; // 'admin' | 'marketing' | 'sale'
}
