import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { httpErrorMessage } from '../common/http-error.util';
import { MarketingSummaryService } from './marketing-summary.service';

/** Shape produced by JwtStrategy.validate(). */
interface JwtRequestUser {
  sub: number;
  username: string;
  type: string;
}

@Controller('marketing-summary')
@UseGuards(JwtAuthGuard)
export class MarketingSummaryController {
  constructor(private readonly service: MarketingSummaryService) {}

  /**
   * Per-product performance summary for one marketing user, scoped to either a
   * single date (`start_date`) or a closed date range (`start_date` ..
   * `end_date`). When `end_date` is omitted it defaults to `start_date`.
   *
   * Marketing users may only summarise their own data: the
   * `marketing_user_id` query parameter is ignored for them and forced to the
   * caller's own id.
   */
  @Get()
  async summarize(
    @Req() req: Request,
    @Query('marketing_user_id') marketingUserIdStr: string = '',
    @Query('start_date') startDate: string = '',
    @Query('end_date') endDate: string = '',
  ) {
    try {
      const caller = req.user as JwtRequestUser | undefined;

      let marketing_user_id: number;
      if (caller?.type === 'marketing') {
        marketing_user_id = caller.sub;
      } else {
        marketing_user_id = parseInt(String(marketingUserIdStr).trim(), 10);
        if (!Number.isFinite(marketing_user_id) || marketing_user_id <= 0) {
          throw new BadRequestException(
            'marketing_user_id query parameter is required',
          );
        }
      }

      const start = String(startDate || '').trim();
      const end = String(endDate || '').trim() || start;
      if (!start) {
        throw new BadRequestException(
          'start_date query parameter is required (YYYY-MM-DD)',
        );
      }
      const data = await this.service.summarize({
        marketing_user_id,
        start_date: start,
        end_date: end,
      });
      return { status: true, data };
    } catch (error) {
      return { status: false, error: httpErrorMessage(error) };
    }
  }
}
