import { Controller, Get, Logger, UseGuards, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './order.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { httpErrorMessage } from '../common/http-error.util';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
  ) {}

  @Get()
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Query('item_code') itemCode: string = '',
    @Query('date') date: string = '',
    @Query('confirm_date') confirmDate: string = '',
    @Query('marketing_user_id') marketingUserIdStr: string = '',
    @Query('sale_user_id') saleUserIdStr: string = '',
    @Query('confirm_status') confirmStatus: string = '',
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
        qb.andWhere('o.order_number LIKE :search', {
          search: `%${search.trim()}%`,
        });
      }

      if (itemCode?.trim()) {
        qb.andWhere('o.item_codes LIKE :itemCode', {
          itemCode: `%${itemCode.trim()}%`,
        });
      }

      if (date?.trim()) {
        const d = date.trim();
        qb.andWhere('o.created_time BETWEEN :fromDate AND :toDate', {
          fromDate: `${d}T00:00:00.000`,
          toDate: `${d}T23:59:59.999`,
        });
      }

      if (confirmDate?.trim()) {
        qb.andWhere('SUBSTRING(o.confirm_time, 1, 10) = :confirmDate', {
          confirmDate: confirmDate.trim(),
        });
      }

      const marketingUserId = parseInt(String(marketingUserIdStr).trim(), 10);
      if (Number.isFinite(marketingUserId) && marketingUserId > 0) {
        qb.andWhere('o.marketing_user_id = :marketingUserId', {
          marketingUserId,
        });
      }

      const saleUserId = parseInt(String(saleUserIdStr).trim(), 10);
      if (Number.isFinite(saleUserId) && saleUserId > 0) {
        qb.andWhere('o.sale_user_id = :saleUserId', { saleUserId });
      }

      const confirmStatusNorm = String(confirmStatus).trim().toLowerCase();
      if (confirmStatusNorm === 'confirmed') {
        qb.andWhere('o.confirm_time IS NOT NULL');
      } else if (confirmStatusNorm === 'unconfirmed') {
        qb.andWhere('o.confirm_time IS NULL');
      }

      const pagedQb = qb.skip(skip).take(take);
      this.logger.log(
        `findAll query params: page=${page}, limit=${limit}, search=${search}, date=${date}, confirm_date=${confirmDate}, marketing_user_id=${marketingUserIdStr}, sale_user_id=${saleUserIdStr}`,
      );
      this.logger.log(`findAll SQL: ${pagedQb.getSql()}`);
      this.logger.log(
        `findAll parameters: ${JSON.stringify(pagedQb.getParameters())}`,
      );

      const [rows, total] = await pagedQb.getManyAndCount();

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
    } catch (error: unknown) {
      return {
        status: false,
        error: httpErrorMessage(error),
      };
    }
  }
}
