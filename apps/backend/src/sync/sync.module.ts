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
import { FacebookAdsDailyCost } from './facebook-ads-daily-cost.entity';
import { FacebookAdsSyncService } from './facebook-ads-sync.service';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature([
      Product,
      User,
      Customer,
      ProductAdaption,
      Order,
      SyncLog,
      FacebookAdsDailyCost,
    ])
  ],
  controllers: [SyncController],
  providers: [SyncService, SyncLogRepository, FacebookAdsSyncService],
})
export class SyncModule {}
