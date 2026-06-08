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
   * Only `admin` and `marketing` callers may use this endpoint.
   * - `marketing`: always their own summary (`marketing_user_id` is ignored).
   * - `admin` + `marketing_user_id=all`: combined totals for every marketer.
   * - `admin` + positive `marketing_user_id`: that user's full summary.
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
      if (!caller || (caller.type !== 'admin' && caller.type !== 'marketing')) {
        throw new BadRequestException('Access denied');
      }

      const start = String(startDate || '').trim();
      const end = String(endDate || '').trim() || start;
      if (!start) {
        throw new BadRequestException(
          'start_date query parameter is required (YYYY-MM-DD)',
        );
      }

      if (caller.type === 'marketing') {
        const data = await this.service.summarize({
          marketing_user_id: caller.sub,
          start_date: start,
          end_date: end,
        });
        return { status: true, data };
      }

      const idParam = String(marketingUserIdStr).trim().toLowerCase();
      if (idParam === 'all') {
        const data = await this.service.summarizeAll(start, end);
        return { status: true, data };
      }

      const marketing_user_id = parseInt(idParam, 10);
      if (!Number.isFinite(marketing_user_id) || marketing_user_id <= 0) {
        throw new BadRequestException(
          'marketing_user_id query parameter is required (positive integer or "all")',
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
