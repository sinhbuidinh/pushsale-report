import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    @Query('marketing_user_id') marketingUserIdStr: string = '',
    @Query('sale_user_id') saleUserIdStr: string = '',
  ) {
    try {
      const take = Math.min(Math.max(Number(limit) || 10, 1), 100);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      const qb = this.orderRepo
        .createQueryBuilder('o')
        .leftJoinAndSelect('o.customer', 'customer')
        .leftJoinAndSelect('o.marketing_user', 'marketing_user')
        .leftJoinAndSelect('o.sale_user', 'sale_user')
        .orderBy('o.id', 'DESC');

      if (search?.trim()) {
        qb.andWhere('o.order_number LIKE :search', { search: `%${search.trim()}%` });
      }

      if (date?.trim()) {
        const d = date.trim();
        qb.andWhere('o.created_time BETWEEN :fromDate AND :toDate', {
          fromDate: `${d} 00:00:00`,
          toDate: `${d} 23:59:59`,
        });
      }

      const marketingUserId = parseInt(String(marketingUserIdStr).trim(), 10);
      if (Number.isFinite(marketingUserId) && marketingUserId > 0) {
        qb.andWhere('o.marketing_user_id = :marketingUserId', { marketingUserId });
      }

      const saleUserId = parseInt(String(saleUserIdStr).trim(), 10);
      if (Number.isFinite(saleUserId) && saleUserId > 0) {
        qb.andWhere('o.sale_user_id = :saleUserId', { saleUserId });
      }

      const [rows, total] = await qb.skip(skip).take(take).getManyAndCount();

      const data = rows.map((o) => {
        const { customer, marketing_user, sale_user, ...rest } = o;
        return {
          ...rest,
          customer_id: customer?.id ?? null,
          customer_name: customer?.name ?? null,
          marketing_user_id: marketing_user?.id ?? null,
          marketing_user_display_name: marketing_user?.display_name ?? null,
          sale_user_id: sale_user?.id ?? null,
          sale_user_display_name: sale_user?.display_name ?? null,
        };
      });

      return {
        status: true,
        data: {
          data,
          total,
          page: Math.max(Number(page) || 1, 1),
          limit: take,
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
