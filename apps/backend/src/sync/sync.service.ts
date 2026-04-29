import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncLogRepository } from './sync-log.repository';
import { CronJob } from 'cron';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { Product } from '../products/product.entity';
import { User } from '../users/user.entity';
import { Customer } from '../users/customer.entity';
import { ProductAdaption } from '../products/product-adaption.entity';
import { Order } from '../orders/order.entity';
import {
  PushSaleTypeDate,
  SyncStatus,
  SyncTriggerSource,
} from '@sync-project/shared';
import {
  calendarMonthBoundsForDate,
  getAppTimeZone,
  yesterdayCalendarInZone,
} from '../common/app-timezone';
import { httpErrorMessage } from '../common/http-error.util';
import { HttpRetryService } from '../common/http-retry.service';
import { PUSHSALE_REQUEST_INTERVAL_MS } from '../common/pushsale-request-interval';
import {
  durationPartsFromMs,
  durationPartsSince,
} from '../common/duration-parts';

/**
 * If an error message contains any of these substrings (case-insensitive), {@link HttpRetryService.postJsonWithRetry} waits and retries the same request.
 */
function cloneSyncLogData(data: Record<string, unknown>): object {
  return JSON.parse(JSON.stringify(data)) as object;
}

/** Stable DATE value for TypeORM / MySQL from YYYY-MM-DD. */
function calendarStrToUtcNoonDate(s: string): Date {
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

const PUSHSALE_RETRYABLE_ERROR_SNIPPETS: readonly string[] = [
  'getaddrinfo EAI_AGAIN pushsale.vn',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNRESET',
  'ETIMEDOUT',
  'socket hang up',
  '429',
  'too many requests',
];

interface PushSaleGetOrderResponseBody {
  successful?: boolean;
  errorCode?: string;
  errorMessage?: string;
  result?: unknown[];
}

@Injectable()
export class SyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncService.name);
  private dailyCronJob: CronJob | null = null;

  constructor(
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Customer)
    private customerRepo: Repository<Customer>,
    @InjectRepository(ProductAdaption)
    private adaptionRepo: Repository<ProductAdaption>,
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
    private syncLogRepo: SyncLogRepository,
    private readonly httpRetryService: HttpRetryService,
  ) {}

  onModuleInit(): void {
    this.dailyCronJob?.stop();
    const timeZone = getAppTimeZone();
    const cronExpression =
      process.env.SYNC_CRON_EXPRESSION?.trim() || '5 0 * * *';
    this.dailyCronJob = new CronJob(
      cronExpression,
      () => void this.handleDailySync(),
      null,
      false,
      timeZone,
    );
    this.dailyCronJob.start();
  }

  onModuleDestroy(): void {
    this.dailyCronJob?.stop();
    this.dailyCronJob = null;
  }

  async handleDailySync() {
    this.logger.log('Starting automated daily PushSale sync...');
    await this.syncOrdersFromPushSale(undefined, 1, SyncTriggerSource.Cron);
    this.logger.log('Automated daily PushSale sync completed.');
  }

  async getSyncLogs(page: number = 1, limit: number = 10) {
    const [data, total] = await this.syncLogRepo.findAndCount({
      order: { created_at: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  private sleepMs(ms: number): Promise<void> {
    if (ms <= 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async syncOrdersFromPushSale(
    targetDate?: string,
    pageBegin: number = 1,
    triggerSource: SyncTriggerSource = SyncTriggerSource.Api,
  ) {
    const dateStr = targetDate || yesterdayCalendarInZone(getAppTimeZone());

    // Fire and forget
    this.runBackgroundSync(dateStr, pageBegin, triggerSource).catch((err) =>
      this.logger.error(
        `Background sync failed for ${dateStr}: ${httpErrorMessage(err)}`,
      ),
    );

    return {
      status: 'initiated',
      date: dateStr,
      pageBegin,
      trigger_source: triggerSource,
      message: 'Sync process started in the background.',
    };
  }

  private async runBackgroundSync(
    dateStr: string,
    pageBegin: number = 1,
    triggerSource: SyncTriggerSource = SyncTriggerSource.Api,
  ) {
    const clientId = process.env.PUSHSALE_CLIENT_ID || '5662';
    const apiToken = process.env.PUSHSALE_API_TOKEN || '';
    const apiUrl =
      process.env.PUSHSALE_API_URL || 'https://pushsale.vn/v1/getdata';
    const defaultPassword = await bcrypt.hash(
      process.env.DEFAULT_USER_PASSWORD || 'ChangeMe123!',
      10,
    );

    const syncLogData: Record<string, unknown> = {
      sync_date: dateStr,
      pageBegin,
    };

    const syncLog = await this.syncLogRepo.createRow({
      sync_date: dateStr,
      trigger_source: triggerSource,
      status: SyncStatus.Processing,
      synced_count: 0,
      data: cloneSyncLogData(syncLogData),
    });
    const logId = syncLog.id;

    const fromDate = `${dateStr} 00:00:00.001`;
    const toDate = `${dateStr} 23:59:59.001`;

    let pageIndex = pageBegin;
    let hasMore = true;
    let totalSynced = 0;
    const typeDate = PushSaleTypeDate.CreatedDate;

    let syncPagesRunStartedAt = 0;
    try {
      syncPagesRunStartedAt = Date.now();
      while (hasMore) {
        const currentPage = pageIndex;
        const pageHandledStartedAt = Date.now();
        this.logger.log(`Fetching page ${currentPage} for date ${dateStr}`);

        const secureToken = crypto
          .createHash('md5')
          .update(`${apiToken}_${pageIndex}_${typeDate}`)
          .digest('hex');

        const {
          response,
          durationMs,
          requestStartedAt: pageRequestStartedAt,
        } = await this.httpRetryService.postJsonWithRetry<PushSaleGetOrderResponseBody>(
          `${apiUrl}/GetOrderByConditions`,
          {
            clientId,
            secureToken,
            pageIndex,
            pageSize: 100,
            fromDate,
            toDate,
            typeDate,
            isIncludeDetail: 1,
          },
          PUSHSALE_RETRYABLE_ERROR_SNIPPETS,
        );

        const httpDur = durationPartsFromMs(durationMs);
        this.logger.log(
          `GetOrderByConditions for ${dateStr} page ${currentPage}: HTTP round-trip ${httpDur.ms} ms (${httpDur.sec} s)`,
        );

        const resData = response.data;
        if (resData && resData.successful === false) {
          throw new Error(`${resData.errorCode}: ${resData.errorMessage}`);
        }

        const results = resData?.result;

        if (!results || results.length === 0) {
          const pageDur = durationPartsSince(pageHandledStartedAt);
          this.logger.log(
            `PushSale page ${currentPage} for ${dateStr} handled in ${pageDur.ms} ms (${pageDur.sec} s); 0 orders (empty response).`,
          );
          syncLogData[`page_${currentPage}`] = {
            status: 'empty',
            records: 0,
            total_ms: pageDur.ms,
          };
          hasMore = false;
          break;
        }

        for (const orderData of results) {
          await this.processOrder(orderData, defaultPassword);
          totalSynced++;
        }

        pageIndex++;

        if (results.length < 100) {
          hasMore = false;
        }

        if (hasMore) {
          const elapsedSincePageRequest = Date.now() - pageRequestStartedAt;
          const remainingInterval =
            PUSHSALE_REQUEST_INTERVAL_MS - elapsedSincePageRequest;
          if (remainingInterval > 0) {
            this.logger.log(`Pacing before next page: ${remainingInterval} ms`);

            await this.sleepMs(remainingInterval);
          }
        }

        const pageDur = durationPartsSince(pageHandledStartedAt);
        syncLogData[`page_${currentPage}`] = {
          status: 'success',
          records: results.length,
          total_ms: pageDur.ms,
        };
        await this.syncLogRepo.updateById(logId, {
          synced_count: totalSynced,
          data: cloneSyncLogData(syncLogData),
        });
        this.logger.log(
          `PushSale page ${currentPage} for ${dateStr} handled in ${pageDur.ms} ms (${pageDur.sec} s); ${results.length} orders${hasMore ? '; pacing before next page included' : ''}.`,
        );
      }

      await this.syncLogRepo.updateById(logId, {
        status: SyncStatus.Success,
        synced_count: totalSynced,
        data: cloneSyncLogData(syncLogData),
      });

      const runDur = durationPartsSince(syncPagesRunStartedAt);
      this.logger.log(
        `PushSale sync pages for ${dateStr} finished (success or empty) in ${runDur.ms} ms (${runDur.sec} s); ${totalSynced} orders synced.`,
      );
    } catch (error) {
      const runDur = durationPartsSince(syncPagesRunStartedAt);
      this.logger.error(
        `PushSale sync pages for ${dateStr} failed after ${runDur.ms} ms (${runDur.sec} s): ${httpErrorMessage(error)}`,
      );

      syncLogData['error'] = {
        current_page: pageIndex,
        message: httpErrorMessage(error),
        total_ms: runDur.ms,
      };
      await this.syncLogRepo.updateById(logId, {
        status: SyncStatus.Failed,
        error_details: httpErrorMessage(error),
        data: cloneSyncLogData(syncLogData),
      });
    }
  }

  private async processOrder(data: any, defaultPasswordHash: string) {
    let marketing_user_id: number | null = null;
    if (data.marketingUserId > 0) {
      const u = await this.ensureUser(
        data.marketingUserName,
        data.marketingDisplayName,
        'marketing',
        defaultPasswordHash,
      );
      marketing_user_id = u.id;
    }

    let sale_user_id: number | null = null;
    if (data.saleUserId > 0) {
      const u = await this.ensureUser(
        data.saleUserName,
        data.saleDisplayName,
        'sale',
        defaultPasswordHash,
      );
      sale_user_id = u.id;
    }

    let customer = await this.customerRepo.findOne({
      where: { phone: data.customerPhone },
    });
    if (!customer) {
      customer = await this.customerRepo.save({
        name: data.customerName,
        email: data.customerEmail,
        phone: data.customerPhone,
        type: data.customerType || 'default',
      });
    }

    const productIds: number[] = [];
    const adaptionIds: number[] = [];
    const tz = getAppTimeZone();
    const { startStr, endStr, todayStr } = calendarMonthBoundsForDate(
      new Date(),
      tz,
    );
    const monthStartDate = calendarStrToUtcNoonDate(startStr);
    const monthEndDate = calendarStrToUtcNoonDate(endStr);

    for (const detail of data.details || []) {
      let product = await this.productRepo.findOne({
        where: { item_code: detail.itemCode },
      });
      if (!product) {
        product = await this.productRepo.save({
          item_code: detail.itemCode,
          item_name: detail.itemName,
          cost_price: 0,
          delivery_fee: 0,
          weight_gram: detail.weightGram || 0,
        });
      }
      productIds.push(product.id);

      // Current adaption: start_date <= today <= end_date (inclusive), in app calendar.
      let adaption = await this.adaptionRepo
        .createQueryBuilder('a')
        .where('a.product_id = :pid', { pid: product.id })
        .andWhere('a.start_date <= :today', { today: todayStr })
        .andWhere('(a.end_date IS NULL OR a.end_date >= :today)', {
          today: todayStr,
        })
        .getOne();

      if (!adaption) {
        adaption = await this.adaptionRepo.save({
          product_id: product.id,
          start_date: monthStartDate,
          end_date: monthEndDate,
          cost_price: 0,
          delivery_fee: 0,
          selling_price: detail.price || 0,
        });
      }
      adaptionIds.push(adaption.id);
    }

    const orderPayload = {
      order_number: data.orderNumber.toString(),
      customer: { id: customer.id },
      marketing_user:
        marketing_user_id != null ? { id: marketing_user_id } : null,
      sale_user: sale_user_id != null ? { id: sale_user_id } : null,
      product_adaption_ids: adaptionIds,
      product_ids: productIds,
      total_quantity: data.totalQuantity || 0,
      total_amount: data.totalAmount || 0,
      total_price: data.totalPrice || 0,
      total_deposit: data.totalDeposit || 0,
      total_discount: data.totalDiscount || 0,
      total_shipping_cost: data.totalShippingCost || 0,
      total_cod: data.totalCod || 0,
      reason_create: data.reasonToCreate,
      confirm_time: data.orderConfirmDate,
      created_time: data.createTime,
      updated_time: data.updateTime,
    };

    const existingOrder = await this.orderRepo.findOne({
      where: { order_number: orderPayload.order_number },
    });
    if (existingOrder) {
      await this.orderRepo.save({ id: existingOrder.id, ...orderPayload });
    } else {
      await this.orderRepo.save(orderPayload);
    }
  }

  private async ensureUser(
    username: string,
    displayName: string,
    type: string,
    passwordHash: string,
  ): Promise<User> {
    let user = await this.userRepo.findOne({ where: { username } });
    if (!user) {
      user = await this.userRepo.save({
        username,
        password: passwordHash,
        display_name: displayName,
        type: type,
      });
    }
    return user;
  }
}
