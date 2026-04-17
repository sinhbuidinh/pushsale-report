import { Controller, Post, Get, Body, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('orders')
  async syncOrders(
    @Body('date') date?: string,
    @Body('page_begin') pageBegin?: number,
  ) {
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException({
        status: false,
        error: 'Invalid date format. Expected YYYY-MM-DD.',
      });
    }

    const result = await this.syncService.syncOrdersFromPushSale(
      date as string,
      pageBegin ? Number(pageBegin) : 1,
    );
    return {
      status: true,
      data: result,
    };
  }

  @Get('logs')
  async getLogs(@Query('page') page: number = 1, @Query('limit') limit: number = 10) {
    try {
      const result = await this.syncService.getSyncLogs(page, limit);
      return {
        status: true,
        data: result,
      };
    } catch (error) {
      return {
        status: false,
        error: error.message,
      };
    }
  }
}
