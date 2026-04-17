import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { Product } from '../products/product.entity';
import { User } from '../users/user.entity';
import { Customer } from '../users/customer.entity';
import { ProductAdaption } from '../products/product-adaption.entity';
import { Order } from '../orders/order.entity';
import { SyncLog } from './sync-log.entity';
import { SyncLogRepository } from './sync-log.repository';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature([Product, User, Customer, ProductAdaption, Order, SyncLog])
  ],
  controllers: [SyncController],
  providers: [SyncService, SyncLogRepository],
})
export class SyncModule {}
