import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../orders/order.entity';
import { OrderDetail } from '../orders/order-detail.entity';
import { Product } from '../products/product.entity';
import { ProductAdaption } from '../products/product-adaption.entity';
import { AdsAccount } from '../users/ads-account.entity';
import { User } from '../users/user.entity';
import { FacebookAdsDailyCost } from '../sync/facebook-ads-daily-cost.entity';
import { MarketingSummaryController } from './marketing-summary.controller';
import { MarketingSummaryService } from './marketing-summary.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderDetail,
      Product,
      ProductAdaption,
      AdsAccount,
      User,
      FacebookAdsDailyCost,
    ]),
  ],
  controllers: [MarketingSummaryController],
  providers: [MarketingSummaryService],
})
export class MarketingSummaryModule {}
