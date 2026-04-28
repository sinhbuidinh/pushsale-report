import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { ProductAdaption } from './product-adaption.entity';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductAdaption])],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
