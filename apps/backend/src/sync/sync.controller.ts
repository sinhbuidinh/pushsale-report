import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { isAxiosError } from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FacebookAdsSyncService } from './facebook-ads-sync.service';
import {
  httpErrorMessage,
  metaGraphApiErrorDetail,
} from '../common/http-error.util';
import { AdsAccount } from '../users/ads-account.entity';

const META_AD_ACCOUNT_ID_NUMERIC_RE = /^\d+$/;
const YMD_QUERY_RE = /^\d{4}-\d{2}-\d{2}$/;

@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly facebookAdsSyncService: FacebookAdsSyncService,
    @InjectRepository(AdsAccount)
    private readonly adsAccountRepo: Repository<AdsAccount>,
  ) {}

  @Post('orders')
  syncOrders(
    @Body('date') date?: string,
    @Body('page_begin') pageBegin?: number,
  ) {
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException({
        status: false,
        error: 'Invalid date format. Expected YYYY-MM-DD.',
      });
    }

    const result = this.syncService.syncOrdersFromPushSale(
      date as string,
      pageBegin ? Number(pageBegin) : 1,
    );
    return {
      status: true,
      data: result,
    };
  }

  @Get('logs')
  async getLogs(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    try {
      const result = await this.syncService.getSyncLogs(page, limit);
      return {
        status: true,
        data: result,
      };
    } catch (error: unknown) {
      return {
        status: false,
        error: httpErrorMessage(error),
      };
    }
  }

  @Get('facebook-ads/marketing-users')
  async listFacebookAdsMarketingUsers() {
    try {
      const data =
        await this.facebookAdsSyncService.listMarketingUsers();
      return { status: true, data };
    } catch (error: unknown) {
      return {
        status: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load marketing users.',
      };
    }
  }

  @Get('facebook-ads/sync-status')
  async getFacebookAdsSyncStatus(
    @Query('marketing_user_id') marketingUserIdStr?: string,
    @Query('date') date?: string,
  ) {
    const marketingUserId = Number(marketingUserIdStr);
    if (!marketingUserIdStr?.trim() || !Number.isFinite(marketingUserId)) {
      throw new BadRequestException({
        status: false,
        error: 'marketing_user_id query param is required and must be a number.',
      });
    }
    if (date && !YMD_QUERY_RE.test(date)) {
      throw new BadRequestException({
        status: false,
        error: 'Invalid date format. Expected YYYY-MM-DD.',
      });
    }
    try {
      const data =
        await this.facebookAdsSyncService.getSyncStatusForMarketingUser(
          marketingUserId,
          date,
        );
      return { status: true, data };
    } catch (error: unknown) {
      throw new BadRequestException({
        status: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to check Facebook ads sync status.',
      });
    }
  }

  @Get('facebook-ads/daily-costs')
  async getFacebookAdsDailyCosts(
    @Query('marketing_user_id') marketingUserIdStr?: string,
    @Query('date') date?: string,
  ) {
    const marketingUserId = Number(marketingUserIdStr);
    if (!marketingUserIdStr?.trim() || !Number.isFinite(marketingUserId)) {
      throw new BadRequestException({
        status: false,
        error: 'marketing_user_id query param is required and must be a number.',
      });
    }
    if (date && !YMD_QUERY_RE.test(date)) {
      throw new BadRequestException({
        status: false,
        error: 'Invalid date format. Expected YYYY-MM-DD.',
      });
    }
    try {
      const data =
        await this.facebookAdsSyncService.getDailyCostsForMarketingUser(
          marketingUserId,
          date,
        );
      return { status: true, data };
    } catch (error: unknown) {
      throw new BadRequestException({
        status: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load Facebook ads daily costs.',
      });
    }
  }

  @Post('facebook-ads/resync')
  async resyncFacebookAdsAccount(
    @Body('marketing_user_id') marketingUserIdRaw?: number | string,
    @Body('ad_account_id') adAccountId?: string,
    @Body('date') date?: string,
  ) {
    const marketingUserId = Number(marketingUserIdRaw);
    if (
      marketingUserIdRaw == null ||
      marketingUserIdRaw === '' ||
      !Number.isFinite(marketingUserId)
    ) {
      throw new BadRequestException({
        status: false,
        error: 'marketing_user_id is required and must be a number.',
      });
    }
    const accountId = adAccountId?.trim();
    if (!accountId || !META_AD_ACCOUNT_ID_NUMERIC_RE.test(accountId)) {
      throw new BadRequestException({
        status: false,
        error:
          'ad_account_id is required and must be a numeric Meta ad account id (digits only).',
      });
    }
    if (date && !YMD_QUERY_RE.test(date)) {
      throw new BadRequestException({
        status: false,
        error: 'Invalid date format. Expected YYYY-MM-DD.',
      });
    }
    try {
      const data =
        await this.facebookAdsSyncService.resyncAdAccountForMarketingUser({
          marketingUserId,
          adAccountId: accountId,
          date,
        });
      return { status: true, data };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException({
        status: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to re-sync Facebook ads data.',
      });
    }
  }

  @Post('facebook-ads/marketing-user')
  async syncFacebookAdsForMarketingUser(
    @Body('marketing_user_id') marketingUserIdRaw?: number | string,
    @Body('date') date?: string,
  ) {
    const marketingUserId = Number(marketingUserIdRaw);
    if (
      marketingUserIdRaw == null ||
      marketingUserIdRaw === '' ||
      !Number.isFinite(marketingUserId)
    ) {
      throw new BadRequestException({
        status: false,
        error: 'marketing_user_id is required and must be a number.',
      });
    }
    if (date && !YMD_QUERY_RE.test(date)) {
      throw new BadRequestException({
        status: false,
        error: 'Invalid date format. Expected YYYY-MM-DD.',
      });
    }
    try {
      const data = await this.facebookAdsSyncService.syncForMarketingUser(
        marketingUserId,
        date,
      );
      return { status: true, data };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException({
        status: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to sync Facebook ads data.',
      });
    }
  }

  @Post('facebook-ads')
  async syncFacebookAds(
    @Body('date') date?: string,
    @Body('ad_account_id') adAccountId?: string,
  ) {
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException({
        status: false,
        error: 'Invalid date format. Expected YYYY-MM-DD.',
      });
    }
    const requestedAccountId = adAccountId?.trim();
    if (
      requestedAccountId &&
      !META_AD_ACCOUNT_ID_NUMERIC_RE.test(requestedAccountId)
    ) {
      throw new BadRequestException({
        status: false,
        error:
          'Invalid ad_account_id. Expected numeric Meta ad account id (digits only).',
      });
    }
    try {
      // fetch single ads account from request body
      if (requestedAccountId) {
        const result = await this.facebookAdsSyncService.syncDailyProductCosts({
          date,
          adAccountId: requestedAccountId,
        });
        return {
          status: true,
          data: result,
        };
      }

      // fetch all ads accounts from database
      const accounts = await this.adsAccountRepo.find({
        select: ['ad_account_id'],
        order: { id: 'ASC' },
      });
      if (accounts.length === 0) {
        throw new BadRequestException({
          status: false,
          error:
            'No ad_account_id in request and no rows in ads_account. Add ad_account_id to the body or configure ads accounts.',
        });
      }

      const results: Awaited<
        ReturnType<FacebookAdsSyncService['syncDailyProductCosts']>
      >[] = [];
      for (const row of accounts) {
        const result = await this.facebookAdsSyncService.syncDailyProductCosts({
          date,
          adAccountId: row.ad_account_id,
        });
        results.push(result);
      }

      return {
        status: true,
        data: {
          accounts_synced: results.length,
          results,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException({
        status: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to sync Facebook ads data.',
      });
    }
  }

  /**
   * Query Meta ad-level insights for a single ad account and day.
   * `date` optional (defaults to yesterday in APP_TIMEZONE, same as sync).
   */
  @Get('facebook-ads/insights')
  async getFacebookAdsInsights(
    @Query('ad_account_id') adAccountId?: string,
    @Query('date') date?: string,
  ) {
    const id = adAccountId?.trim();
    if (!id || !META_AD_ACCOUNT_ID_NUMERIC_RE.test(id)) {
      throw new BadRequestException({
        status: false,
        error:
          'ad_account_id query param is required and must be a numeric Meta ad account id (digits only).',
      });
    }
    if (date && !YMD_QUERY_RE.test(date)) {
      throw new BadRequestException({
        status: false,
        error: 'Invalid date format. Expected YYYY-MM-DD.',
      });
    }

    try {
      const data =
        await this.facebookAdsSyncService.getAdInsightsForAccountAndDate({
          adAccountId: id,
          date,
        });
      return {
        status: true,
        data,
      };
    } catch (error: unknown) {
      if (isAxiosError(error) && error.response != null) {
        const detail = metaGraphApiErrorDetail(error);
        throw new HttpException(
          {
            status: false,
            error: detail.message,
            ...(detail.meta_http_status != null
              ? { meta_http_status: detail.meta_http_status }
              : {}),
            ...(detail.fbtrace_id != null
              ? { fbtrace_id: detail.fbtrace_id }
              : {}),
          },
          HttpStatus.BAD_GATEWAY,
        );
      }
      throw new BadRequestException({
        status: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch Facebook ads insights.',
      });
    }
  }
}
