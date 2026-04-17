import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Product } from './product.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
  ) {}

  @Get()
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
  ) {
    try {
      const where: any = {};
      
      if (search) {
        where.item_code = Like(`%${search}%`);
        // Note: For OR condition in TypeORM with findAndCount, 
        // you usually pass an array to 'where'.
      }

      const [data, total] = await this.productRepo.findAndCount({
        where: search ? [
          { item_code: Like(`%${search}%`) },
          { item_name: Like(`%${search}%`) }
        ] : {},
        take: limit,
        skip: (page - 1) * limit,
        order: { id: 'DESC' },
      });

      return {
        status: true,
        data: {
          data,
          total,
          page: Number(page),
          limit: Number(limit),
        },
      };
    } catch (error) {
      return {
        status: false,
        error: error.message,
      };
    }
  }
}
