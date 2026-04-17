import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between } from 'typeorm';
import { Order } from './order.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
  ) {}

  @Get()
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Query('date') date: string = '',
  ) {
    try {
      const where: any = {};
      
      if (search) {
        where.order_number = Like(`%${search}%`);
      }

      if (date) {
        // Assuming created_time format from PushSale is 'YYYY-MM-DD HH:mm:ss' or similar
        // We look for anything between 'YYYY-MM-DD 00:00:00' and 'YYYY-MM-DD 23:59:59'
        where.created_time = Between(`${date} 00:00:00`, `${date} 23:59:59`);
      }

      const [data, total] = await this.orderRepo.findAndCount({
        where,
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
